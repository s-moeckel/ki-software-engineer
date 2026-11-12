import { Book } from '../books/book';

export const BOOK_HEIGHT = 0.4;
export const BOOK_DEPTH = 0.25;
export const SHELF_LEVELS = [0.215, 0.755, 1.295, 1.835, 2.375, 2.915, 3.455] as const;
export const SLOTS_PER_LEVEL = 12;
export const BOOKS_PER_SHELF = SHELF_LEVELS.length * SLOTS_PER_LEVEL;

export interface LibraryBay {
  x: number;
  z: number;
  angle: number;
}

export function libraryRoomEnd(bookCount: number): number {
  const extraPairs = Math.max(0, Math.ceil((Math.ceil(bookCount / BOOKS_PER_SHELF) - 15) / 2));
  return 7 + extraPairs * 1.7;
}

export function libraryBays(bookCount: number): LibraryBay[] {
  const center = libraryRoomEnd(bookCount) - 5.2;
  const bays: LibraryBay[] = [];
  for (let index = 0; index <= 8; index++) {
    const angle = (index / 8 - 0.5) * Math.PI;
    bays.push({ x: Math.sin(angle) * 4.12, z: center + Math.cos(angle) * 4.12, angle });
  }
  for (const x of [-4.12, 4.12]) {
    for (let z = -3.3; z < center - 0.8; z += 1.7) {
      bays.push({ x, z, angle: x < 0 ? -Math.PI / 2 : Math.PI / 2 });
    }
  }
  return bays;
}

export function bayPosition(bay: LibraryBay, x: number, y: number, z: number): [number, number, number] {
  return [
    bay.x + x * Math.cos(bay.angle) + z * Math.sin(bay.angle),
    y,
    bay.z - x * Math.sin(bay.angle) + z * Math.cos(bay.angle)
  ];
}

export interface LibraryPosition {
  book: Book;
  shelf: number;
  level: number;
  slot: number;
  position: [number, number, number];
  thickness: number;
  rotation: number;
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
  const bays = libraryBays(books.length);
  const compartments = bays.length * SHELF_LEVELS.length;
  return sorted.map((book, index) => {
    const shelf = index % bays.length;
    const level = Math.floor(index / bays.length) % SHELF_LEVELS.length;
    const slot = Math.floor(index / (bays.length * SHELF_LEVELS.length));
    const compartment = index % compartments;
    const count = Math.floor((books.length - 1 - compartment) / compartments) + 1;
    const offset = count === 1 ? 0 : (slot / (count - 1) - 0.5) * 1.1;
    const spacing = count === 1 ? 1.1 : 1.1 / (count - 1);
    // Allow for the widest book so angled covers never overlap their neighbours.
    const maxAngle = Math.asin(Math.min(1, Math.max(0, (spacing - 0.06 * 1.6 - 0.004) / BOOK_DEPTH)));
    const angle = Math.min(0.28 + ((shelf * 3 + level + slot) % 5) * 0.04, maxAngle);
    const bay = bays[shelf];
    return {
      book,
      shelf,
      level,
      slot,
      position: bayPosition(bay, offset, SHELF_LEVELS[level] + BOOK_HEIGHT / 2, -0.04),
      rotation: bay.angle + ((shelf + level) % 2 ? -angle : angle),
      thickness: bookThickness(book.numPages) * 1.6
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
