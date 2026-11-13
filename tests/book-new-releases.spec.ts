import { expect, test } from '@playwright/test';
import { api, book, setup } from './support/books';

for (const editing of [false, true]) {
  test(`NR-11: incomplete date blocks saving (${editing ? 'edit' : 'create'})`, async ({ page }) => {
    await setup(page);
    let writes = 0;
    page.on('request', request => {
      if (['POST', 'PUT'].includes(request.method())) writes++;
    });
    if (editing) {
      await page.getByRole('button', { name: `Details for ${book.title}`, exact: true }).click();
      await page.getByRole('dialog').getByRole('button', { name: 'Edit', exact: true }).click();
    } else {
      await page.getByRole('button', { name: 'Buch anlegen', exact: true }).click();
      for (const [label, value] of Object.entries({ ISBN: 'new', Titel: 'Neu', Autor: 'Autor', Seitenzahl: '100' })) {
        await page.getByRole('dialog').getByLabel(label, { exact: true }).fill(value);
      }
    }
    const dialog = page.getByRole('dialog');
    const date = dialog.getByLabel('Erscheinungsdatum', { exact: true });
    await date.fill('2026-11-01');
    // Chromium's segmented date editor: clear the year, leaving an incomplete date.
    await date.press('ArrowRight');
    await date.press('End');
    await date.press('Backspace');
    expect(await date.evaluate((el: HTMLInputElement) => el.validity.badInput)).toBe(true);
    await dialog.getByRole('button', { name: editing ? 'Save' : 'Buch anlegen', exact: true }).click();
    await expect(dialog.getByText('Bitte geben Sie ein gültiges Erscheinungsdatum ein.')).toBeVisible();
    expect(writes).toBe(0);
  });
}

test('NR-5: independent release row, details, edit refresh and explicit date clear', async ({ page }) => {
  let current = { ...book, title: 'Neuerscheinung', publicationDate: '2026-11-01' };
  let loads = 0;
  await page.route(`${api}/new-releases`, route => {
    loads++;
    return route.fulfill({ json: current.publicationDate ? [current] : [] });
  });
  await setup(page, false);
  await page.route(`${api}/${book.isbn}`, async route => {
    if (route.request().method() === 'PUT') current = route.request().postDataJSON();
    return route.fulfill({ json: current });
  });
  const section = page.getByRole('region', { name: 'Frisch erschienen' });
  await expect(section.getByRole('heading', { name: current.title })).toBeVisible();
  await expect(section.getByText('01.11.2026')).toBeVisible();
  await page.getByRole('textbox', { name: 'Search for books' }).fill('Angular');
  await expect(section.getByRole('heading', { name: current.title })).toBeVisible();
  expect(loads).toBe(1);
  await section.getByRole('button', { name: 'Details for Neuerscheinung', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('01.11.2026')).toBeVisible();
  await dialog.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(dialog.getByLabel('Erscheinungsdatum', { exact: true })).toHaveValue('2026-11-01');
  await dialog.getByLabel('Erscheinungsdatum', { exact: true }).fill('');
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(section.getByText('Keine Neuerscheinungen in den letzten 90 Tagen')).toBeVisible();
  expect(loads).toBe(2);
});

test('NR-6: release failure retries independently of the collection', async ({ page }) => {
  let retry = false;
  await page.route(`${api}/new-releases`, route => route.fulfill(retry ? { json: [] } : { status: 503, json: {} }));
  await setup(page, false);
  const section = page.getByRole('region', { name: 'Frisch erschienen' });
  await expect(section.getByRole('alert')).toBeVisible();
  retry = true;
  await section.getByRole('button', { name: 'Erneut versuchen' }).click();
  await expect(section.getByText('Keine Neuerscheinungen in den letzten 90 Tagen')).toBeVisible();
  await expect(page.getByRole('heading', { name: book.title, exact: true })).toBeVisible();
});

for (const theme of ['light', 'dark'] as const) {
  test(`NR-7: scrolls by keyboard on mobile with cover fallback (${theme})`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 740 });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    await page.route(`${api}/new-releases`, route =>
      route.fulfill({
        json: Array.from({ length: 12 }, (_, i) => ({
          ...book,
          id: `release-${i}`,
          isbn: `release-${i}`,
          title: `Neues Buch ${i}`,
          publicationDate: '2026-11-01'
        }))
      })
    );
    await setup(page, false);
    const section = page.getByRole('region', { name: 'Frisch erschienen' });
    await expect(section.getByText('No cover available').first()).toBeVisible();
    const row = section.getByRole('region', { name: 'Neuerscheinungen durchblättern' });
    await row.focus();
    await page.keyboard.press('End');
    await expect.poll(() => row.evaluate(el => el.scrollLeft)).toBeGreaterThan(100);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}

