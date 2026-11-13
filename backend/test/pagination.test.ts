import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { once } from 'node:events';
import { after, before, test } from 'node:test';
import { openDatabase } from '../src/database.js';
import { createApp } from '../src/app.js';

const database = openDatabase(':memory:');
const server = createApp(database).listen(0, '127.0.0.1');
let baseUrl: string;

before(async () => {
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  baseUrl = `http://127.0.0.1:${address.port}`;
  database.exec(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8'));
  const insert = database.prepare(`INSERT INTO books
    (id, isbn, title, subtitle, author, publisher, "numPages", price, cover, abstract, "userId")
    VALUES (?, ?, ?, '', 'Author', '', 100, '', '', '', 1)`);
  for (let i = 1; i <= 23; i++) {
    const id = String(i).padStart(2, '0');
    insert.run(id, `isbn-${id}`, `${i % 2 ? 'Odd' : 'Even'} book ${id}`);
  }
});

after(async () => {
  await new Promise<void>((resolve, reject) => server.close(error => (error ? reject(error) : resolve())));
  database.close();
});

test('AK-1/2: stable pages, last page and out-of-range page keep the total', async () => {
  const ids: string[] = [];
  for (let page = 1; page <= 4; page++) {
    const response = await fetch(`${baseUrl}/books?_limit=10&_page=${page}`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('x-total-count'), '23');
    const books = (await response.json()) as { id: string }[];
    assert.equal(books.length, [10, 10, 3, 0][page - 1]);
    ids.push(...books.map(book => book.id));
  }
  assert.deepEqual(
    ids,
    Array.from({ length: 23 }, (_, i) => String(i + 1).padStart(2, '0'))
  );
});

test('AK-3: search filters the entire collection before pagination', async () => {
  const response = await fetch(`${baseUrl}/books?q=odd&_limit=10&_page=2`);
  assert.equal(response.headers.get('x-total-count'), '12');
  assert.deepEqual(
    ((await response.json()) as { id: string }[]).map(book => book.id),
    ['21', '23']
  );
});

test('AK-4: no matches return an empty page and zero total', async () => {
  const response = await fetch(`${baseUrl}/books?q=missing&_limit=10&_page=1`);
  assert.equal(response.headers.get('x-total-count'), '0');
  assert.deepEqual(await response.json(), []);
});

test('full collection and legacy limit requests remain compatible; CORS exposes the total', async () => {
  const response = await fetch(`${baseUrl}/books`, { headers: { Origin: 'http://localhost:4200' } });
  assert.equal(((await response.json()) as unknown[]).length, 23);
  assert.equal(response.headers.get('access-control-expose-headers'), 'X-Total-Count');
  assert.equal(((await (await fetch(`${baseUrl}/books?_limit=10`)).json()) as unknown[]).length, 10);
  assert.deepEqual(await (await fetch(`${baseUrl}/books?_limit=0`)).json(), []);
});

for (const query of [
  '_page=0&_limit=10',
  '_page=-1&_limit=10',
  '_page=1.5&_limit=10',
  '_page=abc&_limit=10',
  '_page=&_limit=10',
  '_page=1&_page=2&_limit=10',
  '_page[x]=1&_limit=10',
  '_page[toString]=x&_limit=10',
  '_page=9007199254740992&_limit=10',
  '_page=9007199254740991&_limit=10',
  '_page=1',
  '_page=1&_limit=0'
]) {
  test(`invalid pagination returns 400: ${query}`, async () => {
    assert.equal((await fetch(`${baseUrl}/books?${query}`)).status, 400);
  });
}
