import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { after, before, test } from 'node:test';
import type { Server } from 'node:http';
import { openDatabase } from '../src/database.js';
import { createApp } from '../src/app.js';
import { initializeDatabase } from '../src/initialize.js';
import type { Book } from '../src/book.js';

const directory = await mkdtemp(join(tmpdir(), 'bookmonkey-api-'));
const filename = join(directory, 'books.sqlite');
const database = openDatabase(filename);
let server: Server | undefined;
let baseUrl: string;
let seed: Book[];

async function request(path = '/books', init?: RequestInit) {
  return fetch(baseUrl + path, { ...init, signal: AbortSignal.timeout(10000) });
}

function put(book: unknown): RequestInit {
  return { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(book) };
}

function matchesQuery(book: Book, query: string): boolean {
  return [book.title, book.subtitle, book.author, book.publisher, book.abstract, book.isbn].some(value =>
    value?.toLowerCase().includes(query.toLowerCase())
  );
}

async function listen() {
  server = createApp(database).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  baseUrl = `http://127.0.0.1:${address.port}`;
}

before(async () => {
  seed = JSON.parse(await readFile(new URL('../data/books.json', import.meta.url), 'utf8')) as Book[];
  seed = seed.map(book => ({ ...book, publicationDate: book.publicationDate ?? '' }));
  seed.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const inserted = await Promise.all([initializeDatabase(database), initializeDatabase(database)]);
  assert.deepEqual(
    inserted.sort((a, b) => a - b),
    [0, 1000]
  );
  await listen();
});

after(async () => {
  if (server) await new Promise<void>((resolve, reject) => server!.close(error => (error ? reject(error) : resolve())));
  database.close();
  await rm(directory, { recursive: true, force: true });
});

test('full collection, deterministic limit and Book JSON match the frontend contract', async () => {
  const response = await request();
  assert.equal(response.status, 200);
  const books = (await response.json()) as Book[];
  assert.deepEqual(books, seed);
  assert.equal(books.length, 1000);
  assert.equal(new Set(books.map(book => book.isbn)).size, 1000);
  assert.equal(new Set(books.map(book => book.title)).size, 1000);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const limited = await (await request('/books?_limit=10')).json();
  assert.deepEqual(limited, seed.slice(0, 10));
  assert.deepEqual(await (await request('/books?_limit=0')).json(), []);
});

test('all seed ISBNs have valid ISBN-13 check digits and per-edition source links', async () => {
  const sources = JSON.parse(await readFile(new URL('../data/sources.json', import.meta.url), 'utf8')) as {
    isbn: string;
    url: string;
  }[];
  assert.equal(sources.length, 1000);
  assert.equal(new Set(sources.map(source => source.isbn)).size, 1000);
  for (const book of seed) {
    assert.match(book.isbn, /^97[89]\d{10}$/);
    const checksum = [...book.isbn].reduce((sum, char, index) => sum + Number(char) * (index % 2 ? 3 : 1), 0);
    assert.equal(checksum % 10, 0, book.isbn);
    assert.ok(
      sources.some(
        source =>
          source.isbn === book.isbn &&
          (/^https:\/\/openlibrary\.org\/books\//.test(source.url) ||
            /^https:\/\/d-nb\.info\/\d+[0-9X]?$/.test(source.url))
      )
    );
  }
});

