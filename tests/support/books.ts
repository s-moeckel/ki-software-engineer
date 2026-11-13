import { expect, Page, Route } from '@playwright/test';
import type { Book } from '../../src/app/books/book';

export const api = 'http://localhost:4730/books';
export const book: Book = {
  id: 'internal-42',
  isbn: '9781234567890',
  userId: 7,
  title: 'Angular in practice',
  subtitle: 'A practical guide',
  author: 'Jane Reader',
  publisher: 'Example Press',
  numPages: 250,
  price: '$29.90',
  cover: '',
  abstract: 'Build accessible applications.'
};

export function expectListRequest(route: Route): URL {
  const url = new URL(route.request().url());
  expect(route.request().method()).toBe('GET');
  expect(url.pathname).toBe('/books');
  expect(url.searchParams.get('_limit')).toBe('10');
  expect(url.searchParams.get('_page')).toBe('1');
  expect([...url.searchParams.keys()].sort()).toEqual(
    url.searchParams.has('q') ? ['_limit', '_page', 'q'] : ['_limit', '_page']
  );
  return url;
}

export function expectBookRequest(route: Route, methods = ['GET']): void {
  expect(methods).toContain(route.request().method());
  expect(route.request().url()).toBe(`${api}/${book.isbn}`);
}

export async function setup(page: Page): Promise<void> {
  // Block external assets so the product tests do not depend on third parties.
  await page.route(/^https:\/\//, route => route.abort());
  await page.route(`${api}*`, route => {
    expectListRequest(route);
    return route.fulfill({ json: [book] });
  });
  await page.route(`${api}/${book.isbn}`, route => {
    expectBookRequest(route);
    return route.fulfill({ json: book });
  });
  await page.goto('http://localhost:4200');
  // Lazy routes finish loading after the document navigation completes.
  await expect(page.getByRole('heading', { name: book.title, exact: true })).toBeVisible();
}
