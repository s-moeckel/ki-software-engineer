import type { DatabaseSync } from 'node:sqlite';

type Cover = { status: 200; data: Buffer; contentType: string } | { status: 404 | 503; retryAfter: number };
interface CachedCover {
  status: number;
  data: Uint8Array | null;
  content_type: string | null;
  expires_at: number;
}
interface Options {
  fetcher: typeof fetch;
  now: () => number;
  concurrency: number;
  requestsPerWindow: number;
  windowMs: number;
  timeoutMs: number;
  maxBytes: number;
}

export function coverSource(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw Object.assign(new Error('Ungültige Cover-URL.'), { status: 400 });
  }
  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'covers.openlibrary.org' ||
    url.port ||
    url.username ||
    url.password ||
    !/^\/b\/(?:isbn|id|olid)\/[a-z0-9-]+-[SML]\.jpg$/i.test(url.pathname)
  ) {
    throw Object.assign(new Error('Nicht unterstützte Cover-Quelle.'), { status: 400 });
  }
  url.search = '?default=false';
  url.hash = '';
  return url.href;
}

function coverRedirect(value: string, base: string): string {
  const url = new URL(value, base);
  if (url.hostname === 'covers.openlibrary.org') return coverSource(url.href);
  const secure = url.protocol === 'https:' && !url.port && !url.username && !url.password;
  const coverArchive = (path: string) =>
    /^([sml]_covers_\d+)\/\1_\d+\.zip$/i.test(path) || /^(olcovers\d+)\/\1-[SML]\.zip$/i.test(path);
  const download = url.pathname.match(/^\/download\/(.+)\/\d+-[SML]\.jpg$/i);
  const archiveFile = url.hostname === 'archive.org' && !url.search && !!download && coverArchive(download[1]!);
  const archivePath = url.searchParams.get('archive')?.match(/^\/\d+\/items\/(.+)$/);
  const archiveServer =
    /^ia\d+\.us\.archive\.org$/.test(url.hostname) &&
    url.pathname === '/view_archive.php' &&
    [...url.searchParams.keys()].sort().join(',') === 'archive,file' &&
    !!archivePath &&
    coverArchive(archivePath[1]!) &&
    /^\d+-[SML]\.jpg$/i.test(url.searchParams.get('file') ?? '');
  if (!secure || (!archiveFile && !archiveServer)) {
    throw Object.assign(new Error('Nicht unterstützte Cover-Weiterleitung.'), { status: 400 });
  }
  url.hash = '';
  return url.href;
}

