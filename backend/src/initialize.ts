import { readFile } from 'node:fs/promises';
import type { DatabaseSync } from 'node:sqlite';
import { isBook, type Book } from './book.js';

export async function initializeDatabase(database: DatabaseSync): Promise<number> {
  const raw: unknown = JSON.parse(await readFile(new URL('../data/books.json', import.meta.url), 'utf8'));
  if (!Array.isArray(raw) || !raw.every(isBook)) throw new Error('Ungültiger Buch-Startbestand.');
  const books: Book[] = raw;
  if (
    new Set(books.map(book => book.isbn)).size !== books.length ||
    new Set(books.map(book => book.id)).size !== books.length
  ) {
    throw new Error('Der Buch-Startbestand enthält doppelte ISBNs oder IDs.');
  }
  const schema = await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8');
  // Serialize writers before table creation and seed insertion.
  database.exec('BEGIN IMMEDIATE');
  try {
    database.exec(schema);
    const columns = database.prepare('PRAGMA table_info(books)').all();
    if (!columns.some(column => column['name'] === 'publicationDate')) {
      database.exec("ALTER TABLE books ADD COLUMN publicationDate text NOT NULL DEFAULT ''");
    }
    const insert = database.prepare(
      `INSERT INTO books (id, isbn, title, subtitle, author, publisher, "numPages", price, cover, abstract, "userId", publicationDate)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (isbn) DO NOTHING`
    );
    let inserted = 0;
    for (const book of books) {
      const result = insert.run(
        book.id,
        book.isbn,
        book.title,
        book.subtitle ?? '',
        book.author,
        book.publisher,
        book.numPages,
        book.price,
        book.cover,
        book.abstract,
        book.userId,
        book.publicationDate ?? ''
      );
      inserted += Number(result.changes);
    }
    database.exec('COMMIT');
    return inserted;
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}
