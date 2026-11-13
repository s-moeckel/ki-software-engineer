import { expect, Locator, Page, test } from '@playwright/test';
import { book } from './support/books';

const endpoint = 'http://localhost:4730/reading-list';
const titles = ['möchte ich lesen', 'lese ich gerade', 'gelesen'];
const statuses = ['want-to-read', 'reading', 'read'];
const books = [
  book,
  { ...book, id: 'b', isbn: 'second/isbn', title: 'Second book' },
  { ...book, id: 'c', isbn: 'third', title: 'Third book' }
];
interface Entry {
  isbn: string;
  status: string;
  position: number;
  book: typeof book;
}

async function setup(page: Page, initial = 0) {
  const state = {
    entries: books
      .slice(0, initial)
      .map((book, position): Entry => ({ isbn: book.isbn, status: statuses[0], position, book })),
    failure: '' as '' | 'reject' | 'lost-saved' | 'lost-unsaved',
    loadFails: false,
    writes: 0,
    reads: 0
  };
  await page.route(/^https:\/\//, route => route.abort());
  await page.route(/^http:\/\/localhost:4730\/books(?:\/|\?|$)/, route => {
    const isbn = decodeURIComponent(new URL(route.request().url()).pathname.slice('/books/'.length));
    return route.fulfill({ json: books.find(b => b.isbn === isbn) ?? books });
  });
  await page.route(/^http:\/\/localhost:4730\/reading-list(?:\/|$)/, async route => {
    const method = route.request().method();
    if (method === 'GET') {
      state.reads++;
      return state.loadFails ? route.fulfill({ status: 503, json: {} }) : route.fulfill({ json: state.entries });
    }
    state.writes++;
    const failure = state.failure;
    state.failure = '';
    if (failure === 'reject') return route.fulfill({ status: 503, json: {} });
    if (failure !== 'lost-unsaved') {
      const isbn = decodeURIComponent(new URL(route.request().url()).pathname.slice('/reading-list/'.length));
      if (method === 'POST') {
        const selected = books.find(b => b.isbn === route.request().postDataJSON().isbn)!;
        if (!state.entries.some(e => e.isbn === selected.isbn))
          state.entries.push({
            isbn: selected.isbn,
            status: statuses[0],
            position: state.entries.filter(e => e.status === statuses[0]).length,
            book: selected
          });
      } else {
        const entry = state.entries.find(e => e.isbn === isbn)!;
        const remainder = state.entries.filter(e => e !== entry);
        if (method === 'PUT') {
          const { status, position } = route.request().postDataJSON();
          const column = remainder.filter(e => e.status === status);
          column.splice(position, 0, { ...entry, status });
          state.entries = [...remainder.filter(e => e.status !== status), ...column];
        } else state.entries = remainder;
      }
      state.entries = statuses.flatMap(status =>
        state.entries.filter(e => e.status === status).map((e, position) => ({ ...e, position }))
      );
    }
    if (failure.startsWith('lost')) return route.abort('failed');
    return route.fulfill({ json: state.entries });
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  return state;
}

const column = (page: Page, name = titles[0]) => page.getByRole('region', { name, exact: true });
const card = (page: Page, title = book.title) => page.getByRole('article', { name: title, exact: true });
async function open(page: Page) {
  await page.goto('http://localhost:4200/reading-list');
  await expect(page.getByRole('heading', { name: 'Leseliste', exact: true })).toBeVisible();
  await expect(page.getByText('Leseliste wird geladen…', { exact: true })).toBeHidden();
}
async function drag(page: Page, source: Locator, target: Locator) {
  await source.scrollIntoViewIfNeeded();
  const from = await source.boundingBox();
  const to = await target.boundingBox();
  expect(from).toBeTruthy();
  expect(to).toBeTruthy();
  await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2);
  await page.mouse.down();
  await page.mouse.move(from!.x + from!.width / 2 + 10, from!.y + from!.height / 2, { steps: 5 });
  await page.mouse.move(to!.x + to!.width / 2, to!.y + 20, { steps: 30 });
  await page.mouse.up();
}

test('AK-1: board starts empty and navigation marks the active view', async ({ page }) => {
  await setup(page);
  await open(page);
  for (const name of titles) {
    await expect(column(page, name)).toBeVisible();
    await expect(column(page, name).getByRole('article')).toHaveCount(0);
  }
  await expect(page.getByRole('link', { name: 'Leseliste öffnen' })).toHaveAttribute('aria-current', 'page');
});

for (const detail of [false, true])
  test(`AK-2: add from ${detail ? 'details' : 'collection'} and restore on reload`, async ({ page }) => {
    const state = await setup(page);
    await page.goto('http://localhost:4200/');
    let scope: Locator = page.locator('app-book-item').first();
    if (detail) {
      await scope.getByRole('button', { name: `Details for ${book.title}`, exact: true }).click();
      scope = page.getByRole('dialog');
    }
    await scope.getByRole('button', { name: 'Zur Leseliste hinzufügen', exact: true }).click();
    await expect(scope.getByText('In der Leseliste', { exact: true })).toBeVisible();
    expect(state.entries.map(e => [e.isbn, e.status])).toEqual([[book.isbn, statuses[0]]]);
    if (detail) await scope.getByRole('button', { name: 'Close', exact: true }).click();
    await page.getByRole('link', { name: 'Leseliste öffnen' }).click();
    await expect(column(page).getByRole('article', { name: book.title, exact: true })).toBeVisible();
    await page.reload();
    await expect(card(page)).toBeVisible();
  });

test('AK-3: repeated adding keeps existing status and one card', async ({ page }) => {
  const state = await setup(page, 1);
  state.entries[0].status = 'read';
  await page.goto('http://localhost:4200/');
  await page
    .locator('app-book-item')
    .first()
    .getByRole('button', { name: 'Zur Leseliste hinzufügen', exact: true })
    .click();
  await expect(page.locator('app-book-item').first().getByText('In der Leseliste', { exact: true })).toBeVisible();
  await open(page);
  await expect(column(page, titles[2]).getByRole('article')).toHaveCount(1);
  expect(state.entries).toHaveLength(1);
});

test('AK-4: drag to an empty column persists status', async ({ page }) => {
  const state = await setup(page, 1);
  await open(page);
  await drag(
    page,
    card(page).getByRole('button', { name: 'Karte ziehen' }),
    column(page, titles[1]).locator('[cdkdroplist]')
  );
  await expect(column(page, titles[1]).getByRole('article')).toHaveCount(1);
  await expect.poll(() => state.entries[0].status).toBe('reading');
  await page.reload();
  await expect(column(page, titles[1]).getByRole('article')).toHaveCount(1);
});

test('AK-5: drag within a column persists the new order', async ({ page }) => {
  // Keep both ends of this pointer gesture in the viewport on every browser.
  await page.setViewportSize({ width: 1280, height: 1600 });
  const state = await setup(page, 3);
  await open(page);
  await drag(page, card(page, 'Third book').getByRole('button', { name: 'Karte ziehen' }), card(page));
  await expect.poll(() => state.entries.map(e => e.isbn)).toEqual([books[2].isbn, books[0].isbn, books[1].isbn]);
  await page.reload();
  await expect(column(page).getByRole('article')).toHaveCount(3);
  await expect(column(page).getByRole('article').first()).toHaveAccessibleName('Third book');
});

test('AK-4/5: keyboard controls move and reorder, encoded ISBN remains intact', async ({ page }) => {
  const state = await setup(page, 3);
  await open(page);
  const up = card(page, 'Second book').getByRole('button', { name: 'Nach oben', exact: true });
  await up.focus();
  await up.press('Enter');
  await expect(column(page).getByRole('article').first()).toHaveAccessibleName('Second book');
  await card(page, 'Second book').getByRole('combobox', { name: 'Lesestatus' }).selectOption('reading');
  await expect(column(page, titles[1]).getByRole('article').first()).toHaveAccessibleName('Second book');
  expect(state.entries.find(e => e.isbn === books[1].isbn)?.status).toBe('reading');
});

test('AK-6: remove persists without deleting the book', async ({ page }) => {
  const state = await setup(page, 1);
  await open(page);
  await card(page).getByRole('button', { name: 'Aus Leseliste entfernen' }).click();
  await expect(card(page)).toHaveCount(0);
  await expect.poll(() => state.entries.length).toBe(0);
  await page.reload();
  await expect(card(page)).toHaveCount(0);
  await page.getByRole('link', { name: 'Listenansicht öffnen' }).click();
  await expect(page.getByRole('heading', { name: book.title, exact: true })).toBeVisible();
});

test('AK-8: loading failure offers retry', async ({ page }) => {
  const state = await setup(page);
  state.loadFails = true;
  await open(page);
  await expect(page.getByRole('alert')).toContainText('nicht geladen');
  state.loadFails = false;
  await page.getByRole('button', { name: 'Erneut laden', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(column(page)).toBeVisible();
});

for (const remove of [false, true])
  test(`AK-8: rejected ${remove ? 'removal' : 'move'} rolls back and retries`, async ({ page }) => {
    const state = await setup(page, 1);
    await open(page);
    state.failure = 'reject';
    if (remove) await card(page).getByRole('button', { name: 'Aus Leseliste entfernen' }).click();
    else await card(page).getByRole('combobox', { name: 'Lesestatus' }).selectOption('reading');
    await expect(page.getByRole('alert')).toContainText('nicht gespeichert');
    await expect(column(page).getByRole('article')).toHaveCount(1);
    await page.getByRole('button', { name: 'Erneut versuchen', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(column(page).getByRole('article')).toHaveCount(0);
    expect(state.writes).toBe(2);
  });

for (const saved of [false, true])
  test(`AK-8: lost response reconciles ${saved ? 'saved' : 'unsaved'} server state`, async ({ page }) => {
    const state = await setup(page, 1);
    await open(page);
    state.failure = saved ? 'lost-saved' : 'lost-unsaved';
    await card(page).getByRole('combobox', { name: 'Lesestatus' }).selectOption('reading');
    await expect.poll(() => state.reads).toBe(2);
    await expect(column(page, titles[saved ? 1 : 0]).getByRole('article')).toHaveCount(1);
    await expect(page.getByRole('alert')).toContainText('Serverstand');
    expect(state.writes).toBe(1);
  });

test('AK-8: failed reconciliation locks writes until reload succeeds', async ({ page }) => {
  const state = await setup(page, 1);
  await open(page);
  state.failure = 'lost-saved';
  state.loadFails = true;
  await card(page).getByRole('combobox', { name: 'Lesestatus' }).selectOption('reading');
  await expect(page.getByRole('button', { name: 'Erneut laden', exact: true })).toBeVisible();
  await expect(card(page).getByRole('combobox')).toBeDisabled();
  await expect(card(page).getByRole('button', { name: 'Aus Leseliste entfernen' })).toBeDisabled();
  state.loadFails = false;
  await page.getByRole('button', { name: 'Erneut laden', exact: true }).click();
  await expect(column(page, titles[1]).getByRole('article')).toHaveCount(1);
  await expect(card(page).getByRole('combobox')).toBeEnabled();
});

test('AK-8: adding failure offers retry; lost response discovers an already saved entry', async ({ page }) => {
  const state = await setup(page);
  state.failure = 'reject';
  await page.goto('http://localhost:4200/');
  const item = page.locator('app-book-item').first();
  await item.getByRole('button', { name: 'Zur Leseliste hinzufügen', exact: true }).click();
  await expect(item.getByRole('alert')).toBeVisible();
  state.failure = 'lost-saved';
  await item.getByRole('button', { name: 'Erneut versuchen', exact: true }).click();
  await expect(item.getByText('In der Leseliste', { exact: true })).toBeVisible();
  expect(state.entries).toHaveLength(1);
  expect(state.writes).toBe(2);
});

test('board details use the existing fresh book dialog', async ({ page }) => {
  await setup(page, 1);
  await open(page);
  const details = card(page).getByRole('button', { name: 'Details', exact: true });
  // WebKit does not focus buttons on pointer clicks; exercise keyboard restoration explicitly.
  await details.focus();
  await details.press('Enter');
  await expect(page.getByRole('dialog').getByText(book.title, { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(card(page).getByRole('button', { name: 'Details', exact: true })).toBeFocused();
});

test('keyboard status change retains focus on the moved card', async ({ page }) => {
  await setup(page, 1);
  await open(page);
  const select = card(page).getByRole('combobox');
  await select.focus();
  await select.selectOption('reading');
  await expect(page.getByText('Leseliste gespeichert.', { exact: true })).toBeVisible();
  await expect(column(page, titles[1]).getByRole('combobox')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(card(page).getByRole('button', { name: 'Details', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('AK-8: uncertain removal prevents reopening details until the server is known', async ({ page }) => {
  const state = await setup(page, 1);
  await open(page);
  state.failure = 'lost-saved';
  state.loadFails = true;
  await card(page).getByRole('button', { name: 'Aus Leseliste entfernen' }).click();
  await expect(page.getByRole('button', { name: 'Erneut laden', exact: true })).toBeVisible();
  await expect(card(page).getByRole('button', { name: 'Details', exact: true })).toBeDisabled();
  expect(state.entries).toHaveLength(0);
  state.loadFails = false;
  await page.getByRole('button', { name: 'Erneut laden', exact: true }).click();
  await expect(card(page)).toHaveCount(0);
});

test('AK-8: timeout restores optimistic change before reconciling server state', async ({ page }) => {
  const state = await setup(page, 1);
  await open(page);
  await page.clock.install();
  let started = false;
  await page.route(`${endpoint}/${book.isbn}`, async route => {
    started = true;
    await new Promise<void>(resolve => {
      releaseWrite = resolve;
    });
    await route.fulfill({ json: state.entries }).catch(() => {});
  });
  let releaseWrite!: () => void;
  let releaseRead!: () => void;
  let reading = false;
  await page.route(endpoint, async route => {
    reading = true;
    await new Promise<void>(resolve => {
      releaseRead = resolve;
    });
    await route.fulfill({ json: state.entries }).catch(() => {});
  });
  await card(page).getByRole('combobox').selectOption('reading');
  await expect.poll(() => started).toBe(true);
  await expect(column(page, titles[1]).getByRole('article')).toHaveCount(1);
  await page.clock.fastForward(15_001);
  await expect.poll(() => reading).toBe(true);
  await expect(column(page).getByRole('article')).toHaveCount(1);
  await expect(card(page).getByRole('combobox')).toBeDisabled();
  releaseRead();
  await expect(card(page).getByRole('combobox')).toBeEnabled();
  await expect(page.getByRole('alert')).toContainText('Serverstand');
  releaseWrite();
});

test('AK-8: uncertain add locks retries until server reload succeeds', async ({ page }) => {
  const state = await setup(page);
  state.failure = 'lost-unsaved';
  state.loadFails = true;
  await page.goto('http://localhost:4200/');
  const item = page.locator('app-book-item').first();
  await item.getByRole('button', { name: 'Zur Leseliste hinzufügen', exact: true }).click();
  await expect(item.getByRole('button', { name: 'Serverstand erneut laden', exact: true })).toBeVisible();
  await item.getByRole('button', { name: 'Serverstand erneut laden', exact: true }).click();
  await expect(item.getByRole('alert')).toHaveText('Serverstand konnte nicht geladen werden. Bitte erneut laden.');
  expect(state.writes).toBe(1);
  state.loadFails = false;
  await item.getByRole('button', { name: 'Serverstand erneut laden', exact: true }).click();
  await item.getByRole('button', { name: 'Erneut versuchen', exact: true }).click();
  await expect(item.getByText('In der Leseliste', { exact: true })).toBeVisible();
  expect(state.writes).toBe(2);
});

for (const colorScheme of ['light', 'dark'] as const)
  test(`320px board remains usable in ${colorScheme}`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 740 });
    await page.emulateMedia({ colorScheme });
    await setup(page, 1);
    await open(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    for (const title of titles) await expect(column(page, title)).toBeAttached();
    await card(page).getByRole('combobox').selectOption('read');
    await expect(column(page, titles[2]).getByRole('article')).toHaveCount(1);
  });

test('leaving the board cancels its pending read', async ({ page }) => {
  await setup(page);
  let release!: () => void;
  const pending = new Promise<void>(resolve => (release = resolve));
  let started = false;
  await page.route(endpoint, async route => {
    started = true;
    await pending;
    await route.fulfill({ json: [] }).catch(() => {});
  });
  await page.goto('http://localhost:4200/reading-list');
  await expect.poll(() => started).toBe(true);
  const cancelled = page.waitForEvent('requestfailed', request => request.url() === endpoint);
  await page.getByRole('link', { name: 'Listenansicht öffnen' }).click();
  await cancelled;
  release();
  await expect(page.getByRole('heading', { name: book.title, exact: true })).toBeVisible();
});