function imageType(bytes: Buffer): string | undefined {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (/^GIF8[79]a$/.test(bytes.subarray(0, 6).toString())) return 'image/gif';
  if (bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
  return undefined;
}

/** Persistent, on-demand cache. Original book cover URLs are never rewritten in the database. */
export class CoverCache {
  private readonly options: Options;
  private readonly pending = new Map<string, Promise<Cover>>();
  private readonly waiting: Array<() => void> = [];
  private readonly requests: number[] = [];
  private active = 0;
  private cooldownUntil = 0;

  constructor(
    private readonly database: DatabaseSync,
    options: Partial<Options> = {}
  ) {
    this.options = {
      fetcher: fetch,
      now: Date.now,
      concurrency: 4,
      requestsPerWindow: 90,
      windowMs: 300000,
      timeoutMs: 8000,
      maxBytes: 3 * 1024 * 1024,
      ...options
    };
    database.exec(`CREATE TABLE IF NOT EXISTS cover_cache (
      url TEXT NOT NULL PRIMARY KEY,
      status INTEGER NOT NULL,
      data BLOB,
      content_type TEXT,
      expires_at INTEGER NOT NULL
    ) STRICT`);
  }

  async get(source: string): Promise<Cover> {
    const url = coverSource(source);
    const cached = this.database.prepare('SELECT * FROM cover_cache WHERE url = ?').get(url) as unknown as
      | CachedCover
      | undefined;
    if (cached?.status === 200 && cached.data && cached.content_type) {
      return { status: 200, data: Buffer.from(cached.data), contentType: cached.content_type };
    }
    if (cached && cached.expires_at > this.options.now()) {
      return {
        status: cached.status === 404 ? 404 : 503,
        retryAfter: Math.ceil((cached.expires_at - this.options.now()) / 1000)
      };
    }
    const existing = this.pending.get(url);
    if (existing) return existing;
    const request = this.load(url).finally(() => this.pending.delete(url));
    this.pending.set(url, request);
    return request;
  }

  private async load(url: string): Promise<Cover> {
    while (this.active >= this.options.concurrency) await new Promise<void>(resolve => this.waiting.push(resolve));
    this.active++;
    try {
      const now = this.options.now();
      while (this.requests.length && this.requests[0]! <= now - this.options.windowMs) this.requests.shift();
      const availableAt = Math.max(
        this.cooldownUntil,
        this.requests.length >= this.options.requestsPerWindow ? this.requests[0]! + this.options.windowMs : 0
      );
      if (availableAt > now) return { status: 503, retryAfter: Math.ceil((availableAt - now) / 1000) };
      let target = url;
      const visited = new Set<string>();
      for (let redirects = 0; redirects <= 3; redirects++) {
        if (visited.has(target)) return this.failure(url, 503, 60000);
        visited.add(target);
        if (this.requests.length >= this.options.requestsPerWindow)
          return this.failure(url, 503, this.options.windowMs);
        this.requests.push(this.options.now());
        const response = await this.options.fetcher(target, {
          redirect: 'manual',
          signal: AbortSignal.timeout(this.options.timeoutMs),
          headers: { Accept: 'image/jpeg,image/png,image/webp,image/gif' }
        });
        if (response.status < 300 || response.status >= 400) return await this.consume(url, response);
        const location = response.headers.get('location');
        await response.body?.cancel();
        if (!location) return this.failure(url, 503, 60000);
        // Open Library serves many covers through its official Internet Archive ZIP/CDN endpoints.
        target = coverRedirect(location, target);
      }
      return this.failure(url, 503, 60000);
    } catch (error) {
      if (!(error instanceof Error && 'status' in error && error.status === 400)) {
        this.cooldownUntil = Math.max(this.cooldownUntil, this.options.now() + 60000);
      }
      return this.failure(url, 503, 60000);
    } finally {
      this.active--;
      this.waiting.shift()?.();
    }
  }

  private async consume(url: string, response: Response): Promise<Cover> {
    if (response.status === 404) {
      await response.body?.cancel();
      return this.failure(url, 404, 86400000);
    }
    if (!response.ok) {
      await response.body?.cancel();
      const delay = response.status === 403 || response.status === 429 ? this.options.windowMs : 60000;
      this.cooldownUntil = Math.max(this.cooldownUntil, this.options.now() + delay);
      return this.failure(url, 503, delay);
    }
    if (
      !response.headers.get('content-type')?.startsWith('image/') ||
      Number(response.headers.get('content-length')) > this.options.maxBytes ||
      !response.body
    ) {
      await response.body?.cancel();
      return this.failure(url, 503, 60000);
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > this.options.maxBytes) {
          await reader.cancel();
          return this.failure(url, 503, 60000);
        }
        chunks.push(chunk.value);
      }
    } finally {
      reader.releaseLock();
    }
    const data = Buffer.concat(chunks);
    const contentType = imageType(data);
    if (!contentType) return this.failure(url, 503, 60000);
    this.database
      .prepare(
        `INSERT OR REPLACE INTO cover_cache (url, status, data, content_type, expires_at)
      VALUES (?, 200, ?, ?, 0)`
      )
      .run(url, data, contentType);
    return { status: 200, data, contentType };
  }

  private failure(url: string, status: 404 | 503, delay: number): Cover {
    this.database
      .prepare(
        `INSERT INTO cover_cache (url, status, data, content_type, expires_at)
      VALUES (?, ?, NULL, NULL, ?)
      ON CONFLICT(url) DO UPDATE SET status = excluded.status, data = NULL,
        content_type = NULL, expires_at = excluded.expires_at
      WHERE cover_cache.status != 200`
      )
      .run(url, status, this.options.now() + delay);
    const current = this.database.prepare('SELECT * FROM cover_cache WHERE url = ?').get(url) as unknown as CachedCover;
    if (current.status === 200 && current.data && current.content_type) {
      return { status: 200, data: Buffer.from(current.data), contentType: current.content_type };
    }
    return { status, retryAfter: Math.ceil(delay / 1000) };
  }
}
