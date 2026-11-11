import { expect, test } from '@playwright/test';
import { Book } from '../src/app/books/book';
import { bookThickness, createLibraryLayout, searchLibrary } from '../src/app/library/library-data';

const makeBook = (isbn: string, title: string, author: string, numPages = 100): Book => ({
  id: isbn,
  isbn,
  title,
  author,
  publisher: 'Testverlag',
  numPages,
  price: '0',
  cover: '',
  abstract: `${title} abstract`,
  userId: 1
});

test('library layout sorts books and assigns all four levels and twenty slots', () => {
  const books = Array.from({ length: 81 }, (_, index) => makeBook(String(index), `Title ${index}`, index === 80 ? 'A' : 'B'));
  const layout = createLibraryLayout(books);

  expect(layout).toHaveLength(81);
  expect(layout[0].book.author).toBe('A');
  expect(layout[0].level).toBe(0);
  expect(layout[19].slot).toBe(19);
  expect(layout[80].shelf).toBe(1);
  expect(new Set(layout.slice(0, 80).map(item => item.level))).toEqual(new Set([0, 1, 2, 3]));
  expect(new Set(layout.slice(0, 20).map(item => item.position[0]))).toHaveSize(20);
});

test('book thickness uses the bounded page contract and a fallback', () => {
  expect(bookThickness(undefined)).toBe(0.03);
  expect(bookThickness(0)).toBe(0.03);
  expect(bookThickness(200)).toBe(0.01);
  expect(bookThickness(1000)).toBe(0.05);
  expect(bookThickness(5000)).toBe(0.06);
});

test('library search includes subtitle, isbn and abstract without changing order', () => {
  const books = [makeBook('isbn-a', 'First', 'Author A'), makeBook('isbn-b', 'Second', 'Author B')];
  books[1].subtitle = 'Special edition';
  expect(searchLibrary(books, 'special')).toEqual([books[1]]);
  expect(searchLibrary(books, 'isbn-a')).toEqual([books[0]]);
  expect(searchLibrary(books, '')).toEqual(books);
});

