const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { once } = require('node:events');
const { resolve } = require('node:path');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { InMemoryTransport } = require('@modelcontextprotocol/sdk/inMemory.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const { createBookServer } = require('../../../dist/book-mcp/server.js');

const book = {
  id: '1',
  isbn: '9780441172719',
  title: 'Dune',
  author: 'Frank Herbert',
  publisher: 'Ace',
  numPages: 412,
  price: '',
  cover: '',
  abstract: 'Arrakis',
  userId: 1
};

async function connect(t, options) {
  const server = createBookServer(options);
  const client = new Client({ name: 'book-mcp-test', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  t.after(async () => {
    await client.close();
    await server.close();
  });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return client;
}

function content(result) {
  assert.equal(result.isError, undefined);
  return JSON.parse(result.content[0].text);
}

test('MCP advertises exactly three read-only tools', async t => {
  const client = await connect(t);
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map(tool => tool.name).sort(), ['get_book', 'list_books', 'search_books']);
  for (const tool of tools) assert.equal(tool.annotations.readOnlyHint, true);
});

test('list, search and detail map to encoded GET requests and preserve book fields', async t => {
  const urls = [];
  const client = await connect(t, {
    apiUrl: 'http://localhost:4730/api',
    fetch: async (url, options) => {
      urls.push(url);
      assert.equal(options.method, undefined);
      assert.equal(options.headers.Accept, 'application/json');
      assert.ok(options.signal instanceof AbortSignal);
      return Response.json(url.pathname.startsWith('/api/books/') ? book : [book]);
    }
  });
  assert.deepEqual(content(await client.callTool({ name: 'list_books', arguments: {} })), [book]);
  assert.equal(urls.at(-1).search, '');
  await client.callTool({ name: 'list_books', arguments: { limit: 0 } });
  assert.equal(urls.at(-1).searchParams.get('_limit'), '0');
  await client.callTool({ name: 'search_books', arguments: { query: '  Düne & 100%_  ', limit: 2 } });
  assert.equal(urls.at(-1).searchParams.get('q'), 'Düne & 100%_');
  assert.equal(urls.at(-1).searchParams.get('_limit'), '2');
  assert.equal(urls.at(-1).pathname, '/api/books');
  assert.deepEqual(content(await client.callTool({ name: 'get_book', arguments: { isbn: 'test/?#' } })), book);
  assert.equal(urls.at(-1).pathname, '/api/books/test%2F%3F%23');
});

test('invalid input is rejected before accessing the backend', async t => {
  let calls = 0;
  const client = await connect(t, {
    fetch: async () => {
      calls++;
      return Response.json([]);
    }
  });
  for (const args of [{ limit: -1 }, { limit: 1.5 }, { limit: Number.MAX_SAFE_INTEGER + 1 }]) {
    assert.equal((await client.callTool({ name: 'list_books', arguments: args })).isError, true);
  }
  for (const query of ['', '   ', 'x'.repeat(501)]) {
    assert.equal((await client.callTool({ name: 'search_books', arguments: { query } })).isError, true);
  }
  assert.equal((await client.callTool({ name: 'get_book', arguments: { isbn: '' } })).isError, true);
  assert.equal(calls, 0);
});

test('empty results, HTTP errors, invalid data, invalid JSON and offline API are handled', async t => {
  const replies = [
    () => Response.json([]),
    () => Response.json({ error: 'missing' }, { status: 404 }),
    () => Response.json({ error: 'unavailable' }, { status: 503 }),
    () => Response.json([{ title: 'incomplete' }]),
    () => new Response('invalid JSON'),
    () => {
      throw new TypeError('fetch failed');
    }
  ];
  const client = await connect(t, { fetch: async () => replies.shift()() });
  assert.deepEqual(content(await client.callTool({ name: 'list_books', arguments: {} })), []);
  for (const expected of [/404/, /503/, /Buchformat/, /JSON/, /npm run backend/]) {
    const result = await client.callTool({ name: 'list_books', arguments: {} });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, expected);
  }
});

test('slow HTTP requests are aborted with a tool error', async t => {
  const http = createServer(() => {});
  http.listen(0, '127.0.0.1');
  await once(http, 'listening');
  t.after(() => {
    http.closeAllConnections();
    http.close();
  });
  const client = await connect(t, { apiUrl: `http://127.0.0.1:${http.address().port}`, timeoutMs: 30 });
  const result = await client.callTool({ name: 'list_books', arguments: {} });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /Zeitüberschreitung/);
});

test('stdio entry point supports handshake and HTTP reads without stdout noise', async t => {
  const requests = [];
  const http = createServer((req, res) => {
    requests.push({ method: req.method, url: req.url });
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(req.url.startsWith('/books/') ? book : [book]));
  });
  http.listen(0, '127.0.0.1');
  await once(http, 'listening');
  t.after(() => {
    http.closeAllConnections();
    http.close();
  });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [resolve(__dirname, '../../../dist/book-mcp/index.js')],
    env: { ...process.env, BOOKMONKEY_API_URL: `http://127.0.0.1:${http.address().port}` },
    stderr: 'pipe'
  });
  const errors = [];
  transport.onerror = error => errors.push(error);
  const client = new Client({ name: 'stdio-test', version: '1.0.0' });
  t.after(() => client.close());
  await client.connect(transport);
  assert.equal(client.getServerVersion().name, 'bookmonkey-mcp');
  assert.equal((await client.listTools()).tools.length, 3);
  assert.deepEqual(content(await client.callTool({ name: 'list_books', arguments: { limit: 10 } })), [book]);
  assert.deepEqual(content(await client.callTool({ name: 'get_book', arguments: { isbn: book.isbn } })), book);
  assert.deepEqual(requests, [
    { method: 'GET', url: '/books?_limit=10' },
    { method: 'GET', url: `/books/${book.isbn}` }
  ]);
  assert.deepEqual(errors, []);
});
