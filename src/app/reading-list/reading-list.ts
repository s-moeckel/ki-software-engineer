import { Book } from '../books/book';

export const readingColumns = [
  { status: 'want-to-read', label: 'möchte ich lesen' },
  { status: 'reading', label: 'lese ich gerade' },
  { status: 'read', label: 'gelesen' }
] as const;
export type ReadingStatus = (typeof readingColumns)[number]['status'];
export interface ReadingEntry {
  isbn: string;
  status: ReadingStatus;
  position: number;
  book: Book;
}
export type ReadingChange =
  | { kind: 'saved' | 'reconciled'; entries: ReadingEntry[] }
  | { kind: 'rejected' | 'reconciling' | 'unknown' };

export type BoardAction = { isbn: string; status: ReadingStatus; position: number } | { isbn: string; remove: true };

export function applyBoardAction(entries: ReadingEntry[], action: BoardAction): ReadingEntry[] {
  const entry = entries.find(e => e.isbn === action.isbn);
  if (!entry) return entries;
  let result = entries.filter(e => e.isbn !== action.isbn);
  if (!('remove' in action)) {
    const column = result.filter(e => e.status === action.status);
    column.splice(action.position, 0, { ...entry, status: action.status });
    result = [...result.filter(e => e.status !== action.status), ...column];
  }
  return readingColumns.flatMap(({ status }) =>
    result.filter(e => e.status === status).map((e, position) => ({ ...e, position }))
  );
}
