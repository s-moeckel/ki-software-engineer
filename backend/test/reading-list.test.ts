import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createApp } from '../src/app.js';
import { openDatabase } from '../src/database.js';
import { initializeDatabase } from '../src/initialize.js';

async function fixture(legacy = false) {
  const directory = await mkdtemp(join(tmpdir(), 'bookmonkey-reading-'));
  const filename = join(directory, 'books.sqlite');
  let database = openDatabase(filename);
  await initializeDatabase(database);
  if (legacy) database.exec('DROP TABLE reading_list');
  const isbns = database
    .prepare('SELECT isbn FROM books ORDER BY isbn LIMIT 3')
    .all()
    .map(row => String(row['isbn']));
  let server = createApp(database).listen(0, '127.0.0.1');
  await once(server, 'listening');
  function base() {
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    return `http://127.0.0.1:${address.port}`;
  }
  const request = (path: string, method = 'GET', body?: unknown) =>
    fetch(base() + path, {
      method,
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:4200' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(10000)
    });
  const list = async () => {
    const response = await request('/reading-list');
    assert.equal(response.status, 200);
    return response.json() as Promise<{ isbn: string; status: string; position: number; book: { title: string } }[]>;
  };
  const add = (isbn: string) => request('/reading-list', 'POST', { isbn });
  const move = (isbn: string, status: string, position: number) =>
    request(`/reading-list/${encodeURIComponent(isbn)}`, 'PUT', { status, position });
  const closeServer = () =>
    new Promise<void>((resolve, reject) => server.close(error => (error ? reject(error) : resolve())));
  return {
    isbns,
    request,
    list,
    add,
    move,
    rejectSecondUpdate() {
      database.exec(`CREATE TRIGGER reject_reading_update BEFORE UPDATE ON reading_list
        WHEN NEW.position = 1 BEGIN SELECT RAISE(ABORT, 'simulated storage failure'); END`);
    },
    async restart() {
      await closeServer();
      database.close();
      database = openDatabase(filename);
      await initializeDatabase(database);
      server = createApp(database).listen(0, '127.0.0.1');
      await once(server, 'listening');
    },
    async close() {
      await closeServer();
      database.close();
      await rm(directory, { recursive: true, force: true });
    }
  };
}

test('AK-1: newly initialized board is empty', async () => {
  const f = await fixture();
  try {
    assert.deepEqual(await f.list(), []);
  } finally {
    await f.close();
  }
});

test('AK-2/3: append books once without resetting status or order on duplicate POST', async () => {
  const f = await fixture();
  try {
    const [a, b] = f.isbns as [string, string];
    assert.equal((await f.add(a)).status, 201);
    assert.equal((await f.add(b)).status, 201);
    assert.deepEqual(
      (await f.list()).map(({ isbn, status, position }) => ({ isbn, status, position })),
      [
        { isbn: a, status: 'want-to-read', position: 0 },
        { isbn: b, status: 'want-to-read', position: 1 }
      ]
    );
    assert.ok((await f.list())[0]!.book.title);
    assert.equal((await f.move(a, 'reading', 0)).status, 200);
    const before = await f.list();
    const duplicates = await Promise.all([f.add(a), f.add(a)]);
    assert.deepEqual(
      duplicates.map(r => r.status),
      [200, 200]
    );
    assert.deepEqual(await f.list(), before);
  } finally {
    await f.close();
  }
});

test('AK-4/5: moves across columns and reorders atomically with contiguous positions', async () => {
  const f = await fixture();
  try {
    const [a, b, c] = f.isbns as [string, string, string];
    for (const isbn of f.isbns) assert.equal((await f.add(isbn)).status, 201);
    assert.equal((await f.move(c, 'want-to-read', 0)).status, 200);
    assert.deepEqual(
      (await f.list()).map(e => e.isbn),
      [c, a, b]
    );
    assert.equal((await f.move(a, 'reading', 0)).status, 200);
    assert.equal((await f.move(b, 'reading', 0)).status, 200);
    assert.deepEqual(
      (await f.list()).filter(e => e.status === 'reading').map(e => [e.isbn, e.position]),
      [
        [b, 0],
        [a, 1]
      ]
    );
    assert.equal((await f.move(b, 'read', 0)).status, 200);
    assert.deepEqual(
      (await f.list()).filter(e => e.status === 'reading').map(e => [e.isbn, e.position]),
      [[a, 0]]
    );
  } finally {
    await f.close();
  }
});

