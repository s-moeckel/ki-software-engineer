import { expect, test, type Page } from './support/ui-test';
import { api, book } from './support/books';

async function setupPagination(page: Page) {
  const state = { total: 23, fail: false, requests: [] as URL[] };
  await page.route(/^https:\/\//, route => route.abort());
  await page.route(`${api}*`, route => {
    if (route.request().method() === 'POST') {
      state.total++;
      return route.fulfill({ status: 201, json: { ...book, ...route.request().postDataJSON() } });
    }
    const url = new URL(route.request().url());
    state.requests.push(url);
    const current = Number(url.searchParams.get('_page') ?? 1);
    const total = url.searchParams.get('q') === 'empty' ? 0 : state.total;
    const books = Array.from({ length: Math.max(0, Math.min(10, total - (current - 1) * 10)) }, (_, i) => ({
      ...book,
      id: `book-${(current - 1) * 10 + i + 1}`,
      title: `Book ${(current - 1) * 10 + i + 1}`
    }));
    return route.fulfill(
      state.fail
        ? { status: 500, json: {} }
        : {
            headers: { 'X-Total-Count': String(total), 'Access-Control-Expose-Headers': 'X-Total-Count' },
            json: books
          }
    );
  });
  await page.goto('http://localhost:4200');
  await expect(page.getByRole('heading', { name: 'Book 1', exact: true })).toBeVisible();
  return state;
}

test('AK-1/2: shows ten books, navigates to the last page and back', async ({ page }) => {
  const state = await setupPagination(page);
  await expect(page.getByText('Seite 1 von 3 · 23 Bücher', { exact: true })).toBeVisible();
  await expect(page.locator('app-book-item')).toHaveCount(10);
  await expect(page.getByRole('button', { name: 'Zurück', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Weiter', exact: true }).click();
  await expect(page.getByText('Seite 2 von 3 · 23 Bücher', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Book 11', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Weiter', exact: true }).click();
  await expect(page.getByText('Seite 3 von 3 · 23 Bücher', { exact: true })).toBeVisible();
  await expect(page.locator('app-book-item')).toHaveCount(3);
  await expect(page.getByRole('button', { name: 'Weiter', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Zurück', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Book 11', exact: true })).toBeVisible();
  expect(state.requests.map(url => url.searchParams.get('_page'))).toEqual(['1', '2', '3', '2']);
  expect(state.requests.every(url => url.searchParams.get('_limit') === '10')).toBe(true);
});

test('AK-3: search and clear restart on page one', async ({ page }) => {
  const state = await setupPagination(page);
  await page.getByRole('button', { name: 'Weiter', exact: true }).click();
  await expect(page.getByText('Seite 2 von 3 · 23 Bücher', { exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: 'Search for books' }).fill('Book');
  await expect(page.getByText('Seite 1 von 3 · 23 Bücher', { exact: true })).toBeVisible();
  expect(state.requests.at(-1)!.searchParams.get('q')).toBe('Book');
  await page.getByRole('button', { name: 'Weiter', exact: true }).click();
  await expect(page.getByText('Seite 2 von 3 · 23 Bücher', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Clear search', exact: true }).click();
  await expect(page.getByText('Seite 1 von 3 · 23 Bücher', { exact: true })).toBeVisible();
  expect(state.requests.at(-1)!.searchParams.has('q')).toBe(false);
});

for (const emptySearch of [false, true]) {
  test(`AK-4: empty ${emptySearch ? 'search' : 'collection'} disables navigation`, async ({ page }) => {
    const state = await setupPagination(page);
    if (emptySearch) await page.getByRole('textbox', { name: 'Search for books' }).fill('empty');
    else {
      state.total = 0;
      await page.reload();
    }
    await expect(
      page.getByText(emptySearch ? 'No books match your search' : 'No books available', { exact: true })
    ).toBeVisible();
    await expect(page.getByText('Seite 1 von 1 · 0 Bücher', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Zurück', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Weiter', exact: true })).toBeDisabled();
  });
}

test('AK-5: retry preserves the requested page and search', async ({ page }) => {
  const state = await setupPagination(page);
  await page.getByRole('textbox', { name: 'Search for books' }).fill('Book');
  await expect.poll(() => state.requests.at(-1)!.searchParams.get('q')).toBe('Book');
  await expect(page.getByRole('button', { name: 'Weiter', exact: true })).toBeEnabled();
  state.fail = true;
  await page.getByRole('button', { name: 'Weiter', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Could not load books.');
  state.fail = false;
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.getByText('Seite 2 von 3 · 23 Bücher', { exact: true })).toBeVisible();
  expect(state.requests.slice(-2).map(url => [url.searchParams.get('_page'), url.searchParams.get('q')])).toEqual([
    ['2', 'Book'],
    ['2', 'Book']
  ]);
});

test('AK-5: search invalidates a pending page response and its total', async ({ page }) => {
  await setupPagination(page);
  let release!: () => void;
  const pending = new Promise<void>(resolve => (release = resolve));
  let started = false;
  await page.route(`${api}*`, async route => {
    if (new URL(route.request().url()).searchParams.get('_page') !== '2') return route.fallback();
    started = true;
    await pending;
    await route.fulfill({
      headers: { 'X-Total-Count': '999', 'Access-Control-Expose-Headers': 'X-Total-Count' },
      json: [{ ...book, title: 'Outdated page' }]
    });
  });
  await page.getByRole('button', { name: 'Weiter', exact: true }).click();
  await expect.poll(() => started).toBe(true);
  await expect(page.getByText('Loading books...', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Weiter', exact: true })).toBeDisabled();
  await page.getByRole('textbox', { name: 'Search for books' }).fill('empty');
  release();
  await expect(page.getByText('Seite 1 von 1 · 0 Bücher', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Outdated page' })).toHaveCount(0);
});

for (const shrink of [false, true]) {
  test(`AK-6: dialog refresh ${shrink ? 'moves to the last valid page' : 'keeps the current page and search'}`, async ({
    page
  }) => {
    const state = await setupPagination(page);
    await page.getByRole('textbox', { name: 'Search for books' }).fill('Book');
    await expect.poll(() => state.requests.at(-1)!.searchParams.get('q')).toBe('Book');
    await expect(page.getByRole('button', { name: 'Weiter', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Weiter', exact: true }).click();
    await expect(page.getByText('Seite 2 von 3 · 23 Bücher', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Buch anlegen', exact: true }).click();
    const dialog = page.getByRole('dialog');
    for (const [label, value] of Object.entries({
      ISBN: 'new-isbn',
      Titel: 'New Book',
      Autor: 'Author',
      Seitenzahl: '100'
    })) {
      await dialog.getByLabel(label, { exact: true }).fill(value);
    }
    if (shrink) state.total = 4;
    await dialog.getByRole('button', { name: 'Buch anlegen', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(
      page.getByText(shrink ? 'Seite 1 von 1 · 5 Bücher' : 'Seite 2 von 3 · 24 Bücher', { exact: true })
    ).toBeVisible();
    expect(state.requests.at(-1)!.searchParams.get('q')).toBe('Book');
    if (shrink) expect(state.requests.slice(-2).map(url => url.searchParams.get('_page'))).toEqual(['2', '1']);
  });
}

test('AK-7: keyboard navigation fits a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await setupPagination(page);
  const next = page.getByRole('button', { name: 'Weiter', exact: true });
  await next.focus();
  await expect(next).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByText('Seite 2 von 3 · 23 Bücher', { exact: true })).toBeVisible();
  const previous = page.getByRole('button', { name: 'Zurück', exact: true });
  await previous.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('Seite 1 von 3 · 23 Bücher', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('AK-6: editing the last search result on a page reloads the last valid page', async ({ page }) => {
  const state = await setupPagination(page);
  await page.getByRole('textbox', { name: 'Search for books' }).fill('Book');
  await expect.poll(() => state.requests.at(-1)!.searchParams.get('q')).toBe('Book');
  await expect(page.getByRole('button', { name: 'Weiter', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Weiter', exact: true }).click();
  await expect(page.getByText('Seite 2 von 3 · 23 Bücher', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Weiter', exact: true }).click();
  await expect(page.getByText('Seite 3 von 3 · 23 Bücher', { exact: true })).toBeVisible();
  await page.route(`${api}/${book.isbn}`, route => {
    if (route.request().method() === 'PUT') {
      state.total = 20;
      return route.fulfill({ json: { ...book, ...route.request().postDataJSON() } });
    }
    return route.fulfill({ json: { ...book, title: 'Book 21' } });
  });
  await page.getByRole('button', { name: 'Details for Book 21', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Edit', exact: true }).click();
  await dialog.getByLabel('Title', { exact: true }).fill('Changed');
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText('Seite 2 von 2 · 20 Bücher', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Book 11', exact: true })).toBeVisible();
  expect(state.requests.slice(-2).map(url => [url.searchParams.get('_page'), url.searchParams.get('q')])).toEqual([
    ['3', 'Book'],
    ['2', 'Book']
  ]);
});

test('AK-5: leaving the list cancels an in-flight page and returning starts on page one', async ({ page }) => {
  const state = await setupPagination(page);
  let release!: () => void;
  const pending = new Promise<void>(resolve => (release = resolve));
  let requested = false;
  await page.route(`${api}*`, async route => {
    if (new URL(route.request().url()).searchParams.get('_page') !== '2') return route.fallback();
    requested = true;
    await pending;
    await route.fulfill({ json: [{ ...book, title: 'Old second page' }] });
  });
  await page.getByRole('button', { name: 'Weiter', exact: true }).click();
  await expect.poll(() => requested).toBe(true);
  await page.getByRole('link', { name: 'Virtual Library öffnen', exact: true }).click();
  await expect(page).toHaveURL(/\/library$/);
  release();
  await page.getByRole('link', { name: 'Listenansicht öffnen', exact: true }).click();
  await expect(page.getByText('Seite 1 von 3 · 23 Bücher', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Old second page', exact: true })).toHaveCount(0);
  expect(state.requests.at(-1)!.searchParams.get('_page')).toBe('1');
});
