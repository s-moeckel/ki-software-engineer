import { expect, test } from '@playwright/test';
import { BooksPage } from './pages/books.page';
import { api, book, expectListRequest } from './support/books';

// Search mocks only handle paginated list requests, not other page sections.
const listApi = `${api}?*`;
const secondBook = { ...book, id: 'internal-43', isbn: '9781234567891', title: 'RxJS in practice' };
const initialBooks = [book, secondBook];

test.describe('Buchsuche', () => {
  test.beforeEach(async ({ page }) => {
    await test.step('Given eine Buchliste mit zwei Büchern und eine kontrollierte Uhr', async () => {
      await page.clock.install({ time: new Date('2030-01-01T00:00:00Z') });
      await page.route(/^https:\/\//, route => route.abort());
      await page.route(api, route => route.fulfill({ json: [] }));
      await page.route(`${api}/new-releases`, route => route.fulfill({ json: [] }));
      await page.route(listApi, route => {
        expectListRequest(route);
        return route.fulfill({ json: initialBooks });
      });
      await page.goto('http://localhost:4200');
      const books = new BooksPage(page);
      await expect(books.bookTitle(book.title)).toBeVisible();
      await expect(books.bookTitle(secondBook.title)).toBeVisible();
      await page.clock.pauseAt(new Date('2030-01-01T01:00:00Z'));
    });
  });

  test('zeigt die Bücher der Ausgangsliste', async ({ page }) => {
    const books = new BooksPage(page);
    await test.step('When die Listenansicht geöffnet ist', async () => {
      await expect(page).toHaveURL('http://localhost:4200/');
    });
    await test.step('Then sind beide Bücher ohne Suchtext sichtbar', async () => {
      await expect(books.searchInput).toHaveValue('');
      await expect(books.bookTitle(book.title)).toBeVisible();
      await expect(books.bookTitle(secondBook.title)).toBeVisible();
      await expect(books.loading).toHaveCount(0);
      await expect(books.error).toHaveCount(0);
    });
  });

  test('sucht nach einem Titel und zeigt ausschließlich den Treffer', async ({ page }) => {
    const books = new BooksPage(page);
    const searches: (string | null)[] = [];
    await test.step('Given die API liefert für den Titel nur das passende Buch', async () => {
      await page.route(listApi, route => {
        searches.push(expectListRequest(route).searchParams.get('q'));
        return route.fulfill({ json: [book] });
      });
    });
    await test.step('When der Titel eingegeben und das Debouncing abgeschlossen wird', async () => {
      await books.search(book.title);
      await page.clock.runFor(300);
      await page.clock.resume();
    });
    await test.step('Then enthält der Request den Titel und nur der Treffer ist sichtbar', async () => {
      await expect.poll(() => searches).toEqual([book.title]);
      await expect(books.bookTitle(book.title)).toBeVisible();
      await expect(books.bookTitle(secondBook.title)).toHaveCount(0);
    });
  });

  test('stellt nach abgeschlossener Suche mit Clear die Ausgangsliste wieder her', async ({ page }) => {
    const books = new BooksPage(page);
    const searches: (string | null)[] = [];
    await test.step('Given eine abgeschlossene Suche mit einem Treffer', async () => {
      await page.route(listApi, route => {
        const query = expectListRequest(route).searchParams.get('q');
        searches.push(query);
        return route.fulfill({ json: query ? [book] : initialBooks });
      });
      await books.search(book.title);
      await page.clock.runFor(300);
      await page.clock.resume();
      await expect(books.bookTitle(book.title)).toBeVisible();
      await expect(books.bookTitle(secondBook.title)).toHaveCount(0);
    });
    await test.step('When die Suche mit Clear zurückgesetzt wird', async () => {
      await books.clearSearch();
    });
    await test.step('Then lädt die Liste ohne q und zeigt wieder beide Bücher', async () => {
      await expect.poll(() => searches).toEqual([book.title, null]);
      await expect(books.searchInput).toHaveValue('');
      await expect(books.bookTitle(book.title)).toBeVisible();
      await expect(books.bookTitle(secondBook.title)).toBeVisible();
    });
  });

  test('zeigt bei einer erfolglosen Suche den Such-Leerzustand', async ({ page }) => {
    const books = new BooksPage(page);
    await test.step('Given die Suchanfrage liefert keine Treffer', async () => {
      await page.route(listApi, route => {
        expect(expectListRequest(route).searchParams.get('q')).toBe('missing');
        return route.fulfill({ json: [] });
      });
    });
    await test.step('When nach einem unbekannten Titel gesucht wird', async () => {
      await books.search('missing');
      await page.clock.runFor(300);
      await page.clock.resume();
    });
    await test.step('Then erscheint die Suchmeldung ohne Listen-Leerzustand oder Fehler', async () => {
      await expect(books.emptySearch).toBeVisible();
      await expect(books.emptyList).toHaveCount(0);
      await expect(books.error).toHaveCount(0);
      await expect(books.bookTitle(book.title)).toHaveCount(0);
      await expect(books.bookTitle(secondBook.title)).toHaveCount(0);
    });
  });

  test('zeigt bei leerem Bestand den Listen-Leerzustand', async ({ page }) => {
    const books = new BooksPage(page);
    await test.step('Given die ungesuchte Liste liefert keine Bücher', async () => {
      await page.route(listApi, route => {
        expect(expectListRequest(route).searchParams.get('q')).toBeNull();
        return route.fulfill({ json: [] });
      });
    });
    await test.step('When die Listenansicht neu geladen wird', async () => {
      await page.clock.resume();
      await page.reload();
    });
    await test.step('Then erscheint die Bestandsmeldung ohne Such-Leerzustand oder Fehler', async () => {
      await expect(books.emptyList).toBeVisible();
      await expect(books.emptySearch).toHaveCount(0);
      await expect(books.error).toHaveCount(0);
      await expect(books.searchInput).toHaveValue('');
    });
  });

  test('bündelt Eingaben für 300 ms und blendet bisherige Ergebnisse sofort aus', async ({ page }) => {
    const books = new BooksPage(page);
    const searches: string[] = [];
    await test.step('Given die Suchrequests werden aufgezeichnet', async () => {
      await page.route(listApi, route => {
        searches.push(expectListRequest(route).searchParams.get('q') ?? '');
        return route.fulfill({ json: [book] });
      });
    });
    await test.step('When ein Teil des Suchbegriffs eingegeben wird', async () => {
      await books.search('Ang');
      await page.clock.runFor(200);
    });
    await test.step('Then sind die alten Bücher verborgen und der Ladezustand sichtbar', async () => {
      await expect(books.bookTitle(book.title)).toHaveCount(0);
      await expect(books.bookTitle(secondBook.title)).toHaveCount(0);
      await expect(books.loading).toBeVisible();
    });
    await test.step('When die Eingabe geändert wird und weitere 299 ms vergehen', async () => {
      await books.search('Angular');
      await page.clock.runFor(299);
    });
    await test.step('Then wurde noch keine Suche abgesendet', async () => {
      expect(searches).toEqual([]);
    });
    await test.step('When die letzte Millisekunde verstreicht', async () => {
      await page.clock.runFor(1);
      await page.clock.resume();
    });
    await test.step('Then wird genau der aktuelle Begriff gesucht und angezeigt', async () => {
      await expect.poll(() => searches).toEqual(['Angular']);
      await expect(books.bookTitle(book.title)).toBeVisible();
    });
  });

  test('ignoriert eine alte Antwort während des nächsten Debouncings', async ({ page }) => {
    const books = new BooksPage(page);
    let release!: () => void;
    const pending = new Promise<void>(resolve => (release = resolve));
    const searches: string[] = [];
    await test.step('Given eine alte Suchanfrage wartet auf ihre Antwort', async () => {
      await page.route(listApi, async route => {
        const query = expectListRequest(route).searchParams.get('q') ?? '';
        searches.push(query);
        if (query === 'old') await pending;
        await route.fulfill({ json: [{ ...book, title: query === 'old' ? 'Outdated result' : 'Latest result' }] });
      });
      await books.search('old');
      await page.clock.runFor(300);
      await expect.poll(() => searches).toEqual(['old']);
    });
    await test.step('When eine neue Suche beginnt und die alte Antwort eintrifft', async () => {
      await books.search('new');
      release();
      await page.clock.runFor(200);
    });
    await test.step('Then bleibt der Ladezustand ohne veralteten Treffer sichtbar', async () => {
      await expect(books.loading).toBeVisible();
      await expect(books.bookTitle('Outdated result')).toHaveCount(0);
    });
    await test.step('When auch das neue Debouncing abgeschlossen ist', async () => {
      await page.clock.runFor(100);
      await page.clock.resume();
    });
    await test.step('Then erscheint ausschließlich das aktuelle Ergebnis', async () => {
      await expect(books.bookTitle('Latest result')).toBeVisible();
      await expect(books.bookTitle('Outdated result')).toHaveCount(0);
      expect(searches).toEqual(['old', 'new']);
    });
  });

  test('bricht mit Clear das Debouncing ab und lädt genau einmal ohne Suchtext', async ({ page }) => {
    const books = new BooksPage(page);
    const searches: (string | null)[] = [];
    await test.step('Given eine Suche wartet noch auf das Ende des Debouncings', async () => {
      await page.route(listApi, route => {
        searches.push(expectListRequest(route).searchParams.get('q'));
        return route.fulfill({ json: initialBooks });
      });
      await books.search('pending');
      await page.clock.runFor(200);
    });
    await test.step('When Clear geklickt wird und die Timer weiterlaufen', async () => {
      await books.clearSearch();
      await expect.poll(() => searches).toEqual([null]);
      await page.clock.runFor(1000);
    });
    await test.step('Then gibt es genau einen ungesuchten Abruf und wieder beide Bücher', async () => {
      expect(searches).toEqual([null]);
      await expect(books.searchInput).toHaveValue('');
      await expect(books.bookTitle(book.title)).toBeVisible();
      await expect(books.bookTitle(secondBook.title)).toBeVisible();
    });
  });

  test('unterscheidet Suchfehler von leeren Treffern und wiederholt den aktuellen Begriff', async ({ page }) => {
    const books = new BooksPage(page);
    let fail = true;
    const searches: (string | null)[] = [];
    await test.step('Given die Such-API antwortet mit einem Fehler', async () => {
      await page.route(listApi, route => {
        searches.push(expectListRequest(route).searchParams.get('q'));
        return route.fulfill(fail ? { status: 500, json: {} } : { json: [] });
      });
    });
    await test.step('When nach einem Titel gesucht wird', async () => {
      await books.search('missing');
      await page.clock.runFor(300);
      await page.clock.resume();
    });
    await test.step('Then erscheint ein Fehler anstelle des Such-Leerzustands', async () => {
      await expect(books.error).toContainText('Could not load books.');
      await expect(books.emptySearch).toHaveCount(0);
    });
    await test.step('When die API wieder verfügbar ist und Retry geklickt wird', async () => {
      fail = false;
      await books.retry();
    });
    await test.step('Then wurde derselbe Begriff wiederholt und die leere Antwort angezeigt', async () => {
      await expect(books.error).toHaveCount(0);
      await expect(books.emptySearch).toBeVisible();
      expect(searches).toEqual(['missing', 'missing']);
    });
  });

  test('erholt sich nach einem fehlgeschlagenen initialen Listenabruf', async ({ page }) => {
    const books = new BooksPage(page);
    let fail = true;
    const searches: (string | null)[] = [];
    await test.step('Given die Listen-API antwortet mit einem Fehler', async () => {
      await page.clock.resume();
      await page.route(listApi, route => {
        searches.push(expectListRequest(route).searchParams.get('q'));
        return route.fulfill(fail ? { status: 500, json: {} } : { json: initialBooks });
      });
    });
    await test.step('When die Seite neu geladen wird', async () => {
      await page.reload();
    });
    await test.step('Then erscheint ein Fehler anstelle eines leeren Bestands', async () => {
      await expect(books.error).toContainText('Could not load books.');
      await expect(books.emptyList).toHaveCount(0);
    });
    await test.step('When die API wieder verfügbar ist und Retry geklickt wird', async () => {
      fail = false;
      await books.retry();
    });
    await test.step('Then erscheinen die Bücher nach dem erneuten ungesuchten Abruf', async () => {
      await expect(books.bookTitle(book.title)).toBeVisible();
      await expect(books.bookTitle(secondBook.title)).toBeVisible();
      await expect(books.error).toHaveCount(0);
      expect(searches).toEqual([null, null]);
    });
  });

  test('beendet ausstehendes Debouncing beim Verlassen und startet bei Rückkehr frisch', async ({ page }) => {
    const books = new BooksPage(page);
    const searches: (string | null)[] = [];
    await test.step('Given eine Suche mit ausstehendem Debouncing', async () => {
      await page.route(listApi, route => {
        searches.push(expectListRequest(route).searchParams.get('q'));
        return route.fulfill({ json: initialBooks });
      });
      await books.search('pending');
      await page.clock.runFor(100);
    });
    await test.step('When zur Universe-Ansicht navigiert wird und die Zeit verstreicht', async () => {
      await page.getByRole('link', { name: 'BookMonkey Universe öffnen', exact: true }).click();
      await expect(page).toHaveURL(/\/universe$/);
      await page.clock.runFor(1000);
    });
    await test.step('Then wurde keine ausstehende Suchanfrage mehr gesendet', async () => {
      expect(searches).toEqual([]);
    });
    await test.step('When zur Liste zurückgekehrt wird', async () => {
      await page.clock.resume();
      await page.getByRole('link', { name: 'Listenansicht öffnen', exact: true }).click();
    });
    await test.step('Then wird ohne alten Suchtext eine neue Liste geladen', async () => {
      await expect(page).toHaveURL('http://localhost:4200/');
      await expect(books.searchInput).toHaveValue('');
      await expect.poll(() => searches).toEqual([null]);
      await expect(books.bookTitle(book.title)).toBeVisible();
      await expect(books.bookTitle(secondBook.title)).toBeVisible();
    });
  });
});
