import { expect, test } from '@playwright/test';
import { Book } from '../src/app/books/book';
import {
  BOOK_HEIGHT,
  BOOK_DEPTH,
  SHELF_LEVELS,
  SLOTS_PER_LEVEL,
  libraryBays,
  bookThickness,
  createLibraryLayout,
  searchLibrary
} from '../src/app/library/library-data';

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

test('library books occupy wall bays, with no freestanding shelves or overlapping slots', () => {
  for (const count of [1, 250, 2500]) {
    const books = Array.from({ length: count }, (_, index) =>
      makeBook(String(index), 'Title ' + index, index === count - 1 ? 'A' : 'B')
    );
    const layout = createLibraryLayout(books);
    const bays = libraryBays(count);
    expect(layout).toHaveLength(count);
    expect(layout[0].book.author).toBe('A');
    expect(new Set(layout.map(item => [item.shelf, item.level, item.slot].join(':'))).size).toBe(count);
    for (const item of layout) {
      expect(item.slot).toBeLessThan(SLOTS_PER_LEVEL);
      const bay = bays[item.shelf];
      const dx = item.position[0] - bay.x;
      const dz = item.position[2] - bay.z;
      const across = dx * Math.cos(bay.angle) - dz * Math.sin(bay.angle);
      expect(Math.abs(across)).toBeLessThanOrEqual(0.550001);
      expect(dx * Math.sin(bay.angle) + dz * Math.cos(bay.angle)).toBeCloseTo(-0.04);
      expect(item.position[1] - BOOK_HEIGHT / 2).toBeCloseTo(SHELF_LEVELS[item.level]);
      expect(Math.abs(item.rotation - bay.angle)).toBeLessThanOrEqual(0.440001);
      if (count < 1000) expect(Math.abs(item.rotation - bay.angle)).toBeGreaterThan(0.2);
      // All books stay on the perimeter, leaving the middle of the room open.
      expect(Math.abs(item.position[0]) > 3 || item.position[2] > 4).toBe(true);
    }
    if (count > 100) expect(new Set(layout.map(item => item.level)).size).toBe(7);
  }
});

test('books fill each occupied compartment evenly and stay clear of neighbouring books', () => {
  for (const count of [1, 105, 300, 2500]) {
    const layout = createLibraryLayout(
      Array.from({ length: count }, (_, index) => makeBook(String(index), 'Title', 'Author', 5000))
    );
    const groups = new Map<string, typeof layout>();
    for (const item of layout) {
      const key = `${item.shelf}:${item.level}`;
      groups.set(key, [...(groups.get(key) ?? []), item]);
    }
    const bays = libraryBays(count);
    for (const items of groups.values()) {
      const bay = bays[items[0].shelf];
      const offsets = items.map(
        item => (item.position[0] - bay.x) * Math.cos(bay.angle) - (item.position[2] - bay.z) * Math.sin(bay.angle)
      );
      if (items.length === 1) expect(offsets[0]).toBeCloseTo(0);
      else {
        expect(offsets.at(-1)! - offsets[0]).toBeCloseTo(1.1);
        for (let index = 1; index < items.length; index++) {
          const projectedWidth = (item: (typeof items)[number]) => {
            const angle = item.rotation - bay.angle;
            return Math.abs(Math.cos(angle)) * item.thickness + Math.abs(Math.sin(angle)) * BOOK_DEPTH;
          };
          expect(offsets[index] - offsets[index - 1]).toBeGreaterThan(
            (projectedWidth(items[index]) + projectedWidth(items[index - 1])) / 2
          );
        }
      }
    }
  }
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
