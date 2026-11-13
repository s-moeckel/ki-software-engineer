import { expect, test } from './support/ui-test';
import type { Page } from './support/ui-test';
import { api, book, setup } from './support/books';
import { BookGoogleInformationPage } from './pages/book-google-information.page';

const google = 'https://www.googleapis.com/books/v1/volumes*';
const description = 'Zusätzliche Informationen über dieses Buch.';
const volume = {
  id: 'google-volume',
  volumeInfo: {
    industryIdentifiers: [{ type: 'ISBN_13', identifier: book.isbn }],
    description,
    averageRating: 4.5,
    ratingsCount: 12,
    infoLink: 'https://books.google.com/books?id=google-volume'
  }
};

async function prepare(page: Page): Promise<BookGoogleInformationPage> {
  await setup(page);
  return new BookGoogleInformationPage(page);
}

test.describe('Informationen von Google Books', () => {
  test('AK-1/2: zeigt nur passende ISBN-Daten und erhält Original und Speichervertrag', async ({ page }) => {
    const view = await test.step('Given ein Buch und gemischte Google-Treffer', async () => {
      const view = await prepare(page);
      await page.route(google, route => {
        const url = new URL(route.request().url());
        expect(route.request().method()).toBe('GET');
        expect(url.searchParams.get('q')).toBe(`isbn:${book.isbn}`);
        return route.fulfill({
          json: {
            items: [
              {
                ...volume,
                volumeInfo: {
                  ...volume.volumeInfo,
                  description: 'Falsches Buch',
                  industryIdentifiers: [{ type: 'ISBN_13', identifier: '9780132350884' }]
                }
              },
              volume
            ]
          }
        });
      });
      return view;
    });
    await test.step('When der Detaildialog geöffnet wird', () => view.open(book.title));
    await test.step('Then sind Zusatzdaten getrennt vom Original sichtbar', async () => {
      await expect(view.information.getByText(description, { exact: true })).toBeVisible();
      await expect(view.information.getByText('4.5 von 5', { exact: true })).toBeVisible();
      await expect(view.information.getByText('12', { exact: true })).toBeVisible();
      await expect(view.information.getByText('Falsches Buch')).toHaveCount(0);
      await expect(view.information.getByRole('link', { name: 'Bei Google Books ansehen' })).toHaveAttribute(
        'href',
        volume.volumeInfo.infoLink
      );
      await expect(view.dialog.getByText(book.abstract, { exact: true })).toBeVisible();
    });
    await test.step('When das eigene Buch bearbeitet und gespeichert wird', async () => {
      await page.route(`${api}/${book.isbn}`, route => {
        expect(route.request().method()).toBe('PUT');
        expect(route.request().postDataJSON()).toEqual(book);
        return route.fulfill({ json: book });
      });
      await view.edit();
      await expect(view.dialog.getByLabel('Description', { exact: true })).toHaveValue(book.abstract);
      await view.save();
    });
    await test.step('Then wird das Original ohne externe Felder gespeichert', async () => {
      await expect(view.dialog).toHaveCount(0);
      await expect(page.getByText('Book updated successfully.', { exact: true })).toBeVisible();
    });
  });

  for (const [name, response] of [
    ['kein items-Array', {}],
    ['leere Treffer', { items: [] }],
    [
      'falsche ISBN',
      {
        items: [{ ...volume, volumeInfo: { industryIdentifiers: [{ type: 'ISBN_13', identifier: '9780132350884' }] } }]
      }
    ],
    ['fehlende ISBN-Zuordnung', { items: [{ ...volume, volumeInfo: { description: 'Ungeprüfter Treffer' } }] }]
  ] as const) {
    test(`AK-3: ${name} zeigt den Leerzustand`, async ({ page }) => {
      const view = await test.step('Given eine Antwort ohne passende ISBN', async () => {
        const view = await prepare(page);
        await page.route(google, route => route.fulfill({ json: response }));
        return view;
      });
      await test.step('When das Buch geöffnet wird', () => view.open(book.title));
      await test.step('Then erscheint der Leerzustand neben den eigenen Details', async () => {
        await expect(
          view.information.getByText('Keine zusätzlichen Informationen gefunden', { exact: true })
        ).toBeVisible();
        await expect(view.dialog.getByText(book.abstract, { exact: true })).toBeVisible();
        await expect(view.information.getByRole('link')).toHaveCount(0);
      });
    });
  }

  test('AK-3: lässt fehlende Angaben aus und zeigt eine Bewertungsanzahl von null', async ({ page }) => {
    const view = await test.step('Given ein passender Treffer mit unvollständigen Angaben', async () => {
      const view = await prepare(page);
      await page.route(google, route =>
        route.fulfill({
          json: {
            items: [
              {
                id: 'only-count',
                volumeInfo: { industryIdentifiers: volume.volumeInfo.industryIdentifiers, ratingsCount: 0 }
              }
            ]
          }
        })
      );
      return view;
    });
    await test.step('When das Buch geöffnet wird', () => view.open(book.title));
    await test.step('Then sind nur die verfügbaren Angaben vorhanden', async () => {
      await expect(view.information.getByText('0', { exact: true })).toBeVisible();
      await expect(view.information.getByText('Durchschnittsbewertung', { exact: true })).toHaveCount(0);
      await expect(view.information.getByText('Beschreibung', { exact: true })).toHaveCount(0);
      await expect(view.information.getByRole('link')).toHaveAttribute(
        'href',
        'https://books.google.com/books?id=only-count'
      );
    });
  });

  for (const failure of [429, 500, 'connection'] as const) {
    test(`AK-4: Fehler ${failure} erlaubt Wiederholung und blockiert Details nicht`, async ({ page }) => {
      let attempts = 0;
      const view = await test.step('Given ein fehlgeschlagener externer Abruf', async () => {
        const view = await prepare(page);
        await page.route(google, route => {
          attempts++;
          if (attempts > 1) return route.fulfill({ json: { items: [volume] } });
          return failure === 'connection' ? route.abort() : route.fulfill({ status: failure, json: {} });
        });
        return view;
      });
      await test.step('When der Dialog geöffnet wird', () => view.open(book.title));
      await test.step('Then bleibt der Fehler auf Zusatzinformationen begrenzt', async () => {
        await expect(view.information.getByRole('alert')).toContainText('Google Books');
        await expect(view.dialog.getByText(book.abstract, { exact: true })).toBeVisible();
        await expect(view.dialog.getByRole('button', { name: 'Edit', exact: true })).toBeEnabled();
      });
      await test.step('When der Abruf erneut versucht wird', () => view.retry());
      await test.step('Then werden die Zusatzdaten geladen', async () => {
        await expect(view.information.getByText(description, { exact: true })).toBeVisible();
        expect(attempts).toBe(2);
        await expect(view.information.getByRole('alert')).toHaveCount(0);
      });
    });
  }

  test('AK-4: Timeout beendet den Ladehinweis und erlaubt Wiederholung', async ({ page }) => {
    const view = await test.step('Given ein ausstehender Google-Abruf', async () => {
      const view = await prepare(page);
      await page.clock.install();
      await page.route(google, () => {});
      return view;
    });
    await test.step('When der Abruf länger als 15 Sekunden dauert', async () => {
      await view.open(book.title);
      await expect(view.information.getByRole('status')).toBeVisible();
      await page.clock.runFor(15_001);
    });
    await test.step('Then erscheint eine wiederholbare Fehlermeldung', async () => {
      await expect(view.information.getByRole('alert')).toBeVisible();
      await expect(view.information.getByRole('status')).toHaveCount(0);
      await page.route(google, route => route.fulfill({ json: { items: [volume] } }));
      await view.retry();
      await expect(view.information.getByText(description, { exact: true })).toBeVisible();
    });
  });

  for (const action of ['schließen', 'bearbeiten'] as const) {
    test(`AK-4/5: ${action} beendet ausstehenden Abruf und erneute Anzeige lädt frisch`, async ({ page }) => {
      const view = await test.step('Given ein offener Abruf mit sichtbarem Ladehinweis', async () => {
        const view = await prepare(page);
        await page.route(google, () => {});
        await view.open(book.title);
        await expect(view.information.getByRole('status')).toBeVisible();
        await expect(view.dialog.getByText(book.abstract, { exact: true })).toBeVisible();
        return view;
      });
      await test.step(`When der Nutzer den Dialog ${action} möchte`, async () => {
        const aborted = page.waitForEvent('requestfailed', request =>
          request.url().startsWith('https://www.googleapis.com/books/v1/volumes')
        );
        if (action === 'schließen') await view.close();
        else await view.edit();
        const request = await aborted;
        expect(request.failure()?.errorText).toContain('ERR_ABORTED');
      });
      await test.step('Then ist erneute Anzeige mit einem frischen Abruf möglich', async () => {
        await page.route(google, route => route.fulfill({ json: { items: [volume] } }));
        if (action === 'schließen') await view.open(book.title);
        else {
          await expect(view.dialog.getByLabel('Title', { exact: true })).toHaveValue(book.title);
          await view.dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
        }
        await expect(view.information.getByText(description, { exact: true })).toBeVisible();
      });
    });
  }

  test('AK-2: externe Beschreibung bleibt Text und ein unsicherer Quellenlink wird ersetzt', async ({ page }) => {
    const html = '<img src=x onerror="alert(1)"><b>Externe Beschreibung</b>';
    const view = await test.step('Given HTML und ein ausführbarer Link im Treffer', async () => {
      const view = await prepare(page);
      await page.route(google, route =>
        route.fulfill({
          json: {
            items: [
              {
                ...volume,
                volumeInfo: { ...volume.volumeInfo, description: html, infoLink: 'javascript:alert(1)' }
              }
            ]
          }
        })
      );
      return view;
    });
    await test.step('When das Buch geöffnet wird', () => view.open(book.title));
    await test.step('Then wird kein externes HTML ausgeführt', async () => {
      await expect(view.information.getByText(html, { exact: true })).toBeVisible();
      await expect(view.information.getByRole('img')).toHaveCount(0);
      await expect(view.information.getByRole('link')).toHaveAttribute(
        'href',
        'https://books.google.com/books?id=google-volume'
      );
    });
  });

  test('AK-2/4: Zusatzinformationen bleiben auf schmalen Bildschirmen per Tastatur bedienbar', async ({ page }) => {
    const view = await test.step('Given ein schmales Fenster und ein Google-Fehler', async () => {
      await page.setViewportSize({ width: 320, height: 720 });
      const view = await prepare(page);
      await page.route(google, route => route.fulfill({ status: 503, json: {} }));
      return view;
    });
    await test.step('When der Nutzer die Wiederholung mit Enter auslöst', async () => {
      await view.open(book.title);
      const retry = view.information.getByRole('button', { name: 'Erneut versuchen' });
      await retry.focus();
      await expect(retry).toBeFocused();
      await page.route(google, route => route.fulfill({ json: { items: [volume] } }));
      await page.keyboard.press('Enter');
    });
    await test.step('Then sind Quelle und Beschreibung zugänglich ohne horizontalen Überlauf', async () => {
      await expect(view.information.getByText(description, { exact: true })).toBeVisible();
      const link = view.information.getByRole('link');
      await link.focus();
      await expect(link).toBeFocused();
      expect(await view.dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    });
  });
});
