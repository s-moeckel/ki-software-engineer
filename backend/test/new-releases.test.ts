import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { createApp } from '../src/app.js';
import { openDatabase } from '../src/database.js';
import { initializeDatabase } from '../src/initialize.js';

async function fixture() {
  const database = openDatabase(':memory:');
  database.exec(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8'));
  const server = createApp(database).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const url = `http://127.0.0.1:${address.port}/books`;
  const send = async (method: string, value: unknown, path = '') =>
    fetch(url + path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(value)
    });
  return {
    database,
    url,
    send,
    async close() {
      await new Promise<void>(resolve => server.close(() => resolve()));
      database.close();
    }
  };
}

const draft = { isbn: 'date-book', title: 'Neu', author: 'Autor', numPages: 100 };

test('NR-1: publication date survives create, details, legacy update, explicit clear and initialization', async () => {
  const f = await fixture();
  try {
    const response = await f.send('POST', { ...draft, publicationDate: '2024-02-29' });
    assert.equal(response.status, 201);
    const book = await response.json();
    assert.equal(book.publicationDate, '2024-02-29');
    assert.equal((await (await fetch(f.url + '/date-book')).json()).publicationDate, '2024-02-29');
    const { publicationDate, ...legacy } = book;
    assert.equal(
      (await (await f.send('PUT', { ...legacy, title: 'Edited' }, '/date-book')).json()).publicationDate,
      publicationDate
    );
    await initializeDatabase(f.database);
    await initializeDatabase(f.database);
    assert.equal(
      f.database.prepare('SELECT publicationDate FROM books WHERE isbn = ?').get(draft.isbn)!['publicationDate'],
      publicationDate
    );
    const cleared = await f.send('PUT', { ...book, publicationDate: '' }, '/date-book');
    assert.equal(cleared.status, 200);
    assert.equal((await cleared.json()).publicationDate, '');
  } finally {
    await f.close();
  }
});

for (const date of ['2025-02-29', '2026-04-31', '2026-13-01', '2026-00-01', '2026-1-01', '0000-01-01', null, 2026]) {
  test(`NR-2: rejects invalid publication date ${JSON.stringify(date)}`, async () => {
    const f = await fixture();
    try {
      assert.equal((await f.send('POST', { ...draft, publicationDate: date })).status, 400);
      const created = await (await f.send('POST', draft)).json();
      assert.equal((await f.send('PUT', { ...created, publicationDate: date }, '/date-book')).status, 400);
    } finally {
      await f.close();
    }
  });
}

for (const [now, dates, expected] of [
  ['2026-11-13T12:00:00Z', ['2026-11-13', '2026-08-16', '2026-08-15', '2026-11-14', ''], ['a', 'b', 'c']],
  ['2026-12-31T23:30:00Z', ['2027-01-01', '2026-10-04', '2026-10-03', '2027-01-02', ''], ['a', 'b', 'c']],
  ['2024-03-01T12:00:00Z', ['2024-02-29', '2023-12-03', '2023-12-02', '2024-03-02', ''], ['a', 'b', 'c']]
] as const) {
  test(`NR-3: 90 calendar days, future exclusion and deterministic ordering at ${now}`, async t => {
    t.mock.timers.enable({ apis: ['Date'], now: new Date(now) });
    const f = await fixture();
    try {
      for (const [isbn, publicationDate] of [
        ['b', dates[0]],
        ['a', dates[0]],
        ['c', dates[1]],
        ['d', dates[2]],
        ['e', dates[3]],
        ['f', dates[4]]
      ]) {
        await f.send('POST', { ...draft, isbn, publicationDate });
      }
      const response = await fetch(f.url + '/new-releases');
      assert.equal(response.status, 200);
      assert.deepEqual(
        (await response.json()).map((b: { isbn: string }) => b.isbn),
        expected
      );
    } finally {
      await f.close();
    }
  });
}

test('NR-4: upgrades the old schema once without losing books or reading list', async () => {
  const database = openDatabase(':memory:');
  try {
    const schema = await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8');
    database.exec(schema.replace(/\s*publicationDate text NOT NULL DEFAULT '',?/, ''));
    database.exec(`INSERT INTO books (id,isbn,title,subtitle,author,publisher,"numPages",price,cover,abstract,"userId")
      VALUES ('custom','custom','Edited','','Author','',10,'','','',1);
      INSERT INTO reading_list VALUES ('custom','reading',0)`);
    await initializeDatabase(database);
    await initializeDatabase(database);
    const row = database.prepare('SELECT title, publicationDate FROM books WHERE isbn = ?').get('custom');
    assert.deepEqual({ ...row }, { title: 'Edited', publicationDate: '' });
    assert.equal(database.prepare('SELECT status FROM reading_list').get()!['status'], 'reading');
  } finally {
    database.close();
  }
});
