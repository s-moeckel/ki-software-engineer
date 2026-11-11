import { Book } from '../books/book';

export const BOOK_HEIGHT = 0.24;
export const BOOK_DEPTH = 0.16;
export const BOOK_SLOT_WIDTH = 0.07;
export const SHELF_LEVELS = [0.45, 0.8, 1.15, 1.5] as const;
export const BOOKS_PER_SHELF = 80;
export const SHELF_COLUMN_DISTANCE = 4.6;
export const SHELF_ROW_DISTANCE = 3.4;

export interface LibraryPosition {
  book: Book;
  shelf: number;
  level: number;
  slot: number;
  position: [number, number, number];
  thickness: number;
}

export function bookThickness(numPages: unknown): number {
  return typeof numPages === 'number' && Number.isFinite(numPages) && numPages > 0
    ? Math.min(0.06, Math.max(0.01, numPages * 0.00005))
    : 0.03;
}

export function sortBooks(books: readonly Book[]): Book[] {
  return [...books].sort((a, b) => {
    const first = [a.author, a.title, a.isbn].map(value => value.toLowerCase()).join('\u0000');
    const second = [b.author, b.title, b.isbn].map(value => value.toLowerCase()).join('\u0000');
    return first < second ? -1 : first > second ? 1 : 0;
  });
}

export function createLibraryLayout(books: readonly Book[]): LibraryPosition[] {
  const sorted = sortBooks(books);
  return sorted.map((book, index) => {
    const shelf = Math.floor(index / BOOKS_PER_SHELF);
    const level = Math.floor((index % BOOKS_PER_SHELF) / 20);
    const slot = index % 20;
    const row = Math.floor(shelf / 2);
    const column = shelf % 2;
    return {
      book,
      shelf,
      level,
      slot,
      position: [
        (column - 0.5) * SHELF_COLUMN_DISTANCE - 0.665 + slot * BOOK_SLOT_WIDTH,
        SHELF_LEVELS[level] + BOOK_HEIGHT / 2,
        row * SHELF_ROW_DISTANCE - 0.12
      ],
      thickness: bookThickness(book.numPages)
    };
  });
}

export function searchLibrary(books: readonly Book[], query: string): Book[] {
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [...books];
  return books.filter(book => {
    const text = [book.title, book.subtitle, book.author, book.isbn, book.abstract].join(' ').toLocaleLowerCase();
    return words.every(word => text.includes(word));
  });
}