test('the expanded collection includes and finds the requested German authors', async () => {
  for (const author of ['Andreas Eschbach', 'Cliff Allister', 'Dominik A. Meier']) {
    const expected = seed.filter(book => matchesQuery(book, author));
    assert.ok(
      seed.filter(book => book.author.includes(author)).length >= 10,
      `${author}: mehrere verschiedene Titel erwartet`
    );
    assert.deepEqual(await (await request(`/books?q=${encodeURIComponent(author)}`)).json(), expected);
  }
  const normalized = seed.map(book =>
    book.title
      .normalize('NFKD')
      .replace(/\p{M}/gu, '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
  );
  assert.equal(new Set(normalized).size, 1000);
});

test('upgrading the existing 300-book database adds 700 books and preserves all existing edits', async () => {
  const existing = openDatabase(':memory:');
  try {
    existing.exec(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8'));
    const insert = existing.prepare(
      `INSERT INTO books (id, isbn, title, subtitle, author, publisher, "numPages", price, cover, abstract, "userId")
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const book of seed.filter(book => Number(book.id.slice(3)) <= 300)) {
      insert.run(
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
        book.userId
      );
    }
    existing
      .prepare('UPDATE books SET title = ?, price = ?, abstract = ? WHERE isbn = ?')
      .run('Meine Ausgabe von Dune', '19,95', 'Eigene Notizen', seed[0]!.isbn);
    const before = existing
      .prepare('SELECT * FROM books ORDER BY id')
      .all()
      .map(row => ({ ...row }));
    assert.equal(await initializeDatabase(existing), 700);
    const after = existing
      .prepare('SELECT * FROM books ORDER BY id')
      .all()
      .map(row => ({ ...row }));
    assert.equal(after.length, 1000);
    assert.deepEqual(
      after.filter(book => Number(String(book['id']).slice(3)) <= 300),
      before
    );
    assert.equal(await initializeDatabase(existing), 0);
  } finally {
    existing.close();
  }
});

test('search is case-insensitive, includes authors and runs before limiting', async () => {
  const expected = seed.filter(book => book.author.includes('Le Guin'));
  assert.equal(expected.length, 2);
  assert.deepEqual(await (await request('/books?q=LE%20GUIN')).json(), expected);
  assert.deepEqual(await (await request('/books?q=LE%20GUIN&_limit=1')).json(), expected.slice(0, 1));
  assert.deepEqual(
    await (await request('/books?q=solaris')).json(),
    seed.filter(book => matchesQuery(book, 'solaris'))
  );
  for (const query of ['nothing-matches-this', '%', "' OR 1=1 --"]) {
    assert.deepEqual(await (await request(`/books?q=${encodeURIComponent(query)}`)).json(), []);
  }
  assert.deepEqual(
    await (await request('/books?q=_')).json(),
    seed.filter(book => book.title === 'Project no_face')
  );
  assert.equal((await (await request('/books?q=%20%20')).json()).length, 1000);
});

test('invalid query parameters are rejected without coercion', async () => {
  for (const query of [
    '_limit=-1',
    '_limit=1.5',
    '_limit=1e2',
    '_limit=abc',
    '_limit=',
    '_limit=9007199254740992',
    '_limit=1&_limit=2',
    'q=a&q=b',
    'q[x]=a',
    `q=${'a'.repeat(501)}`
  ]) {
    assert.equal((await request(`/books?${query}`)).status, 400, query);
  }
});

test('details resolve by ISBN, never by internal id; missing books return 404', async () => {
  const book = seed[0]!;
  assert.deepEqual(await (await request(`/books/${book.isbn}`)).json(), book);
  assert.equal((await request(`/books/${book.id}`)).status, 404);
  assert.equal((await request('/books/9780000000000')).status, 404);
  assert.equal((await request('/books/9780000000000', put(book))).status, 404);
  assert.equal((await request(`/books/${encodeURIComponent("' OR 1=1 --")}`)).status, 404);
});

test('PUT saves all editable fields, preserves identity and returns a string price', async () => {
  const original = seed[0]!;
  const book = {
    ...original,
    title: 'Dune – bearbeitet',
    subtitle: 'Eigene Ausgabe',
    author: 'Frank Herbert ',
    publisher: 'Mein Verlag',
    numPages: 900,
    price: '12,99 EUR',
    abstract: 'Eigene Notiz',
    cover: ''
  };
  const response = await request(`/books/${book.isbn}`, put(book));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), book);
  assert.deepEqual(await (await request(`/books/${book.isbn}`)).json(), book);
  assert.equal((await (await request('/books?q=bearbeitet')).json()).length, 1);
});

test('PUT rejects invalid books and identity changes without changing the database', async () => {
  const original = seed[1]!;
  const invalid = [
    null,
    [],
    {},
    { ...original, title: '  ' },
    { ...original, author: '\t' },
    { ...original, numPages: 0 },
    { ...original, numPages: 2.5 },
    { ...original, numPages: '12' },
    { ...original, numPages: 2147483648 },
    { ...original, price: 12.99 },
    { ...original, subtitle: null },
    { ...original, userId: 2.5 }
  ];
  for (const book of invalid) {
    assert.equal((await request(`/books/${original.isbn}`, put(book))).status, 400, JSON.stringify(book));
  }
  for (const change of [{ id: 'changed' }, { isbn: seed[2]!.isbn }, { userId: original.userId + 1 }]) {
    assert.equal((await request(`/books/${original.isbn}`, put({ ...original, ...change }))).status, 409);
  }
  assert.deepEqual(await (await request(`/books/${original.isbn}`)).json(), original);
});

test('search retains Unicode case-insensitivity with the SQLite file', async () => {
  const book = { ...seed[3]!, title: 'Über ferne Welten', author: 'Élodie Beispiel' };
  assert.equal((await request(`/books/${book.isbn}`, put(book))).status, 200);
  for (const text of ['ÜBER FERNE WELTEN', 'ÉLODIE']) {
    assert.deepEqual(await (await request(`/books?q=${encodeURIComponent(text)}`)).json(), [book]);
  }
});

test('omitted optional subtitle becomes an empty string', async () => {
  const { subtitle: _subtitle, ...book } = seed[2]!;
  const response = await request(`/books/${book.isbn}`, put(book));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ...book, subtitle: '' });
});

test('CORS allows Angular GET and PUT preflights and excludes other origins', async () => {
  for (const origin of ['http://localhost:4200', 'http://127.0.0.1:4200']) {
    const response = await request('/books', { headers: { Origin: origin } });
    assert.equal(response.headers.get('access-control-allow-origin'), origin);
    const options = await request(`/books/${seed[0]!.isbn}`, {
      method: 'OPTIONS',
      headers: {
        Origin: origin,
        'Access-Control-Request-Method': 'PUT',
        'Access-Control-Request-Headers': 'content-type'
      }
    });
    assert.equal(options.status, 204);
    assert.match(options.headers.get('access-control-allow-methods')!, /PUT/);
    assert.match(options.headers.get('access-control-allow-headers')!, /Content-Type/);
  }
  const denied = await request('/books', { headers: { Origin: 'https://other.example' } });
  assert.equal(denied.headers.get('access-control-allow-origin'), null);
});

test('malformed JSON, oversized requests, malformed URL escapes and unknown routes have JSON errors', async () => {
  const malformed = await request(`/books/${seed[0]!.isbn}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: '{'
  });
  assert.equal(malformed.status, 400);
  assert.equal(typeof (await malformed.json()).error, 'string');
  const large = await request(`/books/${seed[0]!.isbn}`, put({ ...seed[0]!, abstract: 'x'.repeat(140000) }));
  assert.equal(large.status, 413);
  assert.equal((await request('/books/%E0%A4%A')).status, 400);
  assert.equal((await request('/unknown')).status, 404);
});

test('reinitialization preserves edits, inserts missing seed books, and serializes concurrent runs', async () => {
  const edited = await (await request(`/books/${seed[0]!.isbn}`)).json();
  assert.equal(await initializeDatabase(database), 0);
  database.prepare('DELETE FROM books WHERE isbn = ?').run(seed[49]!.isbn);
  const counts = await Promise.all([initializeDatabase(database), initializeDatabase(database)]);
  assert.equal(
    counts.reduce((sum, count) => sum + count, 0),
    1
  );
  assert.deepEqual(await (await request(`/books/${seed[0]!.isbn}`)).json(), edited);
  assert.equal((await (await request()).json()).length, 1000);
});

test('persisted edits survive a closed HTTP server and fresh database connection', async () => {
  const edited = await (await request(`/books/${seed[0]!.isbn}`)).json();
  await new Promise<void>((resolve, reject) => server!.close(error => (error ? reject(error) : resolve())));
  server = undefined;
  const freshDatabase = openDatabase(filename);
  try {
    assert.equal(await initializeDatabase(freshDatabase), 0);
    const persisted = freshDatabase.prepare('SELECT * FROM books WHERE isbn = ?').get(seed[0]!.isbn);
    assert.deepEqual({ ...persisted }, edited);
  } finally {
    freshDatabase.close();
  }
  await listen();
  assert.deepEqual(await (await request(`/books/${seed[0]!.isbn}`)).json(), edited);
});

test('a failed initializer rolls back all books inserted before the error', async () => {
  const isolated = openDatabase(':memory:');
  try {
    isolated.exec(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8'));
    isolated
      .prepare(
        `INSERT INTO books (id, isbn, title, author, publisher, "numPages", price, cover, abstract, "userId")
       VALUES (?, 'custom-isbn', 'Eigenes Buch', 'Autor', '', 10, '', '', '', 1)`
      )
      .run(seed[49]!.id);
    await assert.rejects(initializeDatabase(isolated), /UNIQUE constraint/);
    assert.deepEqual(
      isolated
        .prepare('SELECT isbn FROM books')
        .all()
        .map(row => ({ ...row })),
      [{ isbn: 'custom-isbn' }]
    );
  } finally {
    isolated.close();
  }
});

test('health and request errors reflect an unavailable database without leaking internals', async () => {
  assert.equal((await request('/health')).status, 200);
  const unavailable = openDatabase(':memory:');
  const failingServer = createApp(unavailable).listen(0, '127.0.0.1');
  await once(failingServer, 'listening');
  const address = failingServer.address();
  assert.ok(address && typeof address === 'object');
  try {
    unavailable.close();
    const response = await fetch(`http://127.0.0.1:${address.port}/books`);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), {
      error: 'Bücher konnten nicht verarbeitet werden. Bitte erneut versuchen.'
    });
    assert.equal((await fetch(`http://127.0.0.1:${address.port}/health`)).status, 503);
  } finally {
    await new Promise<void>(resolve => failingServer.close(() => resolve()));
  }
});
