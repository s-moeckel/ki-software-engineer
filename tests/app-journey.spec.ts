import { expect, test } from './support/ui-test';
import { api, book } from './support/books';
import { disableWebGL } from './support/graphics';
import { BooksPage } from './pages/books.page';
import { BookDialogPage } from './pages/book-dialog.page';
import { ReadingListPage } from './pages/reading-list.page';
import { LibraryPage } from './pages/library.page';
import { UniversePage } from './pages/universe.page';
import type { Book } from '../src/app/books/book';
import type { ReadingEntry } from '../src/app/reading-list/reading-list';

test.describe('Ansichtenübergreifende Nutzerabläufe', () => {
  test('legt ein Buch an, bearbeitet es und behält Daten und Lesestatus über alle Ansichten', async ({ page }) => {
    const books = new BooksPage(page);
    const dialog = new BookDialogPage(page);
    const board = new ReadingListPage(page);
    const library = new LibraryPage(page);
    const universe = new UniversePage(page);
    const isbn = '9780306406157';
    const title = 'Meine Angular Reise';
    const updatedTitle = 'Meine Angular Reise überarbeitet';
    const collection: Book[] = [book];
    let entries: ReadingEntry[] = [];
    const writes: string[] = [];

    await test.step('Given ein gemeinsamer API-Mock hält Bücher und Leseliste konsistent', async () => {
      await disableWebGL(page);
      await page.route('http://localhost:4730/**', async route => {
        const request = route.request();
        const url = new URL(request.url());
        const method = request.method();
        if (method !== 'GET') writes.push(`${method} ${url.pathname}`);
        if (url.pathname === '/books/new-releases' && method === 'GET') return route.fulfill({ json: [] });
        if (url.pathname === '/books' && method === 'POST') {
          const created: Book = { ...request.postDataJSON(), id: 'created', userId: 1 };
          collection.push(created);
          return route.fulfill({ status: 201, json: created });
        }
        if (url.pathname === '/books' && method === 'GET') {
          const query = (url.searchParams.get('q') ?? '').toLowerCase();
          const matches = collection.filter(item => item.title.toLowerCase().includes(query));
          return route.fulfill({ json: matches, headers: { 'X-Total-Count': String(matches.length) } });
        }
        if (url.pathname === `/books/${isbn}`) {
          const index = collection.findIndex(item => item.isbn === isbn);
          expect(index).toBeGreaterThanOrEqual(0);
          expect(['GET', 'PUT']).toContain(method);
          if (method === 'PUT') {
            const saved: Book = request.postDataJSON();
            expect(saved.isbn).toBe(isbn);
            expect(saved.id).toBe('created');
            collection[index] = saved;
          }
          return route.fulfill({ json: collection[index] });
        }
        if (url.pathname === '/reading-list') {
          expect(['GET', 'POST']).toContain(method);
          if (method === 'POST') {
            expect(request.postDataJSON()).toEqual({ isbn });
            entries = [
              { isbn, status: 'want-to-read', position: 0, book: collection.find(item => item.isbn === isbn)! }
            ];
          }
          return route.fulfill({ json: entries });
        }
        if (url.pathname === `/reading-list/${isbn}` && method === 'PUT') {
          expect(request.postDataJSON()).toEqual({ status: 'reading', position: 0 });
          entries = entries.map(entry => ({ ...entry, status: 'reading', position: 0 }));
          return route.fulfill({ json: entries });
        }
        return route.fallback();
      });
      await page.goto('http://localhost:4200');
      await expect(books.bookTitle(book.title)).toBeVisible();
    });
    await test.step('When ein Buch angelegt wird', async () => {
      await page.getByRole('button', { name: 'Buch anlegen', exact: true }).click();
      await expect(dialog.dialog.getByLabel('ISBN', { exact: true })).toBeFocused();
      await dialog.fill({ ISBN: isbn, Titel: title, Autor: 'Workshop Autorin', Seitenzahl: '120' });
      await dialog.create();
    });
    await test.step('Then erscheint es nach erfolgreichem Speichern in der Sammlung', async () => {
      await expect(dialog.dialog).toHaveCount(0);
      await expect(books.bookTitle(title)).toBeVisible();
      await expect(page.getByText('Buch erfolgreich angelegt.', { exact: true })).toBeVisible();
    });
    await test.step('When das neue Buch im Detaildialog bearbeitet wird', async () => {
      await page.getByRole('button', { name: `Details for ${title}`, exact: true }).click();
      await expect(dialog.dialog.getByText(title, { exact: true })).toBeVisible();
      await dialog.edit();
      await dialog.fill({ Title: updatedTitle });
      await dialog.save();
    });
    await test.step('Then zeigt die Sammlung den aktualisierten Titel', async () => {
      await expect(dialog.dialog).toHaveCount(0);
      await expect(books.bookTitle(updatedTitle)).toBeVisible();
      await expect(books.bookTitle(title)).toHaveCount(0);
    });
    await test.step('When das gefundene Buch zur Leseliste hinzugefügt wird', async () => {
      await books.search(updatedTitle);
      await expect(books.bookTitle(book.title)).toHaveCount(0);
      await expect(books.bookTitle(updatedTitle)).toBeVisible();
      await page.getByRole('button', { name: 'Zur Leseliste hinzufügen', exact: true }).click();
      await expect(page.getByText('In der Leseliste', { exact: true })).toBeVisible();
      await page.getByRole('link', { name: 'Leseliste öffnen', exact: true }).click();
    });
    await test.step('Then steht die aktualisierte Karte in der ersten Lesespalte', async () => {
      await expect(
        board.column('möchte ich lesen').getByRole('article', { name: updatedTitle, exact: true })
      ).toBeVisible();
    });
    await test.step('When der Lesestatus geändert und die Seite neu geladen wird', async () => {
      await board.setStatus(updatedTitle, 'reading');
      await expect.poll(() => entries[0]?.status).toBe('reading');
      await page.reload();
    });
    await test.step('Then bleibt die Karte in lese ich gerade erhalten', async () => {
      await expect(
        board.column('lese ich gerade').getByRole('article', { name: updatedTitle, exact: true })
      ).toBeVisible();
      await expect(board.card(updatedTitle)).toHaveCount(1);
    });
    await test.step('When das Buch in der Library gesucht und geöffnet wird', async () => {
      await page.getByRole('link', { name: 'Virtual Library öffnen', exact: true }).click();
      await library.search(updatedTitle);
      await library.selectBook(updatedTitle);
      await library.openDetails();
    });
    await test.step('Then lädt die Library denselben gespeicherten Buchstand', async () => {
      await expect(dialog.dialog.getByText(updatedTitle, { exact: true })).toBeVisible();
      await dialog.close();
    });
    await test.step('When das Buch in Universe ausgewählt und geöffnet wird', async () => {
      await page.getByRole('link', { name: 'BookMonkey Universe öffnen', exact: true }).click();
      await expect(page.getByText('Deine Galaxie als Buchliste')).toBeVisible();
      await universe.search(updatedTitle);
      await universe.searchInput.press('Enter');
      await universe.openDetails();
    });
    await test.step('Then zeigt auch Universe die aktualisierten Details ohne weitere Schreibvorgänge', async () => {
      await expect(dialog.dialog.getByText(updatedTitle, { exact: true })).toBeVisible();
      expect(writes).toEqual(['POST /books', `PUT /books/${isbn}`, 'POST /reading-list', `PUT /reading-list/${isbn}`]);
    });
  });

  test('leitet eine unbekannte Route zur Sammlung um', async ({ page }) => {
    await test.step('Given die Sammlung und Neuerscheinungen sind gemockt', async () => {
      await page.route(`${api}?*`, route => route.fulfill({ json: [book] }));
      await page.route(`${api}/new-releases`, route => route.fulfill({ json: [] }));
    });
    await test.step('When eine nicht vorhandene Route direkt aufgerufen wird', async () => {
      await page.goto('http://localhost:4200/nicht-vorhanden');
    });
    await test.step('Then erscheint die Sammlung mit richtig markiertem Navigationslink', async () => {
      await expect(page).toHaveURL('http://localhost:4200/');
      await expect(new BooksPage(page).bookTitle(book.title)).toBeVisible();
      const nav = page.getByRole('navigation', { name: 'Hauptnavigation' });
      await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);
      await expect(nav.getByRole('link', { name: 'Listenansicht öffnen', exact: true })).toHaveAttribute(
        'aria-current',
        'page'
      );
    });
  });
});
