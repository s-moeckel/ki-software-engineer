import { expect, test } from '@playwright/test';
import { findGoogleBooksInformation } from '../src/app/books/google-books-information';

const isbn = '9780132350884';
const identifiers = [{ type: 'ISBN_13', identifier: isbn }];

test.describe('Google-Books-Zuordnung', () => {
  test('AK-1: normalisiert Trennzeichen und akzeptiert die äquivalente ISBN-10', () => {
    expect(
      findGoogleBooksInformation(
        {
          items: [
            {
              id: 'clean-code',
              volumeInfo: {
                industryIdentifiers: [{ type: 'ISBN_10', identifier: '0-13-235088-2' }],
                description: 'Clean Code'
              }
            }
          ]
        },
        '978-0-13-235088-4'
      )?.description
    ).toBe('Clean Code');
  });

  test('AK-1: normalisiert ein kleines ISBN-10-x', () => {
    expect(
      findGoogleBooksInformation(
        {
          items: [
            {
              id: 'isbn-x',
              volumeInfo: {
                industryIdentifiers: [{ type: 'ISBN_10', identifier: '080442957X' }]
              }
            }
          ]
        },
        '0 8044 2957 x'
      )
    ).not.toBeNull();
  });

  for (const response of [null, [], 'invalid', { items: {} }, { items: [null, {}, { volumeInfo: null }] }]) {
    test(`AK-3: ignoriert ungültige Antwort ${JSON.stringify(response)}`, () => {
      expect(findGoogleBooksInformation(response, isbn)).toBeNull();
    });
  }

  test('AK-3: lässt ungültige optionale Felder aus', () => {
    expect(
      findGoogleBooksInformation(
        {
          items: [
            {
              volumeInfo: {
                industryIdentifiers: identifiers,
                description: 42,
                averageRating: -1,
                ratingsCount: 2.5
              }
            }
          ]
        },
        isbn
      )
    ).toEqual({});
  });

  test('AK-3: Werte außerhalb der Bewertungsskala werden ausgelassen', () => {
    expect(
      findGoogleBooksInformation(
        {
          items: [
            {
              volumeInfo: {
                industryIdentifiers: identifiers,
                averageRating: 6,
                ratingsCount: -1
              }
            }
          ]
        },
        isbn
      )
    ).toEqual({});
  });

  test('AK-1: OTHER-Identifikatoren und leere ISBN sind keine ISBN-Treffer', () => {
    expect(
      findGoogleBooksInformation(
        {
          items: [
            {
              volumeInfo: {
                industryIdentifiers: [{ type: 'OTHER', identifier: isbn }]
              }
            }
          ]
        },
        isbn
      )
    ).toBeNull();
    expect(
      findGoogleBooksInformation(
        {
          items: [
            {
              volumeInfo: {
                industryIdentifiers: [{ type: 'ISBN_13', identifier: '' }]
              }
            }
          ]
        },
        ''
      )
    ).toBeNull();
  });

  for (const link of [
    'javascript:alert(1)',
    'https://books.google.com.evil.test/books?id=1',
    'https://evil.test/books',
    'https://books.google.com:444/books',
    'https://user:password@books.google.com/books'
  ]) {
    test(`AK-2: verwirft unsicheren Quellenlink ${link}`, () => {
      const result = findGoogleBooksInformation(
        {
          items: [
            {
              volumeInfo: {
                industryIdentifiers: identifiers,
                infoLink: link
              }
            }
          ]
        },
        isbn
      );
      expect(result).toEqual({});
    });
  }

  test('AK-2: normalisiert HTTP-Quellenlink auf HTTPS', () => {
    expect(
      findGoogleBooksInformation(
        {
          items: [
            {
              volumeInfo: {
                industryIdentifiers: identifiers,
                infoLink: 'http://books.google.de/books?id=1'
              }
            }
          ]
        },
        isbn
      )?.sourceUrl
    ).toBe('https://books.google.de/books?id=1');
  });
});
