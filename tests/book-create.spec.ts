import { expect, test, type Page } from './support/ui-test';
import { api, book, expectListRequest, setup } from './support/books';
import type { Book, NewBook } from '../src/app/books/book';

async function open(page: Page) {
  await page.getByRole('button', { name: 'Buch anlegen', exact: true }).click();
  const dialog = page.getByRole('dialog');
  // Wait for Material's deferred autofocus before fill() can move focus to another field.
  await expect(dialog.getByLabel('ISBN', { exact: true })).toBeFocused();
  return dialog;
}

async function fillRequired(page: Page) {
  const dialog = page.getByRole('dialog');
  for (const [label, value] of Object.entries({
    ISBN: 'new-isbn',
    Titel: 'Angular neu',
    Autor: 'Neue Autorin',
    Seitenzahl: '123'
  })) {
    await dialog.getByLabel(label, { exact: true }).fill(value);
  }
}

test('keyboard opens an empty form, focuses ISBN and cancel restores focus without POST', async ({ page }) => {
  await setup(page);
  let posts = 0;
  page.on('request', request => {
    if (request.method() === 'POST') posts++;
  });
  const trigger = page.getByRole('button', { name: 'Buch anlegen', exact: true });
  await trigger.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('ISBN', { exact: true })).toBeFocused();
  for (const label of [
    'ISBN',
    'Titel',
    'Autor',
    'Seitenzahl',
    'Untertitel',
    'Verlag',
    'Preis',
    'Cover-URL',
    'Beschreibung'
  ]) {
    await expect(dialog.getByLabel(label, { exact: true })).toHaveValue('');
  }
  await fillRequired(page);
  await dialog.getByRole('button', { name: 'Abbrechen' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  expect(posts).toBe(0);
  await open(page);
  await expect(page.getByRole('dialog').getByLabel('Titel', { exact: true })).toHaveValue('');
});

test('validates required values, whitespace and positive integer pages without POST', async ({ page }) => {
  await setup(page);
  let posts = 0;
  page.on('request', request => {
    if (request.method() === 'POST') posts++;
  });
  const dialog = await open(page);
  await dialog.getByRole('button', { name: 'Buch anlegen', exact: true }).click();
  for (const text of [
    'Bitte geben Sie eine ISBN ein.',
    'Bitte geben Sie einen Titel ein.',
    'Bitte geben Sie einen Autor ein.'
  ]) {
    await expect(dialog.getByText(text, { exact: true })).toBeVisible();
  }
  for (const label of ['ISBN', 'Titel', 'Autor']) await dialog.getByLabel(label, { exact: true }).fill('   ');
  for (const value of ['', '0', '-1', '1.5', '2147483648']) {
    await dialog.getByLabel('Seitenzahl', { exact: true }).fill(value);
    await dialog.getByRole('button', { name: 'Buch anlegen', exact: true }).click();
    await expect(dialog.getByText('Bitte geben Sie eine positive ganze Zahl bis 2147483647 ein.')).toBeVisible();
  }
  await expect(dialog.getByText('Bitte geben Sie einen Titel ein.', { exact: true })).toBeVisible();
  expect(posts).toBe(0);
});

for (const cover of ['', 'https://example.test/missing-cover.png']) {
  test(`creates with optional fields empty and refreshes active search, cover: ${cover || 'empty'}`, async ({
    page
  }) => {
    await setup(page);
    const searches: (string | null)[] = [];
    let created: Book | undefined;
    let posts = 0;
    let release!: () => void;
    const pending = new Promise<void>(resolve => (release = resolve));
    await page.route(`${api}*`, async route => {
      if (route.request().method() === 'POST') {
        posts++;
        const draft: NewBook = route.request().postDataJSON();
        expect(draft).toEqual({
          isbn: 'new-isbn',
          title: 'Angular neu',
          author: 'Neue Autorin',
          numPages: 123,
          subtitle: '',
          publisher: '',
          price: '',
          cover,
          abstract: '',
          publicationDate: ''
        });
        created = { ...draft, id: 'new-id', userId: 1 };
        await pending;
        return route.fulfill({ status: 201, json: created });
      }
      searches.push(expectListRequest(route).searchParams.get('q'));
      return route.fulfill({ json: created ? [created] : [book] });
    });
    await page.getByRole('textbox', { name: 'Search for books' }).fill('Angular');
    await expect.poll(() => searches).toContain('Angular');
    const dialog = await open(page);
    await fillRequired(page);
    await dialog.getByLabel('Cover-URL', { exact: true }).fill(cover);
    await dialog.getByRole('button', { name: 'Buch anlegen', exact: true }).dblclick();
    await expect(dialog.getByRole('status')).toHaveText('Buch wird gespeichert…');
    await expect(dialog.getByRole('button', { name: 'Wird gespeichert…' })).toBeDisabled();
    await expect(dialog.getByRole('button', { name: 'Abbrechen' })).toBeDisabled();
    await page.keyboard.press('Escape');
    await page.mouse.click(1, 1);
    await expect(dialog).toBeVisible();
    expect(posts).toBe(1);
    const before = searches.length;
    release();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByText('Buch erfolgreich angelegt.', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Angular neu', exact: true })).toBeVisible();
    await expect(page.getByText('No cover available', { exact: true })).toBeVisible();
    expect(searches.length).toBeGreaterThan(before);
    expect(searches.at(-1)).toBe('Angular');
  });
}

for (const status of [409, 500]) {
  test(`save error ${status} preserves all inputs and permits correction or retry`, async ({ page }) => {
    await setup(page);
    let posts = 0;
    await page.route(api, route => {
      expect(route.request().method()).toBe('POST');
      posts++;
      return posts === 1
        ? route.fulfill({ status, json: {} })
        : route.fulfill({ status: 201, json: { ...route.request().postDataJSON(), id: 'new-id', userId: 1 } });
    });
    const dialog = await open(page);
    await fillRequired(page);
    const optional = {
      Untertitel: 'Zusatz',
      Verlag: 'Verlag',
      Preis: '12,99 EUR',
      'Cover-URL': 'https://example.test/cover.jpg',
      Beschreibung: 'Erste Zeile\nZweite Zeile'
    };
    for (const [label, value] of Object.entries(optional)) await dialog.getByLabel(label, { exact: true }).fill(value);
    await dialog.getByRole('button', { name: 'Buch anlegen', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText(
      status === 409 ? 'Diese ISBN ist bereits vorhanden.' : 'Das Buch konnte nicht angelegt werden.'
    );
    for (const [label, value] of Object.entries({ ...optional, Titel: 'Angular neu', ISBN: 'new-isbn' })) {
      await expect(dialog.getByLabel(label, { exact: true })).toHaveValue(value);
    }
    if (status === 409) await dialog.getByLabel('ISBN', { exact: true }).fill('another-isbn');
    await dialog.getByRole('button', { name: 'Buch anlegen', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect(posts).toBe(2);
  });
}

for (const failure of ['timeout', 'connection']) {
  test(`unconfirmed ${failure} locks the draft, retries with the same ISBN and refreshes on close`, async ({
    page
  }) => {
    await page.clock.install();
    await setup(page);
    const payloads: unknown[] = [];
    let gets = 0;
    await page.route(`${api}*`, route => {
      if (route.request().method() === 'POST') {
        payloads.push(route.request().postDataJSON());
        if (payloads.length > 1) return route.fulfill({ status: 409, json: {} });
        if (failure === 'connection') return route.abort('connectionfailed');
        return;
      }
      expectListRequest(route);
      gets++;
      return route.fulfill({ json: [book] });
    });
    const dialog = await open(page);
    await fillRequired(page);
    await dialog.getByRole('button', { name: 'Buch anlegen', exact: true }).click();
    await expect.poll(() => payloads.length).toBe(1);
    if (failure === 'timeout') await page.clock.runFor(15_001);
    await expect(dialog.getByRole('alert')).toContainText('Das Speicherergebnis ist unbekannt.');
    await expect(dialog.getByLabel('ISBN', { exact: true })).toBeDisabled();
    await expect(dialog.getByLabel('Titel', { exact: true })).toHaveValue('Angular neu');
    await dialog.getByRole('button', { name: 'Mit derselben ISBN erneut versuchen' }).click();
    await expect(dialog.getByRole('alert')).toContainText('Diese ISBN ist bereits vorhanden.');
    expect(payloads).toHaveLength(2);
    expect(payloads[1]).toEqual(payloads[0]);
    await dialog.getByRole('button', { name: 'Abbrechen' }).click();
    await expect(dialog).toHaveCount(0);
    await expect.poll(() => gets).toBe(1);
    await expect(page.getByText('Buch erfolgreich angelegt.', { exact: true })).toHaveCount(0);
  });
}

for (const theme of ['light', 'dark'] as const) {
  test(`mobile form fits and is operable in ${theme} mode`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.emulateMedia({ colorScheme: theme });
    await setup(page);
    const dialog = await open(page);
    await fillRequired(page);
    await dialog.getByLabel('Beschreibung', { exact: true }).fill('Mobile Notiz');
    const bounds = await dialog.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.width).toBeLessThanOrEqual(375);
    expect(bounds!.height).toBeLessThanOrEqual(667);
    expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await dialog.getByRole('button', { name: 'Abbrechen' }).click();
    await expect(dialog).toHaveCount(0);
  });
}