test('NR-8: creating sends the optional publication date', async ({ page }) => {
  await page.route(`${api}/new-releases`, route => route.fulfill({ json: [] }));
  await setup(page, false);
  let saved: Record<string, unknown> | undefined;
  await page.route(api, route => {
    saved = route.request().postDataJSON();
    return route.fulfill({ status: 201, json: { ...saved, id: 'new', userId: 1 } });
  });
  await page.getByRole('button', { name: 'Buch anlegen', exact: true }).click();
  const dialog = page.getByRole('dialog');
  for (const [label, value] of Object.entries({
    ISBN: 'new',
    Titel: 'Neu',
    Autor: 'Autor',
    Seitenzahl: '100',
    Erscheinungsdatum: '2026-11-01'
  })) {
    await dialog.getByLabel(label, { exact: true }).fill(value);
  }
  await dialog.getByRole('button', { name: 'Buch anlegen', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(saved?.['publicationDate']).toBe('2026-11-01');
});

test('NR-9: shows loading, times out and cancels the request on navigation', async ({ page }) => {
  await page.clock.install();
  let requests = 0;
  const failures: string[] = [];
  page.on('requestfailed', request => {
    if (request.url() === `${api}/new-releases`) failures.push(request.url());
  });
  await page.route(`${api}/new-releases`, () => {
    requests++;
  });
  await page.route('http://localhost:4730/reading-list', route => route.fulfill({ json: [] }));
  await setup(page, false);
  const section = page.getByRole('region', { name: 'Frisch erschienen' });
  await expect(section.getByRole('status')).toContainText('werden geladen');
  await page.clock.runFor(15_001);
  await expect(section.getByRole('alert')).toBeVisible();
  await expect.poll(() => failures.length).toBe(1);
  await section.getByRole('button', { name: 'Erneut versuchen' }).click();
  await expect.poll(() => requests).toBe(2);
  await page.getByRole('link', { name: 'Leseliste öffnen', exact: true }).click();
  await expect(section).toHaveCount(0);
  await expect.poll(() => failures.length).toBe(2);
});

test('NR-10: creation refreshes releases and its reading-list action uses the ISBN', async ({ page }) => {
  let created = false;
  await page.route(`${api}/new-releases`, route =>
    route.fulfill({ json: created ? [{ ...book, title: 'Neu angelegt', publicationDate: '2026-11-01' }] : [] })
  );
  await setup(page, false);
  await page.route(api, route => {
    created = true;
    return route.fulfill({ status: 201, json: { ...book, ...route.request().postDataJSON() } });
  });
  let addedIsbn = '';
  await page.route('http://localhost:4730/reading-list', route => {
    addedIsbn = route.request().postDataJSON().isbn;
    return route.fulfill({ json: [{ isbn: book.isbn, status: 'want-to-read', position: 0, book }] });
  });
  await page.getByRole('button', { name: 'Buch anlegen', exact: true }).click();
  const dialog = page.getByRole('dialog');
  for (const [label, value] of Object.entries({
    ISBN: book.isbn,
    Titel: 'Neu angelegt',
    Autor: book.author,
    Seitenzahl: '100',
    Erscheinungsdatum: '2026-11-01'
  })) {
    await dialog.getByLabel(label, { exact: true }).fill(value);
  }
  await dialog.getByRole('button', { name: 'Buch anlegen', exact: true }).click();
  const section = page.getByRole('region', { name: 'Frisch erschienen' });
  await expect(section.getByRole('heading', { name: 'Neu angelegt' })).toBeVisible();
  await section.getByRole('button', { name: 'Zur Leseliste hinzufügen' }).click();
  await expect(section.getByRole('status')).toHaveText('In der Leseliste');
  expect(addedIsbn).toBe(book.isbn);
});
