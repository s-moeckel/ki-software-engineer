import { isValidIsbn } from './isbn';

export interface GoogleBooksInformation {
  description?: string;
  averageRating?: number;
  ratingsCount?: number;
  sourceUrl?: string;
}

export function normalizeGoogleBooksIsbn(isbn: string): string {
  return isbn.replace(/[\s-]/g, '').toUpperCase();
}

function editionIsbn(isbn: string): string {
  const normalized = normalizeGoogleBooksIsbn(isbn);
  if (normalized.length !== 10 || !isValidIsbn(normalized)) return normalized;
  const prefix = `978${normalized.slice(0, 9)}`;
  const sum = [...prefix].reduce((total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 1 : 3), 0);
  return `${prefix}${(10 - (sum % 10)) % 10}`;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function sourceLink(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  try {
    const url = new URL(value);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      !['books.google.com', 'books.google.de', 'books.google.co.uk'].includes(url.hostname) ||
      url.port ||
      url.username ||
      url.password ||
      !/^\/books(?:\/|$)/.test(url.pathname)
    )
      return undefined;
    url.protocol = 'https:';
    return url.href;
  } catch {
    return undefined;
  }
}

/** Google search is fuzzy; only a volume identifying this ISBN edition may be shown. */
export function findGoogleBooksInformation(response: unknown, isbn: string): GoogleBooksInformation | null {
  const target = editionIsbn(isbn);
  const items = record(response)?.['items'];
  if (!target || !Array.isArray(items)) return null;
  for (const item of items) {
    const volume = record(item);
    const info = record(volume?.['volumeInfo']);
    const identifiers = info?.['industryIdentifiers'];
    if (!info || !Array.isArray(identifiers)) continue;
    const matches = identifiers.some(value => {
      const identifier = record(value);
      return (
        (identifier?.['type'] === 'ISBN_10' || identifier?.['type'] === 'ISBN_13') &&
        typeof identifier['identifier'] === 'string' &&
        editionIsbn(identifier['identifier']) === target
      );
    });
    if (!matches) continue;

    const result: GoogleBooksInformation = {};
    const description = info['description'];
    const rating = info['averageRating'];
    const count = info['ratingsCount'];
    if (typeof description === 'string' && description.trim()) result.description = description;
    if (typeof rating === 'number' && Number.isFinite(rating) && rating >= 0 && rating <= 5) {
      result.averageRating = rating;
    }
    if (typeof count === 'number' && Number.isSafeInteger(count) && count >= 0) result.ratingsCount = count;
    const id = volume?.['id'];
    const link =
      sourceLink(info['infoLink']) ??
      sourceLink(info['canonicalVolumeLink']) ??
      (typeof id === 'string' && id.trim() ? `https://books.google.com/books?id=${encodeURIComponent(id)}` : undefined);
    if (link) result.sourceUrl = link;
    return result;
  }
  return null;
}
