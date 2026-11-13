import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable, InjectionToken } from '@angular/core';
import { map, Observable, timeout } from 'rxjs';
import {
  findGoogleBooksInformation,
  GoogleBooksInformation,
  normalizeGoogleBooksIsbn
} from './google-books-information';

/** Public browser key: restrict it to the Books API and the deployed HTTP referrers. */
export const GOOGLE_BOOKS_API_KEY = new InjectionToken<string>('Google Books browser API key', {
  providedIn: 'root',
  factory: () => ''
});

@Injectable({ providedIn: 'root' })
export class GoogleBooksApiClient {
  private readonly http = inject(HttpClient);
  private readonly apiKey = inject(GOOGLE_BOOKS_API_KEY);

  getByIsbn(isbn: string): Observable<GoogleBooksInformation | null> {
    let params = new HttpParams().set('q', `isbn:${normalizeGoogleBooksIsbn(isbn)}`).set('maxResults', 40);
    if (this.apiKey.trim()) params = params.set('key', this.apiKey.trim());
    return this.http.get<unknown>('https://www.googleapis.com/books/v1/volumes', { params }).pipe(
      timeout(15_000),
      map(response => findGoogleBooksInformation(response, isbn))
    );
  }
}
