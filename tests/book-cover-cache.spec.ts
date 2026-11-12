import { expect, test } from '@playwright/test';
import { cachedCoverUrl } from '../src/app/books/cached-cover-url';
import { book } from './support/books';

const source = 'https://covers.openlibrary.org/b/isbn/9780441172719-L.jpg?default=false';
const cached = `http://localhost:4730/covers?url=${encodeURIComponent(source)}`;
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==',
  'base64'
);

test('only Open Library covers use the local cache; custom URLs stay unchanged', () => {
  expect(cachedCoverUrl(source)).toBe(cached);
  for (const value of [
    '',
    '/local.jpg',
    'data:image/png;base64,abc',
    'blob:http://localhost/id',
    'https://example.com/cover.jpg',
    'https://covers.openlibrary.org.evil.test/b/id/1-L.jpg'
  ]) {
    expect(cachedCoverUrl(value)).toBe(value);
  }
});

test('list and details use the cached image while the editor and PUT preserve the original URL', async ({ page }) => {
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

test('missing cached images retain the existing accessible fallback', async ({ page }) => {
  await page.route('http://localhost:4730/covers?**', route => route.fulfill({ status: 404 }));
  await page.route(/^http:\/\/localhost:4730\/books(?:\/|\?|$)/, route =>
    route.fulfill({ json: [{ ...book, cover: source }] })
  );
  await page.goto('http://localhost:4200');
  await expect(page.locator('app-book-item').getByText('No cover available')).toBeVisible();
});
