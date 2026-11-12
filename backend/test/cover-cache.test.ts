import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';
import { CoverCache, coverSource } from '../src/cover-cache.js';
import { openDatabase } from '../src/database.js';
import { createApp } from '../src/app.js';

const url = 'https://covers.openlibrary.org/b/isbn/9780441172719-L.jpg?default=false';
const other = 'https://covers.openlibrary.org/b/isbn/9780593098233-L.jpg?default=false';
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==',
  'base64'
);
const image = () => new Response(png, { headers: { 'Content-Type': 'image/png' } });

test('images persist across database reopen and concurrent misses share one download', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'bookmonkey-cover-'));
  const filename = join(directory, 'cache.sqlite');
  let database = openDatabase(filename);
  let calls = 0;
  try {
    const cache = new CoverCache(database, {
      fetcher: async () => {
        calls++;
        return image();
      }
    });
    const results = await Promise.all(Array.from({ length: 10 }, () => cache.get(url)));
    assert.equal(calls, 1);
    for (const result of results) {
      assert.equal(result.status, 200);
      if (result.status === 200) assert.deepEqual(result.data, png);
    }
    database.close();
    database = openDatabase(filename);
    const reopened = new CoverCache(database, {
      fetcher: async () => {
        throw new Error('Must not access internet');
      }
    });
    assert.equal((await reopened.get(url)).status, 200);
    assert.equal(calls, 1);
    assert.equal((await reopened.get(other)).status, 503);
  } finally {
    database.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('missing covers are cached persistently for one day and retried after expiry', async () => {
  const database = openDatabase(':memory:');
  let now = 1000;
  let calls = 0;
  const fetcher: typeof fetch = async () => {
    calls++;
    return new Response(null, { status: calls === 1 ? 404 : 200, headers: { 'Content-Type': 'image/png' } });
  };
  try {
    const cache = new CoverCache(database, { now: () => now, fetcher });
    assert.equal((await cache.get(url)).status, 404);
    const restarted = new CoverCache(database, {
      now: () => now,
      fetcher: async () => {
        calls++;
        return image();
      }
    });
    assert.equal((await restarted.get(url)).status, 404);
    assert.equal(calls, 1);
    now += 86400001;
    assert.equal((await restarted.get(url)).status, 200);
    assert.equal(calls, 2);
  } finally {
    database.close();
  }
});

test('provider errors trigger a cooldown, retain existing images and recover later', async () => {
  const database = openDatabase(':memory:');
  let now = 1000;
  let calls = 0;
  try {
    const cache = new CoverCache(database, {
      now: () => now,
      fetcher: async () => {
        calls++;
        return calls === 2 ? new Response(null, { status: 429 }) : image();
      }
    });
    assert.equal((await cache.get(url)).status, 200);
    assert.equal((await cache.get(other)).status, 503);
    assert.equal((await cache.get(url)).status, 200);
    assert.equal((await cache.get(other.replace('-L.', '-M.'))).status, 503);
    assert.equal(calls, 2);
    now += 300001;
    assert.equal((await cache.get(other)).status, 200);
    assert.equal(calls, 3);
  } finally {
    database.close();
  }
});

test('a late failed download cannot overwrite an image saved by another cache instance', async () => {
  const database = openDatabase(':memory:');
  let release!: (response: Response) => void;
  try {
    const slow = new CoverCache(database, {
      fetcher: async () =>
        new Promise<Response>(resolve => {
          release = resolve;
        })
    });
    const fast = new CoverCache(database, { fetcher: async () => image() });
    const pending = slow.get(url);
    assert.equal((await fast.get(url)).status, 200);
    release(new Response(null, { status: 503 }));
    assert.equal((await pending).status, 200);
    assert.equal((await fast.get(url)).status, 200);
    assert.equal(database.prepare('SELECT status FROM cover_cache WHERE url = ?').get(url)!['status'], 200);
  } finally {
    database.close();
  }
});

test('upstream concurrency and request budget are bounded, and waiting downloads complete', async () => {
  const database = openDatabase(':memory:');
  let active = 0;
  let maximum = 0;
  let calls = 0;
  let now = 1000;
  try {
    const cache = new CoverCache(database, {
      concurrency: 2,
      requestsPerWindow: 3,
      now: () => now,
      fetcher: async () => {
        calls++;
        active++;
        maximum = Math.max(maximum, active);
        await new Promise(resolve => setTimeout(resolve, 10));
        active--;
        return image();
      }
    });
    const urls = Array.from({ length: 8 }, (_, index) => url.replace('9780441172719', `97804411727${index}`));
    const result = await Promise.all(urls.map(source => cache.get(source)));
    assert.equal(maximum, 2);
    assert.equal(calls, 3);
    assert.equal(result.filter(cover => cover.status === 200).length, 3);
    assert.equal(result.filter(cover => cover.status === 503).length, 5);
    now += 300001;
    assert.equal((await cache.get(urls[7]!)).status, 200);
    assert.equal(calls, 4);
  } finally {
    database.close();
  }
});

test('arbitrary URLs, private hosts and redirect targets cannot be proxied', async () => {
  for (const source of [
    'http://127.0.0.1/a.jpg',
    'https://example.com/x.jpg',
    'file:///etc/passwd',
    'https://covers.openlibrary.org.evil.test/b/id/1-L.jpg',
    'https://user:pass@covers.openlibrary.org/b/id/1-L.jpg',
    'https://covers.openlibrary.org:8443/b/id/1-L.jpg',
    'https://covers.openlibrary.org/b/../admin',
    'not-a-url'
  ]) {
    assert.throws(() => coverSource(source));
  }
  const database = openDatabase(':memory:');
  let calls = 0;
  try {
    const cache = new CoverCache(database, {
      fetcher: async () => {
        calls++;
        return new Response(null, { status: 302, headers: { Location: 'http://127.0.0.1/private' } });
      }
    });
    assert.equal((await cache.get(url)).status, 503);
    assert.equal(calls, 1);
  } finally {
    database.close();
  }
});

test('one safe redirect is followed and persisted under the original URL', async () => {
  const database = openDatabase(':memory:');
  let calls = 0;
  try {
    const cache = new CoverCache(database, {
      fetcher: async source => {
        calls++;
        if (calls === 1) return new Response(null, { status: 302, headers: { Location: '/b/id/123-M.jpg' } });
        assert.equal(String(source), 'https://covers.openlibrary.org/b/id/123-M.jpg?default=false');
        return image();
      }
    });
    assert.equal((await cache.get(url)).status, 200);
    assert.equal((await cache.get(url)).status, 200);
    assert.equal(calls, 2);
  } finally {
    database.close();
  }
});

test('official Open Library to Internet Archive to CDN redirects are loaded and cached', async () => {
  const archive = 'https://archive.org/download/l_covers_0014/l_covers_0014_32.zip/0014322962-L.jpg';
  const cdn =
    'https://ia600505.us.archive.org/view_archive.php?archive=/35/items/l_covers_0014/l_covers_0014_32.zip&file=0014322962-L.jpg';
  const database = openDatabase(':memory:');
  const seen: string[] = [];
  try {
    const cache = new CoverCache(database, {
      fetcher: async source => {
        seen.push(String(source));
        if (seen.length === 1) return new Response(null, { status: 302, headers: { Location: archive } });
        if (seen.length === 2) return new Response(null, { status: 302, headers: { Location: cdn } });
        return image();
      }
    });
    assert.equal((await cache.get(other)).status, 200);
    assert.equal((await cache.get(other)).status, 200);
    assert.deepEqual(seen, [other, archive, cdn]);
    assert.equal(database.prepare('SELECT status FROM cover_cache WHERE url = ?').get(other)!['status'], 200);
  } finally {
    database.close();
  }
});

test('archive redirects are restricted to cover files and do not disable unrelated downloads', async () => {
  const blocked = [
    'https://archive.org/download/private/secret.jpg',
    'http://archive.org/download/l_covers_0014/l_covers_0014_32.zip/0014322962-L.jpg',
    'https://ia600505.us.archive.org.evil.test/view_archive.php?archive=/35/items/l_covers_0014/l_covers_0014_32.zip&file=0014322962-L.jpg',
    'https://ia600505.us.archive.org/view_archive.php?archive=/35/items/private/secret.zip&file=0014322962-L.jpg',
    'https://ia600505.us.archive.org/view_archive.php?archive=/35/items/l_covers_0014/l_covers_0014_32.zip&file=../../secret.jpg',
    'https://ia600505.us.archive.org/view_archive.php?archive=/35/items/l_covers_0014/l_covers_0014_32.zip&file=0014322962-L.jpg&extra=x'
  ];
  for (const location of blocked) {
    const database = openDatabase(':memory:');
    let calls = 0;
    try {
      const cache = new CoverCache(database, {
        fetcher: async () => {
          calls++;
          return calls === 1 ? new Response(null, { status: 302, headers: { Location: location } }) : image();
        }
      });
      assert.equal((await cache.get(url)).status, 503, location);
      assert.equal(calls, 1);
      assert.equal((await cache.get(other)).status, 200);
      assert.equal(calls, 2);
    } finally {
      database.close();
    }
  }
});

test('legacy olcovers ZIP packages used by older editions also load through the official CDN', async () => {
  const archive = 'https://archive.org/download/olcovers28/olcovers28-L.zip/284479-L.jpg';
  const cdn =
    'https://ia800505.us.archive.org/view_archive.php?archive=/35/items/olcovers28/olcovers28-L.zip&file=284479-L.jpg';
  const database = openDatabase(':memory:');
  const seen: string[] = [];
  try {
    const cache = new CoverCache(database, {
      fetcher: async source => {
        seen.push(String(source));
        if (seen.length === 1) return new Response(null, { status: 302, headers: { Location: archive } });
        if (seen.length === 2) return new Response(null, { status: 302, headers: { Location: cdn } });
        return image();
      }
    });
    assert.equal((await cache.get(url)).status, 200);
    assert.deepEqual(seen, [url, archive, cdn]);
  } finally {
    database.close();
  }
});

test('redirect loops, excessive redirects and redirect request budgets terminate', async () => {
  for (const mode of ['loop', 'chain', 'budget']) {
    const database = openDatabase(':memory:');
    let calls = 0;
    try {
      const cache = new CoverCache(database, {
        requestsPerWindow: mode === 'budget' ? 1 : 90,
        fetcher: async () => {
          calls++;
          return new Response(null, {
            status: 302,
            headers: { Location: mode === 'loop' ? url : `/b/id/${calls}-L.jpg` }
          });
        }
      });
      assert.equal((await cache.get(url)).status, 503);
      assert.equal(calls, mode === 'chain' ? 4 : 1);
    } finally {
      database.close();
    }
  }
});

test('HTML, disguised images, oversized bodies and timeouts are not cached as images', async () => {
  const invalid = [
    async () => new Response('<html>error</html>', { headers: { 'Content-Type': 'text/html' } }),
    async () => new Response('<svg/>', { headers: { 'Content-Type': 'image/svg+xml' } }),
    async () => new Response(png, { headers: { 'Content-Type': 'image/png', 'Content-Length': '9000' } }),
    async () => new Response(new Uint8Array(5000), { headers: { 'Content-Type': 'image/png' } }),
    async (_source: unknown, options?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        options?.signal?.addEventListener('abort', () => reject(new Error('timeout')), { once: true });
      })
  ];
  for (const fetcher of invalid) {
    const database = openDatabase(':memory:');
    // AbortSignal.timeout uses an unreferenced timer, so keep this test alive until it fires.
    const keepAlive = setTimeout(() => {}, 1000);
    try {
      const cache = new CoverCache(database, { fetcher: fetcher as typeof fetch, maxBytes: 1000, timeoutMs: 20 });
      assert.equal((await cache.get(url)).status, 503);
      assert.equal(database.prepare('SELECT count(*) AS n FROM cover_cache WHERE status = 200').get()!['n'], 0);
    } finally {
      clearTimeout(keepAlive);
      database.close();
    }
  }
});

test('HTTP image endpoint enables browser caching and CORS; invalid requests fail', async () => {
  const database = openDatabase(':memory:');
  let calls = 0;
  const cache = new CoverCache(database, {
    fetcher: async () => {
      calls++;
      return image();
    }
  });
  const server = createApp(database, undefined, cache).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const base = `http://127.0.0.1:${address.port}`;
  try {
    for (let index = 0; index < 2; index++) {
      const response = await fetch(`${base}/covers?url=${encodeURIComponent(url)}`, {
        headers: { Origin: 'http://localhost:4200' }
      });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('content-type'), 'image/png');
      assert.equal(response.headers.get('cache-control'), 'public, max-age=86400');
      assert.equal(response.headers.get('access-control-allow-origin'), 'http://localhost:4200');
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), png);
    }
    assert.equal(calls, 1);
    for (const path of ['/covers', '/covers?url=x', '/covers?url=https://localhost/x.jpg', '/covers?url=a&url=b']) {
      assert.equal((await fetch(base + path)).status, 400);
    }
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    database.close();
  }
});
