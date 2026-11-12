import { expect, test } from '@playwright/test';
import { cachedCoverUrl } from '../src/app/books/cached-cover-url';
import { book } from './support/books';

const source = 'https://covers.openlibrary.org/b/isbn/9780441172719-L.jpg?default=false';
const authorSource = 'https://www.andreaseschbach.de/werke/romane/schlaumann/files/Schlaumann.jpg';
const cached = `http://localhost:4730/covers?url=${encodeURIComponent(source)}`;
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==',
  'base64'
);

test('supported cover sources use the local cache; custom URLs stay unchanged', () => {
  expect(cachedCoverUrl(source)).toBe(cached);
  expect(cachedCoverUrl(authorSource)).toBe(`http://localhost:4730/covers?url=${encodeURIComponent(authorSource)}`);
  const isbnSource = 'https://buch.isbn.de/cover/9783404209804.jpg';
  expect(cachedCoverUrl(isbnSource)).toBe(`http://localhost:4730/covers?url=${encodeURIComponent(isbnSource)}`);
  for (const value of [
    '',
    '/local.jpg',
    'data:image/png;base64,abc',
    'blob:http://localhost/id',
    'https://example.com/cover.jpg',
    'https://covers.openlibrary.org.evil.test/b/id/1-L.jpg',
    'https://www.andreaseschbach.de/privates/index.html',
    'https://buch.isbn.de/private.jpg',
    'https://buch.isbn.de.evil.test/cover/9783404209804.jpg',
    'https://www.andreaseschbach.de.evil.test/werke/romane/schlaumann/files/Schlaumann.jpg'
  ]) {
    expect(cachedCoverUrl(value)).toBe(value);
  }
});

for (const coverSource of [source, authorSource]) {
  test(`list and details cache ${new URL(coverSource).hostname} covers and preserve the original URL when editing`, async ({
    page
  }) => {
    const source = coverSource;
    const cached = `http://localhost:4730/covers?url=${encodeURIComponent(source)}`;
    const covered = { ...book, cover: source };
    let sentCover: string | undefined;
    let cacheRequests = 0;
    await page.route(/^https:\/\//, route => route.abort());
    await page.route('http://localhost:4730/covers?**', route => {
      expect(route.request().url()).toBe(cached);
      cacheRequests++;
      return route.fulfill({ contentType: 'image/png', body: png });
    });
    await page.route(/^http:\/\/localhost:4730\/books(?:\/|\?|$)/, route => {
      if (route.request().method() === 'PUT') {
        sentCover = route.request().postDataJSON().cover;
        return route.fulfill({ json: route.request().postDataJSON() });
      }
      return route.fulfill({ json: new URL(route.request().url()).pathname === '/books' ? [covered] : covered });
    });
    await page.goto('http://localhost:4200');
    const image = page.locator('app-book-item img');
    await expect(image).toHaveAttribute('src', cached);
    await expect.poll(() => image.evaluate((node: HTMLImageElement) => node.naturalWidth)).toBe(1);
    await page.getByRole('button', { name: `Details for ${book.title}`, exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.locator('img')).toHaveAttribute('src', cached);
    await dialog.getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(dialog.getByLabel('Cover URL', { exact: true })).toHaveValue(source);
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(dialog).toBeHidden();
    expect(sentCover).toBe(source);
    expect(cacheRequests).toBeGreaterThan(0);
  });
}

test('missing cached images retain the existing accessible fallback', async ({ page }) => {
  await page.route('http://localhost:4730/covers?**', route => route.fulfill({ status: 404 }));
  await page.route(/^http:\/\/localhost:4730\/books(?:\/|\?|$)/, route =>
    route.fulfill({ json: [{ ...book, cover: source }] })
  );
  await page.goto('http://localhost:4200');
  await expect(page.locator('app-book-item').getByText('No cover available')).toBeVisible();
});
