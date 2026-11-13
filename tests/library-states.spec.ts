import { expect, test } from './support/ui-test';
import { api, book, expectListRequest } from './support/books';
import { disableWebGL } from './support/graphics';
import { LibraryPage } from './pages/library.page';
import { BookDialogPage } from './pages/book-dialog.page';

test.use({
  deviceScaleFactor: 1.5,
  launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }
});

test.describe('Library: Zustände und Bedienung', () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.route(api, route => route.fulfill({ json: [book] }));
    await page.route(`${api}/${book.isbn}`, route => route.fulfill({ json: book }));
    await page.route(`${api}/new-releases`, route => route.fulfill({ json: [] }));
    await page.route(`${api}?*`, route => {
      expectListRequest(route);
      return route.fulfill({ json: [book] });
    });
  });

  test('zeigt einen leeren Bestand mit Rückweg zur Sammlung', async ({ page }) => {
    const library = new LibraryPage(page);
    await test.step('Given eine leere Sammlung', async () => {
      await page.route(api, route => route.fulfill({ json: [] }));
    });
    await test.step('When die Library direkt geöffnet wird', async () => {
      await page.goto('http://localhost:4200/library');
    });
    await test.step('Then erscheint der Leerzustand ohne 3D-Szene', async () => {
      await expect(page.getByRole('heading', { name: 'Die Bibliothek ist leer' })).toBeVisible();
      await expect(library.canvas).toHaveCount(0);
      await expect(library.list.getByRole('button')).toHaveCount(0);
      await expect(page.getByRole('alert')).toHaveCount(0);
    });
    await test.step('When der Rückweg zur Bücherübersicht genutzt wird', async () => {
      await page.getByRole('link', { name: 'Zur Bücherübersicht', exact: true }).click();
    });
    await test.step('Then ist die Sammlung bedienbar', async () => {
      await expect(page).toHaveURL('http://localhost:4200/');
      await expect(page.getByRole('heading', { name: book.title, exact: true })).toBeVisible();
    });
  });

  for (const width of [1280, 320]) {
    test(`Suche und Details funktionieren ohne WebGL bei ${width}px`, async ({ page }) => {
      const library = new LibraryPage(page);
      const details = new BookDialogPage(page);
      await test.step('Given WebGL ist beim Einstieg nicht verfügbar', async () => {
        await page.setViewportSize({ width, height: 900 });
        await disableWebGL(page);
      });
      await test.step('When die Library geöffnet wird', async () => {
        await page.goto('http://localhost:4200/library');
      });
      await test.step('Then bleibt die Buchliste trotz Grafikfehler erreichbar', async () => {
        await expect(page.getByRole('heading', { name: '3D-Ansicht nicht verfügbar' })).toBeVisible();
        await expect(library.canvas).toHaveCount(0);
        await expect(library.list).toContainText(book.title);
      });
      await test.step('When eine Suche keine Treffer liefert', async () => {
        await library.search('unbekanntes Buch');
      });
      await test.step('Then ist der Such-Leerzustand sichtbar', async () => {
        await expect(library.list.getByText('Keine passenden Bücher gefunden.', { exact: true })).toBeVisible();
        await expect(library.list.getByRole('button')).toHaveCount(0);
      });
      await test.step('When die Suche geleert und ein Buch geöffnet wird', async () => {
        await library.search('');
        await library.selectBook(book.title);
        await library.openDetails();
      });
      await test.step('Then lädt der reguläre Detaildialog das Buch', async () => {
        await expect(details.dialog.getByText(book.title, { exact: true })).toBeVisible();
        await details.close();
        await expect(details.dialog).toHaveCount(0);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      });
    });
  }

  test('wechselt die Grafikqualität über die sichtbare Steuerung', async ({ page }) => {
    const library = new LibraryPage(page);
    let normalWidth = 0;
    await test.step('Given eine gestartete 3D-Bibliothek mit hoher Pixeldichte', async () => {
      await page.goto('http://localhost:4200/library');
      await expect(library.canvas).toBeVisible();
      normalWidth = await library.canvas.evaluate((canvas: HTMLCanvasElement) => canvas.width);
    });
    await test.step('When reduzierte Grafik gewählt wird', async () => {
      await page.getByRole('button', { name: 'Reduzierte Grafik', exact: true }).click();
    });
    await test.step('Then sinkt die Zeichenauflösung bei weiterhin sichtbarer Buchliste', async () => {
      await expect(page.getByRole('button', { name: 'Normale Grafik', exact: true })).toBeVisible();
      await expect
        .poll(() => library.canvas.evaluate((canvas: HTMLCanvasElement) => canvas.width))
        .toBeLessThan(normalWidth);
      await expect(library.list).toContainText(book.title);
    });
    await test.step('When wieder normale Grafik gewählt wird', async () => {
      await page.getByRole('button', { name: 'Normale Grafik', exact: true }).click();
    });
    await test.step('Then wird die ursprüngliche Zeichenauflösung wiederhergestellt', async () => {
      await expect.poll(() => library.canvas.evaluate((canvas: HTMLCanvasElement) => canvas.width)).toBe(normalWidth);
      await expect(page.getByRole('button', { name: 'Reduzierte Grafik', exact: true })).toBeVisible();
    });
  });

  test('aktiviert Maussteuerung und beendet Pointer Lock mit Escape', async ({ page }) => {
    const library = new LibraryPage(page);
    await test.step('Given eine gestartete 3D-Bibliothek', async () => {
      await page.goto('http://localhost:4200/library');
      await expect(library.canvas).toBeVisible();
    });
    await test.step('When Maussteuerung aktiviert wird', async () => {
      await page.getByRole('button', { name: 'Maussteuerung aktivieren', exact: true }).click();
    });
    await test.step('Then ist die Maus an das Bibliothekscanvas gebunden', async () => {
      await expect.poll(() => library.canvas.evaluate(canvas => document.pointerLockElement === canvas)).toBe(true);
    });
    await test.step('When Escape gedrückt wird', async () => {
      await page.keyboard.press('Escape');
    });
    await test.step('Then ist die Maus frei und die Suche bedienbar', async () => {
      await expect.poll(() => page.evaluate(() => document.pointerLockElement === null)).toBe(true);
      await library.search(book.title);
      await expect(library.list).toContainText(book.title);
    });
  });

  test('bricht beim Verlassen einen ausstehenden Sammlungsabruf ab', async ({ page }) => {
    let requests = 0;
    const failures: string[] = [];
    await test.step('Given ein ausstehender Sammlungsabruf', async () => {
      page.on('requestfailed', request => failures.push(request.url()));
      await page.route(api, () => {
        requests++;
      });
      await page.goto('http://localhost:4200/library');
      await expect.poll(() => requests).toBe(1);
      await expect(page.getByRole('heading', { name: 'Bibliothek wird geladen' })).toBeVisible();
    });
    await test.step('When zur Sammlung navigiert wird', async () => {
      await page.getByRole('link', { name: 'Listenansicht öffnen', exact: true }).click();
    });
    await test.step('Then ist der Abruf abgebrochen und die Sammlung sichtbar', async () => {
      await expect.poll(() => failures).toContain(api);
      await expect(page).toHaveURL('http://localhost:4200/');
      await expect(page.getByRole('heading', { name: book.title, exact: true })).toBeVisible();
      await expect(page.locator('app-library canvas')).toHaveCount(0);
    });
  });
});
