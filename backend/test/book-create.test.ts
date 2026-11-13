import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createApp } from '../src/app.js';
import { openDatabase } from '../src/database.js';
import type { Book } from '../src/book.js';

test('POST validates, creates persistent books and rejects concurrent ISBN duplicates', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'bookmonkey-create-'));
  const filename = join(directory, 'books.sqlite');
  const database = openDatabase(filename);
  database.exec(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8'));
  const server = createApp(database).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const url = `http://127.0.0.1:${address.port}/books`;
  const draft = { isbn: 'custom-isbn', title: 'Mein Buch', author: 'Autor', numPages: 42 };
  const post = (value: unknown) =>
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(value)
    });
  try {
    for (const invalid of [
      null,
      [],
      {},
      { ...draft, isbn: ' ' },
      { ...draft, title: '\t' },
      { ...draft, author: ' ' },
      { ...draft, numPages: 0 },
      { ...draft, numPages: -1 },
      { ...draft, numPages: 1.5 },
      { ...draft, numPages: '42' },
      { ...draft, numPages: 2147483648 },
      { ...draft, price: 12 },
      { ...draft, cover: null }
    ]) {
      assert.equal((await post(invalid)).status, 400, JSON.stringify(invalid));
    }
    assert.deepEqual(await (await fetch(url)).json(), []);
    const responses = await Promise.all([post({ ...draft, isbn: ' custom-isbn ' }), post(draft)]);
    assert.deepEqual(responses.map(response => response.status).sort(), [201, 409]);
    const createdResponse = responses.find(response => response.status === 201)!;
    assert.equal(createdResponse.headers.get('location'), '/books/custom-isbn');
    const created = (await createdResponse.json()) as Book;
    assert.ok(created.id);
    assert.deepEqual(created, {
      ...draft,
      id: created.id,
      userId: 1,
      subtitle: '',
      publisher: '',
      price: '',
      cover: '',
      abstract: '',
      publicationDate: ''
    });
    assert.match((await responses.find(response => response.status === 409)!.json()).error, /ISBN.*bereits vorhanden/);
    assert.deepEqual(await (await fetch(`${url}/custom-isbn`)).json(), created);
    assert.deepEqual(await (await fetch(`${url}?q=Mein`)).json(), [created]);
    const full = {
      ...draft,
      isbn: 'second/isbn',
      subtitle: 'Untertitel',
      publisher: 'Verlag',
      price: '12,99',
      cover: 'https://example.test/cover.jpg',
      abstract: 'Mehrere\nZeilen'
    };
    const second = (await (await post({ ...full, id: created.id, userId: 99 })).json()) as Book;
    assert.notEqual(second.id, created.id);
    assert.deepEqual(second, { ...full, id: second.id, userId: 1, publicationDate: '' });
    const preflight = await fetch(url, {
      method: 'OPTIONS',
      headers: { Origin: 'http://localhost:4200', 'Access-Control-Request-Method': 'POST' }
    });
    assert.match(preflight.headers.get('access-control-allow-methods')!, /POST/);
    const fresh = openDatabase(filename);
    try {
      assert.deepEqual({ ...fresh.prepare('SELECT * FROM books WHERE isbn = ?').get(draft.isbn) }, created);
      assert.equal(fresh.prepare('SELECT count(*) AS count FROM books').get()!['count'], 2);
    } finally {
      fresh.close();
    }
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    database.close();
    await rm(directory, { recursive: true, force: true });
  }
});
