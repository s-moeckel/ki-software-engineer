import { expect, test as base } from '@playwright/test';

// Page mocks take precedence over context routes. Anything reaching this guard was not mocked.
export const test = base.extend({
  page: async ({ page }, use) => {
    const unexpected: string[] = [];
    await page.context().route(/^http:\/\/(?:localhost|127\.0\.0\.1|\[::1\]):4730(?:\/|$)/, route => {
      unexpected.push(`${route.request().method()} ${route.request().url()}`);
      return route.abort('blockedbyclient');
    });
    // Unrelated page tests use an explicitly empty release row; page mocks can override it.
    await page.context().route('http://localhost:4730/books/new-releases', route => route.fulfill({ json: [] }));
    await page
      .context()
      .route(/^https?:\/\/(?!localhost(?::|\/)|127\.0\.0\.1(?::|\/)|\[::1\](?::|\/))/, route =>
        route.abort('blockedbyclient')
      );
    // Keep the browser's local font fallback without failed stylesheet requests or remote downloads.
    await page
      .context()
      .route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: '' }));
    await use(page);
    expect(unexpected, 'Jeder Backend-Request muss im Test explizit gemockt sein.').toEqual([]);
  }
});

export { expect };
export type { Locator, Page, Route } from '@playwright/test';
