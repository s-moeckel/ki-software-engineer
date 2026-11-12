/** Keep the original cover URL in the Book/editor; use the local cache only for display. */
export function cachedCoverUrl(source: string): string {
  try {
    const url = new URL(source);
    if (
      url.protocol === 'https:' &&
      url.hostname === 'covers.openlibrary.org' &&
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
