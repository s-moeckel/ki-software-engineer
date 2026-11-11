import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

export function openDatabase(
  filename = process.env['DATABASE_FILE'] || fileURLToPath(new URL('../storage/bookmonkey.sqlite', import.meta.url))
): DatabaseSync {
  if (filename !== ':memory:') mkdirSync(dirname(filename), { recursive: true });
  const database = new DatabaseSync(filename, { timeout: 5000 });
  // SQLite's built-in lower() only handles ASCII.
  database.function('fold', { deterministic: true }, value => String(value ?? '').toLowerCase());
  return database;
}
