import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { CoverCache, coverSource } from '../src/cover-cache.js';
import { openDatabase } from '../src/database.js';
import { createApp } from '../src/app.js';

// Cover IDs isolate cache/transport checks from the ISBN fallback chain tested separately below.
const url = 'https://covers.openlibrary.org/b/id/9780441172719-L.jpg?default=false';
const other = 'https://covers.openlibrary.org/b/id/9780593098233-L.jpg?default=false';
const authorCover = 'https://www.andreaseschbach.de/werke/romane/schlaumann/files/Schlaumann.jpg';
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

test('author covers share downloads and persist across database reopen without upstream access', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'bookmonkey-author-cover-'));
  const filename = join(directory, 'cache.sqlite');
  let database = openDatabase(filename);
  let calls = 0;
  try {
    const cache = new CoverCache(database, {
      fetcher: async source => {
        assert.equal(String(source), authorCover);
        calls++;
        return image();
      }
    });
    const results = await Promise.all([cache.get(authorCover), cache.get(authorCover)]);
    assert.equal(calls, 1);
    assert.ok(results.every(result => result.status === 200));
    database.close();
    database = openDatabase(filename);
    const reopened = new CoverCache(database, {
      fetcher: async () => {
        calls++;
        throw new Error('Upstream unavailable');
      }
    });
    const result = await reopened.get(authorCover);
    assert.equal(result.status, 200);
    if (result.status === 200) assert.deepEqual(result.data, png);
    assert.equal(calls, 1);
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

test('Teufelsgold uses a verified title cover even when an earlier 404 is still cached', async () => {
  const database = openDatabase(':memory:');
  const missing = 'https://covers.openlibrary.org/b/isbn/9783404177271-L.jpg?default=false';
  const fallback = 'https://www.andreaseschbach.de/werke/romane/teufg/files/page152_1.jpg';
  const seen: string[] = [];
  try {
    database.exec(`CREATE TABLE cover_cache (
      url TEXT PRIMARY KEY, status INTEGER, data BLOB, content_type TEXT, expires_at INTEGER
    )`);
    database.prepare('INSERT INTO cover_cache VALUES (?, 404, NULL, NULL, ?)').run(missing, Date.now() + 86400000);
    const cache = new CoverCache(database, {
      concurrency: 1,
      fetcher: async source => {
        seen.push(String(source));
        return image();
      }
    });
    const result = await cache.get(missing);
    assert.equal(result.status, 200);
    if (result.status === 200) assert.deepEqual(result.data, png);
    assert.deepEqual(seen, [fallback]);
    const restarted = new CoverCache(database, {
      fetcher: async () => {
        throw new Error('Must use persisted fallback');
      }
    });
    assert.equal((await restarted.get(missing)).status, 200);
    assert.deepEqual(seen, [fallback]);
  } finally {
    database.close();
  }
});

test('a fresh missing Teufelsgold cover falls back without deadlocking a single download slot', async () => {
  const database = openDatabase(':memory:');
  const missing = 'https://covers.openlibrary.org/b/isbn/9783404177271-L.jpg?default=false';
  const seen: string[] = [];
  try {
    const cache = new CoverCache(database, {
      concurrency: 1,
      fetcher: async source => {
        seen.push(String(source));
        return seen.length === 1 ? new Response(null, { status: 404 }) : image();
      }
    });
    assert.equal((await cache.get(missing)).status, 200);
    assert.equal(seen.length, 2);
    assert.equal(seen[0], missing);
  } finally {
    database.close();
  }
});

test('ISBN fallback covers multiple authors, shares downloads and caches the exact ISBN image', async () => {
  const database = openDatabase(':memory:');
  const seen: string[] = [];
  const isbns = ['9783404209804', '9783695710010', '9783864025396'];
  try {
    const cache = new CoverCache(database, {
      fetcher: async source => {
        const url = String(source);
        seen.push(url);
        return url.startsWith('https://covers.openlibrary.org/') ||
          url.startsWith('https://www.bic-media.com/') ||
          url.startsWith('https://images-eu.ssl-images-amazon.com/')
          ? new Response(null, { status: 404 })
          : image();
      }
    });
    for (const isbn of isbns) {
      const url = `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg?default=false`;
      const results = await Promise.all([cache.get(url), cache.get(url)]);
      assert.ok(results.every(result => result.status === 200));
      assert.equal((await cache.get(url)).status, 200);
      assert.equal(seen.filter(url => url === `https://buch.isbn.de/cover/${isbn}.jpg`).length, 1);
    }
    assert.equal(seen.length, 12);
  } finally {
    database.close();
  }
});

test('an exhausted or throttled Open Library provider does not block ISBN fallback downloads', async () => {
  for (const status of [404, 429]) {
    const database = openDatabase(':memory:');
    const seen: string[] = [];
    try {
      const cache = new CoverCache(database, {
        requestsPerWindow: 1,
        fetcher: async source => {
          seen.push(String(source));
          return seen.length === 1 ? new Response(null, { status }) : image();
        }
      });
      assert.equal((await cache.get('https://covers.openlibrary.org/b/isbn/9783404209804-L.jpg')).status, 200);
      assert.equal(seen.length, 2);
      assert.equal(seen[1], 'https://www.bic-media.com/dmrs/cover.do?isbn=9783404209804&width=600');
    } finally {
      database.close();
    }
  }
});

test('the secondary provider missing-image placeholder is recorded as 404, never as a real cover', async () => {
  const database = openDatabase(':memory:');
  const placeholder = readFileSync(new URL('./fixtures/isbn-missing.jpg', import.meta.url));
  let calls = 0;
  try {
    const cache = new CoverCache(database, {
      fetcher: async () => {
        calls++;
        return new Response(placeholder, { headers: { 'Content-Type': 'image/jpeg' } });
      }
    });
    const url = 'https://buch.isbn.de/cover/9780000000019.jpg';
    assert.equal((await cache.get(url)).status, 404);
    assert.equal((await cache.get(url)).status, 404);
    assert.equal(calls, 1);
    assert.equal(database.prepare('SELECT count(*) AS n FROM cover_cache WHERE status = 200').get()!['n'], 0);
  } finally {
    database.close();
  }
});

test('the secondary provider no-picture redirect is a persistent 404 and is not downloaded', async () => {
  const database = openDatabase(':memory:');
  let calls = 0;
  try {
    const cache = new CoverCache(database, {
      fetcher: async () => {
        calls++;
        return new Response(null, { status: 302, headers: { Location: '/nopic.png' } });
      }
    });
    const url = 'https://buch.isbn.de/cover/9781511515351.jpg';
    assert.equal((await cache.get(url)).status, 404);
    assert.equal((await cache.get(url)).status, 404);
    assert.equal(calls, 1);
  } finally {
    database.close();
  }
});

test('BIC Media empty and blank responses fall through to the next ISBN provider', async () => {
  const blank = readFileSync(new URL('./fixtures/bic-missing.jpg', import.meta.url));
  for (const data of [Buffer.alloc(0), blank]) {
    const database = openDatabase(':memory:');
    const seen: string[] = [];
    try {
      const cache = new CoverCache(database, {
        fetcher: async source => {
          const url = String(source);
          seen.push(url);
          if (url.startsWith('https://covers.openlibrary.org/')) return new Response(null, { status: 404 });
          if (url.startsWith('https://www.bic-media.com/'))
            return new Response(data, { headers: { 'Content-Type': 'image/jpeg' } });
          return image();
        }
      });
      assert.equal((await cache.get('https://covers.openlibrary.org/b/isbn/9783404209804-L.jpg')).status, 200);
      assert.equal(seen.length, 3);
      assert.equal(
        database.prepare("SELECT status FROM cover_cache WHERE url LIKE 'https://www.bic-media.com/%'").get()![
          'status'
        ],
        404
      );
    } finally {
      database.close();
    }
  }
});

test('the Amazon fallback uses the ISBN-10 check digit and skips ISBNs without a 978 equivalent', async () => {
  for (const [isbn, expected] of [
    ['9783404209804', '340420980X'],
    ['9783695710010', '3695710012'],
    ['9791234567896', undefined]
  ]) {
    const database = openDatabase(':memory:');
    const seen: string[] = [];
    try {
      const cache = new CoverCache(database, {
        fetcher: async source => {
          const url = String(source);
          seen.push(url);
          return url.includes('ssl-images-amazon.com') || url.includes('buch.isbn.de')
            ? image()
            : new Response(null, { status: 404 });
        }
      });
      assert.equal((await cache.get(`https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg`)).status, 200);
      const amazon = seen.find(url => url.includes('ssl-images-amazon.com'));
      assert.equal(
        amazon,
        expected ? `https://images-eu.ssl-images-amazon.com/images/P/${expected}.01.LZZZZZZZ.jpg` : undefined
      );
    } finally {
      database.close();
    }
  }
});

test('a one-pixel Amazon placeholder falls through to the remaining provider', async () => {
  const database = openDatabase(':memory:');
  const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
  try {
    const cache = new CoverCache(database, {
      fetcher: async source => {
        const url = String(source);
        if (url.includes('ssl-images-amazon.com'))
          return new Response(gif, { headers: { 'Content-Type': 'image/gif' } });
        return url.includes('buch.isbn.de') ? image() : new Response(null, { status: 404 });
      }
    });
    const result = await cache.get('https://covers.openlibrary.org/b/isbn/9783404209804-L.jpg');
    assert.equal(result.status, 200);
    if (result.status === 200) assert.deepEqual(result.data, png);
    assert.equal(
      database
        .prepare("SELECT status FROM cover_cache WHERE url LIKE 'https://images-eu.ssl-images-amazon.com/%'")
        .get()!['status'],
      404
    );
  } finally {
    database.close();
  }
});

test('a later missing image does not hide a temporarily unavailable cover provider', async () => {
  const database = openDatabase(':memory:');
  try {
    const cache = new CoverCache(database, {
      fetcher: async source =>
        new Response(null, {
          status: String(source).includes('ssl-images-amazon.com') ? 429 : 404,
          headers: { 'Retry-After': '600' }
        })
    });
    const result = await cache.get('https://covers.openlibrary.org/b/isbn/9783404209804-L.jpg');
    assert.equal(result.status, 503);
    if (result.status !== 200) assert.equal(result.retryAfter, 600);
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
    'https://www.andreaseschbach.de/privates/index.html',
    'https://www.andreaseschbach.de/werke/romane/schlaumann/files/cover.svg',
    'https://www.andreaseschbach.de.evil.test/werke/romane/schlaumann/files/Schlaumann.jpg',
    'https://user:pass@www.andreaseschbach.de/werke/romane/schlaumann/files/Schlaumann.jpg',
    'http://www.andreaseschbach.de/werke/romane/schlaumann/files/Schlaumann.jpg',
    'https://buch.isbn.de/private.jpg',
    'https://buch.isbn.de.evil.test/cover/9783404209804.jpg',
    'https://user:pass@buch.isbn.de/cover/9783404209804.jpg',
    'https://www.bic-media.com/dmrs/cover.do?isbn=9783404209804&width=600&url=http://localhost',
    'https://www.bic-media.com/dmrs/cover.do?isbn=9783404209804&width=999999',
    'https://images-eu.ssl-images-amazon.com/private.jpg',
    'https://images-eu.ssl-images-amazon.com.evil.test/images/P/340420980X.01.LZZZZZZZ.jpg',
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

test('author covers reject redirects to unrelated hosts and pages', async () => {
  for (const location of ['https://example.com/cover.jpg', 'http://127.0.0.1/private', '/privates/index.html']) {
    const database = openDatabase(':memory:');
    let calls = 0;
    try {
      const cache = new CoverCache(database, {
        fetcher: async () => {
          calls++;
          return new Response(null, { status: 302, headers: { Location: location } });
        }
      });
      assert.equal((await cache.get(authorCover)).status, 503);
      assert.equal(calls, 1);
    } finally {
      database.close();
    }
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
