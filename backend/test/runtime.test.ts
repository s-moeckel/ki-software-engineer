import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import type { Book } from '../src/book.js';

test('compiled backend initializes on startup and preserves updates across process restarts and init CLI', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'bookmonkey-runtime-'));
  const portProbe = createServer().listen(0, '127.0.0.1');
  await once(portProbe, 'listening');
  const address = portProbe.address();
  assert.ok(address && typeof address === 'object');
  const port = address.port;
  await new Promise<void>(resolve => portProbe.close(() => resolve()));
  const baseUrl = `http://127.0.0.1:${port}`;
  const env = {
    ...process.env,
    DATABASE_FILE: join(directory, 'books.sqlite'),
    PORT: String(port)
  };
  let server: ChildProcess | undefined;
  let output = '';
  function startChild(file: string) {
    const child = spawn(process.execPath, [fileURLToPath(new URL(`../dist/${file}`, import.meta.url))], {
      env,
      windowsHide: true,
      stdio: 'pipe'
    });
    child.stdout!.on('data', chunk => {
      output += String(chunk);
    });
    child.stderr!.on('data', chunk => {
      output += String(chunk);
    });
    return child;
  }
  async function start() {
    server = startChild('server.js');
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Backendstart fehlgeschlagen: ${output}`)), 10000);
      server!.once('error', error => {
        clearTimeout(timer);
        reject(error);
      });
      server!.once('exit', code => {
        clearTimeout(timer);
        reject(new Error(`Backendexit ${code}: ${output}`));
      });
      server!.stdout!.on('data', chunk => {
        if (String(chunk).includes('BookMonkey API')) {
          clearTimeout(timer);
          resolve();
        }
      });
    });
  }
  async function stop() {
    if (!server) return;
    const child = server;
    server = undefined;
    if (child.exitCode !== null) return;
    const exited = once(child, 'exit');
    child.kill();
    await exited;
  }
  try {
    await start();
    const books = (await (await fetch(`${baseUrl}/books`)).json()) as Book[];
    assert.equal(books.length, 1000);
    const edited = { ...books[0]!, title: 'Persistent Dune', price: '9.99' };
    const response = await fetch(`${baseUrl}/books/${edited.isbn}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(edited)
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), edited);
    const contents = await readFile(env.DATABASE_FILE);
    assert.equal(contents.subarray(0, 16).toString(), 'SQLite format 3\0');
    await stop();
    await start();
    assert.deepEqual(await (await fetch(`${baseUrl}/books/${edited.isbn}`)).json(), edited);
    const initializers = [startChild('init.js'), startChild('init.js')];
    const exits = await Promise.all(initializers.map(child => once(child, 'exit')));
    for (const [code] of exits) assert.equal(code, 0, output);
    assert.deepEqual(await (await fetch(`${baseUrl}/books/${edited.isbn}`)).json(), edited);
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
