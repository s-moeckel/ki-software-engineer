/** Keep the original cover URL in the Book/editor; use the local cache only for display. */
export function cachedCoverUrl(source: string): string {
  try {
    const url = new URL(source);
    if (
      url.protocol === 'https:' &&
      (url.hostname === 'covers.openlibrary.org' ||
        (url.hostname === 'buch.isbn.de' && /^\/cover\/\d{13}\.jpg$/.test(url.pathname)) ||
        (url.hostname === 'www.andreaseschbach.de' &&
          /^\/werke\/romane\/[a-z0-9_-]+\/files\/[a-z0-9_-]+\.(?:jpg|jpeg|png|webp)$/i.test(url.pathname))) &&
      !url.port &&
      !url.username &&
      !url.password
    ) {
      return `http://localhost:4730/covers?url=${encodeURIComponent(source)}`;
    }
  } catch {
    // Empty, relative, blob and data URLs retain their existing rendering behavior.
  }
  return source;
}