test('AK-6: removal leaves book intact, normalizes order and permits adding again', async () => {
  const f = await fixture();
  try {
    const [a, b] = f.isbns as [string, string];
    await f.add(a);
    await f.add(b);
    const book = await (await f.request(`/books/${a}`)).json();
    assert.equal((await f.request(`/reading-list/${a}`, 'DELETE')).status, 200);
    assert.deepEqual(
      (await f.list()).map(e => [e.isbn, e.position]),
      [[b, 0]]
    );
    assert.deepEqual(await (await f.request(`/books/${a}`)).json(), book);
    await f.add(a);
    assert.deepEqual(
      (await f.list()).map(e => e.isbn),
      [b, a]
    );
  } finally {
    await f.close();
  }
});

test('AK-7: membership, status and ordering survive database close, reinitialization and server restart', async () => {
  const f = await fixture();
  try {
    for (const isbn of f.isbns) await f.add(isbn);
    await f.move(f.isbns[2]!, 'want-to-read', 0);
    await f.move(f.isbns[0]!, 'read', 0);
    const before = await f.list();
    await f.restart();
    assert.deepEqual(await f.list(), before);
  } finally {
    await f.close();
  }
});

test('AK-8: invalid mutations and unknown references preserve board; CORS supports removal', async () => {
  const f = await fixture();
  try {
    const a = f.isbns[0]!;
    await f.add(a);
    const before = await f.list();
    for (const invalid of [null, [], {}, { isbn: '' }, { isbn: ' ' }, { isbn: 42 }]) {
      assert.equal((await f.request('/reading-list', 'POST', invalid)).status, 400);
    }
    assert.equal((await f.add('missing')).status, 404);
    for (const invalid of [
      null,
      [],
      {},
      { status: 'other', position: 0 },
      { status: 'read', position: -1 },
      { status: 'read', position: 0.5 },
      { status: 'read', position: '0' },
      { status: 'read', position: 10 },
      { status: 'read', position: Number.MAX_SAFE_INTEGER + 1 }
    ]) {
      assert.equal((await f.request(`/reading-list/${a}`, 'PUT', invalid)).status, 400, JSON.stringify(invalid));
      assert.deepEqual(await f.list(), before);
    }
    assert.equal((await f.move('missing', 'read', 0)).status, 404);
    assert.equal((await f.request('/reading-list/missing', 'DELETE')).status, 404);
    const preflight = await f.request(`/reading-list/${a}`, 'OPTIONS');
    assert.match(preflight.headers.get('access-control-allow-methods')!, /DELETE/);
    assert.deepEqual(await f.list(), before);
  } finally {
    await f.close();
  }
});

test('migration: adding board schema to an existing books database preserves collection', async () => {
  const f = await fixture(true);
  try {
    const before = await (await f.request('/books')).json();
    await f.restart();
    assert.deepEqual(await (await f.request('/books')).json(), before);
    assert.deepEqual(await f.list(), []);
  } finally {
    await f.close();
  }
});

test('AK-8: storage failure in the middle of reorder rolls the entire transaction back', async () => {
  const f = await fixture();
  try {
    for (const isbn of f.isbns) await f.add(isbn);
    const before = await f.list();
    f.rejectSecondUpdate();
    assert.equal((await f.move(f.isbns[2]!, 'want-to-read', 0)).status, 503);
    assert.deepEqual(await f.list(), before);
  } finally {
    await f.close();
  }
});

test('book references support encoded ISBNs and return current book details without copying book data', async () => {
  const f = await fixture();
  try {
    const isbn = 'custom/isbn with spaces';
    const response = await f.request('/books', 'POST', { isbn, title: 'Custom title', author: 'Reader', numPages: 20 });
    assert.equal(response.status, 201);
    const book = await response.json();
    assert.equal((await f.add(isbn)).status, 201);
    assert.equal((await f.move(isbn, 'reading', 0)).status, 200);
    assert.equal(
      (await f.request(`/books/${encodeURIComponent(isbn)}`, 'PUT', { ...book, title: 'Updated title' })).status,
      200
    );
    assert.equal((await f.list())[0]!.book.title, 'Updated title');
    assert.equal((await f.request(`/reading-list/${encodeURIComponent(isbn)}`, 'DELETE')).status, 200);
    assert.deepEqual(await f.list(), []);
  } finally {
    await f.close();
  }
});
