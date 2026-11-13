import { expect, test } from './support/ui-test';
import { api, book } from './support/books';
import { disableWebGL } from './support/graphics';
import { UniversePage } from './pages/universe.page';
import { BookDialogPage } from './pages/book-dialog.page';

test.use({
  deviceScaleFactor: 0.5,
  launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }
});

test.describe('Universe: Zustände und Tastatur', () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
  });
  test('zeigt Laden, beendet einen Timeout nach 15 Sekunden und erlaubt Retry', async ({ page }) => {
    const universe = new UniversePage(page);
    let requests = 0;
    const failures: string[] = [];
    await test.step('Given die erste Sammlungsanfrage bleibt unbeantwortet', async () => {
      await page.clock.install();
      await disableWebGL(page);
      page.on('requestfailed', request => failures.push(request.url()));
      await page.route(api, route => {
        if (++requests > 1) return route.fulfill({ json: [book] });
      });
    });
    await test.step('When Universe geöffnet wird', async () => {
      await page.goto('http://localhost:4200/universe');
      await expect.poll(() => requests).toBe(1);
    });
    await test.step('Then ist die Ladeanzeige sichtbar', async () => {
      await expect(page.getByRole('heading', { name: 'Deine Galaxie entsteht' })).toBeVisible();
    });
    await test.step('When mehr als 15 Sekunden verstreichen', async () => {
      await page.clock.runFor(15_001);
    });
    await test.step('Then erscheint der Fehler und der Request wird beendet', async () => {
      await expect(page.getByRole('heading', { name: 'Verbindung unterbrochen' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Deine Galaxie entsteht' })).toHaveCount(0);
      await expect.poll(() => failures).toContain(api);
    });
    await test.step('When erneut versucht wird', async () => {
      await universe.retry();
    });
    await test.step('Then erscheint die Sammlung als bedienbare Buchliste', async () => {
      await expect(page.getByRole('complementary', { name: 'Bücher in der Galaxie' })).toContainText(book.title);
      await expect(page.getByRole('heading', { name: 'Verbindung unterbrochen' })).toHaveCount(0);
      expect(requests).toBe(2);
    });
  });

  test('beendet beim Verlassen einen ausstehenden Request', async ({ page }) => {
    const failures: string[] = [];
    let requests = 0;
    await test.step('Given Universe wartet auf eine Antwort', async () => {
      page.on('requestfailed', request => failures.push(request.url()));
      await page.route(api, () => {
        requests++;
      });
      await page.route(`${api}?*`, route => route.fulfill({ json: [book] }));
      await page.route(`${api}/new-releases`, route => route.fulfill({ json: [] }));
      await page.goto('http://localhost:4200/universe');
      await expect.poll(() => requests).toBe(1);
    });
    await test.step('When zur Sammlung navigiert wird', async () => {
      await page.getByRole('link', { name: 'Listenansicht öffnen', exact: true }).click();
    });
    await test.step('Then ist der Request beendet und die neue Ansicht sichtbar', async () => {
      await expect.poll(() => failures).toContain(api);
      await expect(page.getByRole('heading', { name: book.title, exact: true })).toBeVisible();
      await expect(page.locator('app-book-universe')).toHaveCount(0);
    });
  });

  for (const width of [1280, 320]) {
    test(`navigiert mehrere Suchtreffer per Tastatur bei ${width}px`, async ({ page }) => {
      const universe = new UniversePage(page);
      const details = new BookDialogPage(page);
      const second = { ...book, id: 'second', isbn: 'second-isbn', title: 'Angular patterns' };
      await test.step('Given zwei passende Bücher ohne WebGL-Abhängigkeit', async () => {
        await page.setViewportSize({ width, height: 900 });
        await disableWebGL(page);
        await page.route(api, route => route.fulfill({ json: [book, second] }));
        await page.route(`${api}/${second.isbn}`, route => route.fulfill({ json: second }));
        await page.goto('http://localhost:4200/universe');
        await expect(page.getByText('Deine Galaxie als Buchliste')).toBeVisible();
      });
      await test.step('When nach Angular gesucht wird', async () => {
        await universe.search('Angular');
      });
      await test.step('Then sind beide Optionen mit aktivem ersten Treffer ausgezeichnet', async () => {
        await expect(universe.results.getByRole('option')).toHaveCount(2);
        await expect(universe.searchInput).toHaveAttribute('aria-expanded', 'true');
        await expect(universe.searchInput).toHaveAttribute('aria-activedescendant', 'universe-result-0');
        await expect(universe.results.getByRole('option').nth(0)).toHaveAttribute('aria-selected', 'true');
      });
      await test.step('When mit Pfeil hoch und herunter durch die Treffer gewechselt wird', async () => {
        await universe.searchInput.press('ArrowUp');
        await expect(universe.searchInput).toHaveAttribute('aria-activedescendant', 'universe-result-1');
        await universe.searchInput.press('ArrowDown');
        await expect(universe.searchInput).toHaveAttribute('aria-activedescendant', 'universe-result-0');
        await universe.searchInput.press('ArrowDown');
      });
      await test.step('Then ist die zweite Option aktiv', async () => {
        await expect(universe.results.getByRole('option').nth(1)).toHaveAttribute('aria-selected', 'true');
        await expect(universe.results.getByRole('option').nth(0)).toHaveAttribute('aria-selected', 'false');
      });
      await test.step('When Enter die Auswahl bestätigt und die Details geöffnet werden', async () => {
        await universe.searchInput.press('Enter');
        await expect(universe.selectedBook.getByRole('heading', { name: second.title })).toBeVisible();
        await expect(universe.searchInput).toHaveAttribute('aria-expanded', 'false');
        await universe.openDetails();
      });
      await test.step('Then zeigen die frischen Details das per Tastatur gewählte Buch', async () => {
        await expect(details.dialog.getByText(second.title, { exact: true })).toBeVisible();
        await details.close();
      });
      await test.step('When die Trefferliste erneut geöffnet und mit Escape geschlossen wird', async () => {
        await universe.searchInput.focus();
        await expect(universe.results).toBeVisible();
        await universe.searchInput.press('Escape');
      });
      await test.step('Then ist die Trefferliste geschlossen und das Suchfeld fokussiert', async () => {
        await expect(universe.results).toHaveCount(0);
        await expect(universe.searchInput).toHaveValue('Angular');
        await expect(universe.searchInput).toHaveAttribute('aria-expanded', 'false');
        await expect(universe.searchInput).not.toHaveAttribute('aria-activedescendant');
        await expect(universe.searchInput).toBeFocused();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      });
    });
  }

  test('meldet übersprungene Datensätze und zeigt gültige Bücher weiterhin an', async ({ page }) => {
    const universe = new UniversePage(page);
    await test.step('Given ein gültiges Buch, ein Duplikat und ein unvollständiger Datensatz', async () => {
      await disableWebGL(page);
      await page.route(api, route => route.fulfill({ json: [book, book, { title: 'Unvollständig' }] }));
    });
    await test.step('When Universe geöffnet wird', async () => {
      await page.goto('http://localhost:4200/universe');
    });
    await test.step('Then werden zwei übersprungene Datensätze gemeldet und nur das gültige Buch angeboten', async () => {
      await expect(
        page.getByText('2 unvollständige oder doppelte Datensätze übersprungen.', { exact: true })
      ).toBeVisible();
      await universe.search(book.title);
      await expect(universe.results.getByRole('option')).toHaveCount(1);
      await expect(universe.results).toContainText(book.title);
    });
  });

  test('stellt nach einem WebGL-Initialisierungsfehler die 3D-Ansicht wieder her', async ({ page }) => {
    const universe = new UniversePage(page);
    let loads = 0;
    await test.step('Given WebGL ist zunächst nicht verfügbar', async () => {
      await disableWebGL(page);
      await page.route(api, route => {
        loads++;
        return route.fulfill({ json: [book] });
      });
      await page.goto('http://localhost:4200/universe');
      await expect(page.getByText('Deine Galaxie als Buchliste')).toBeVisible();
      await expect(universe.canvas).toHaveCount(0);
    });
    await test.step('When WebGL wieder verfügbar ist und 3D erneut versucht wird', async () => {
      await page.evaluate(() => Reflect.get(window, '__restoreTestWebGL')());
      await page.getByRole('button', { name: '3D erneut versuchen', exact: true }).click();
    });
    await test.step('Then erscheint eine neue Szene und die Suche bleibt bedienbar', async () => {
      await expect(universe.canvas).toBeVisible();
      await expect(page.getByText('Die 3D-Darstellung ist nicht verfügbar.', { exact: false })).toHaveCount(0);
      await universe.search(book.title);
      await expect(universe.results.getByRole('option')).toHaveCount(1);
      expect(loads).toBe(2);
    });
  });
});
