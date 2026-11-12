import express, { type ErrorRequestHandler } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import { isBook, type Book } from './book.js';
import { CoverCache } from './cover-cache.js';

const columns = 'id, isbn, title, subtitle, author, publisher, "numPages", price, cover, abstract, "userId"';

export function createApp(
  database: DatabaseSync,
  allowedOrigins = ['http://localhost:4200', 'http://127.0.0.1:4200'],
  coverCache = new CoverCache(database)
) {
  const app = express();
  app.disable('x-powered-by');
  app.set('query parser', 'extended');
  app.use((req, res, next) => {
    res.vary('Origin');
    const origin = req.get('Origin');
    if (origin && allowedOrigins.includes(origin)) {
      res.set('Access-Control-Allow-Origin', origin);
      res.set('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
      res.set('Access-Control-Allow-Headers', 'Content-Type');
    }
    res.set('Cache-Control', 'no-store');
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });
  app.use(express.json({ limit: '128kb' }));

  app.get('/covers', async (req, res) => {
    const source = req.query['url'];
    if (typeof source !== 'string' || source.length > 2048) {
      res.status(400).json({ error: 'Eine gültige Cover-URL ist erforderlich.' });
      return;
    }
    const cover = await coverCache.get(source);
    if (cover.status === 200) {
      res.set('Cache-Control', 'public, max-age=86400');
      res.set('X-Content-Type-Options', 'nosniff');
      res.type(cover.contentType).send(cover.data);
    } else {
      res.set('Retry-After', String(cover.retryAfter));
      if (cover.status === 404) res.set('Cache-Control', 'public, max-age=300');
      res.status(cover.status).end();
    }
  });

  app.get('/health', async (_req, res) => {
    try {
      database.prepare('SELECT 1').get();
      res.json({ status: 'ok' });
    } catch {
      res.status(503).json({ error: 'Datenbank nicht erreichbar.' });
    }
  });

  app.get('/books', async (req, res) => {
    const { q, _limit: limit } = req.query;
    if (
      (q !== undefined && (typeof q !== 'string' || q.length > 500)) ||
      (limit !== undefined &&
        (typeof limit !== 'string' || !/^\d+$/.test(limit) || !Number.isSafeInteger(Number(limit))))
    ) {
      res
        .status(400)
        .json({ error: 'q muss ein Text (maximal 500 Zeichen), _limit eine nichtnegative ganze Zahl sein.' });
      return;
    }
    const result = database
      .prepare(
        `SELECT ${columns} FROM books
       WHERE instr(fold(title || ' ' || subtitle || ' ' || author || ' ' || publisher || ' ' || abstract || ' ' || isbn), fold(?)) > 0
       ORDER BY id COLLATE BINARY LIMIT ?`
      )
      .all(typeof q === 'string' ? q.trim() : '', limit === undefined ? -1 : Number(limit));
    res.json(result);
  });

  app.get('/books/:isbn', async (req, res) => {
    const book = database.prepare(`SELECT ${columns} FROM books WHERE isbn = ?`).get(req.params['isbn']!);
    if (!book) {
      res.status(404).json({ error: 'Buch nicht gefunden.' });
      return;
    }
    res.json(book);
  });

  app.put('/books/:isbn', async (req, res) => {
    const isbn = req.params['isbn']!;
    const original = database.prepare(`SELECT ${columns} FROM books WHERE isbn = ?`).get(isbn) as unknown as
      | Book
      | undefined;
    if (!original) {
      res.status(404).json({ error: 'Buch nicht gefunden.' });
      return;
    }
    const book: unknown = req.body;
    if (!isBook(book)) {
      res.status(400).json({
        error:
          'Vollständiges Buch erforderlich: Titel und Autor dürfen nicht leer sein, numPages muss eine positive ganze Zahl und price ein String sein.'
      });
      return;
    }
    if (book.isbn !== isbn || book.id !== original.id || book.userId !== original.userId) {
      res.status(409).json({ error: 'ISBN, id und userId dürfen nicht geändert werden.' });
      return;
    }
    const result = database
      .prepare(
        `UPDATE books SET title = ?, subtitle = ?, author = ?, publisher = ?,
       "numPages" = ?, price = ?, cover = ?, abstract = ?
       WHERE isbn = ? RETURNING ${columns}`
      )
      .get(
        book.title,
        book.subtitle ?? '',
        book.author,
        book.publisher,
        book.numPages,
        book.price,
        book.cover,
        book.abstract,
        isbn
      );
    res.json(result);
  });

  app.use((_req, res) => res.status(404).json({ error: 'Route nicht gefunden.' }));
  const handleError: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
    const status = typeof error === 'object' && error !== null && 'status' in error ? error.status : undefined;
    if (status === 400 || error instanceof URIError) {
      res.status(400).json({ error: 'Ungültige Anfrage oder ungültiges JSON.' });
    } else if (status === 413) {
      res.status(413).json({ error: 'Anfrage ist zu groß.' });
    } else {
      console.error('Datenbankanfrage fehlgeschlagen:', error);
      res.status(503).json({ error: 'Bücher konnten nicht verarbeitet werden. Bitte erneut versuchen.' });
    }
  };
  app.use(handleError);
  return app;
}
