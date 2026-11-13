import { Router, type Request, type Response } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import type { Book } from './book.js';

const statuses = ['want-to-read', 'reading', 'read'] as const;
type Status = (typeof statuses)[number];
interface Entry {
  isbn: string;
  status: Status;
  position: number;
  book: Book;
}

class InvalidChange extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
  }
}

export function readingListRouter(database: DatabaseSync): Router {
  const router = Router();
  const read = (): Entry[] =>
    database
      .prepare(
        `
    SELECT b.*, r.status, r.position FROM reading_list r JOIN books b ON b.isbn = r.isbn
    ORDER BY CASE r.status WHEN 'want-to-read' THEN 0 WHEN 'reading' THEN 1 ELSE 2 END, r.position, r.isbn
  `
      )
      .all()
      .map(row => {
        const { status, position, ...book } = row;
        return {
          isbn: String(book['isbn']),
          status: status as Status,
          position: Number(position),
          book: book as unknown as Book
        };
      });

  // All read/modify/write operations hold the SQLite write lock, including validation.
  const change = (operation: (req: Request) => number) => (req: Request, res: Response) => {
    database.exec('BEGIN IMMEDIATE');
    try {
      const status = operation(req);
      const entries = read();
      database.exec('COMMIT');
      res.status(status).json(entries);
    } catch (error) {
      database.exec('ROLLBACK');
      if (error instanceof InvalidChange) res.status(error.status).json({ error: error.message });
      else throw error;
    }
  };
  const normalize = (entries: Entry[]) => {
    const update = database.prepare('UPDATE reading_list SET status = ?, position = ? WHERE isbn = ?');
    for (const status of statuses)
      entries.filter(e => e.status === status).forEach((entry, position) => update.run(status, position, entry.isbn));
  };
  const find = (isbn: string) => {
    const entries = read();
    const entry = entries.find(e => e.isbn === isbn);
    if (!entry) throw new InvalidChange(404, 'Buch ist nicht in der Leseliste.');
    return { entries, entry };
  };

  router.get('/', (_req, res) => res.json(read()));
  router.post(
    '/',
    change(req => {
      const body: unknown = req.body;
      if (
        typeof body !== 'object' ||
        body === null ||
        Array.isArray(body) ||
        !('isbn' in body) ||
        typeof body.isbn !== 'string' ||
        !body.isbn.trim()
      )
        throw new InvalidChange(400, 'Eine ISBN ist erforderlich.');
      const isbn = body.isbn;
      if (!database.prepare('SELECT 1 FROM books WHERE isbn = ?').get(isbn))
        throw new InvalidChange(404, 'Buch nicht gefunden.');
      if (database.prepare('SELECT 1 FROM reading_list WHERE isbn = ?').get(isbn)) return 200;
      const position = database
        .prepare("SELECT COUNT(*) AS count FROM reading_list WHERE status = 'want-to-read'")
        .get()!['count'];
      database
        .prepare("INSERT INTO reading_list (isbn, status, position) VALUES (?, 'want-to-read', ?)")
        .run(isbn, position!);
      return 201;
    })
  );
  router.put(
    '/:isbn',
    change(req => {
      const body: unknown = req.body;
      if (
        typeof body !== 'object' ||
        body === null ||
        Array.isArray(body) ||
        !('status' in body) ||
        !('position' in body) ||
        !statuses.includes(body.status as Status) ||
        typeof body.position !== 'number' ||
        !Number.isSafeInteger(body.position) ||
        body.position < 0
      ) {
        throw new InvalidChange(400, 'Gültiger Lesestatus und eine nichtnegative ganze Position sind erforderlich.');
      }
      const { entries, entry } = find(String(req.params['isbn']));
      const remainder = entries.filter(e => e.isbn !== entry.isbn);
      const column = remainder.filter(e => e.status === body.status);
      if (body.position > column.length) throw new InvalidChange(400, 'Position liegt außerhalb der Spalte.');
      column.splice(body.position, 0, { ...entry, status: body.status as Status });
      normalize([...remainder.filter(e => e.status !== body.status), ...column]);
      return 200;
    })
  );
  router.delete(
    '/:isbn',
    change(req => {
      const { entries, entry } = find(String(req.params['isbn']));
      database.prepare('DELETE FROM reading_list WHERE isbn = ?').run(entry.isbn);
      normalize(entries.filter(e => e.isbn !== entry.isbn));
      return 200;
    })
  );
  return router;
}
