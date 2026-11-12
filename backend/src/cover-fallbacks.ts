/** Verified title cover when Open Library has no image for the catalogued edition.
 * The author's image shows the hardcover artwork, not necessarily this edition's jacket.
 * Source: https://www.andreaseschbach.de/werke/romane/teufg/teufg.html
 */
export const coverFallbacks: Readonly<Record<string, string>> = {
  '9783404177271': 'https://www.andreaseschbach.de/werke/romane/teufg/files/page152_1.jpg'
};

export function isbnCoverFallbacks(source: string): string[] {
  const url = new URL(source);
  const isbn =
    url.hostname === 'covers.openlibrary.org'
      ? url.pathname.match(/^\/b\/isbn\/(\d{13})-[SML]\.jpg$/i)?.[1]
      : undefined;
  if (!isbn) return [];
  const sources = [`https://www.bic-media.com/dmrs/cover.do?isbn=${isbn}&width=600`];
  // Only the 978 namespace has an ISBN-10 equivalent. Compute its own check digit.
  if (isbn.startsWith('978')) {
    const digits = isbn.slice(3, 12);
    const checksum =
      (11 - ([...digits].reduce((sum, digit, index) => sum + Number(digit) * (10 - index), 0) % 11)) % 11;
    const isbn10 = digits + (checksum === 10 ? 'X' : checksum);
    sources.push(`https://images-eu.ssl-images-amazon.com/images/P/${isbn10}.01.LZZZZZZZ.jpg`);
  }
  sources.push(`https://buch.isbn.de/cover/${isbn}.jpg`);
  return sources;
}
