export interface Book {
  id: string;
  isbn: string;
  title: string;
  subtitle?: string;
  author: string;
  publisher: string;
  numPages: number;
  price: string;
  cover: string;
  abstract: string;
  userId: number;
  publicationDate?: string;
}

export function isPublicationDate(value: unknown): boolean {
  if (value === undefined || value === '') return true;
  if (typeof value !== 'string' || !/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function isBook(value: unknown): value is Book {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const book = value as Record<string, unknown>;
  const strings = ['id', 'isbn', 'title', 'author', 'publisher', 'price', 'cover', 'abstract'];
  return (
    strings.every(key => typeof book[key] === 'string') &&
    ['id', 'isbn', 'title', 'author'].every(key => (book[key] as string).trim().length > 0) &&
    (book['subtitle'] === undefined || typeof book['subtitle'] === 'string') &&
    isPublicationDate(book['publicationDate']) &&
    Number.isInteger(book['numPages']) &&
    (book['numPages'] as number) > 0 &&
    (book['numPages'] as number) <= 2_147_483_647 &&
    Number.isInteger(book['userId']) &&
    (book['userId'] as number) >= -2_147_483_648 &&
    (book['userId'] as number) <= 2_147_483_647
  );
}
