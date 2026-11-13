import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { Book, NewBook } from './book';

export interface BookPage {
  books: Book[];
  total: number;
}

@Injectable({ providedIn: 'root' })
export class BookApiClient {
  private readonly apiUrl = 'http://localhost:4730/books';

  private readonly http = inject(HttpClient);

  getAllBooks(): Observable<Book[]> {
    return this.http.get<Book[]>(this.apiUrl);
  }

  createBook(book: NewBook): Observable<Book> {
    return this.http.post<Book>(this.apiUrl, book);
  }

  getBook(isbn: string): Observable<Book> {
    return this.http.get<Book>(`${this.apiUrl}/${encodeURIComponent(isbn)}`);
  }

  updateBook(isbn: string, book: Book): Observable<Book> {
    return this.http.put<Book>(`${this.apiUrl}/${encodeURIComponent(isbn)}`, book);
  }

  getBooks(pageSize: number = 10, searchTerm?: string, page = 1): Observable<BookPage> {
    let params = new HttpParams().set('_limit', pageSize.toString()).set('_page', page.toString());

    if (searchTerm) {
      params = params.set('q', searchTerm);
    }

    return this.http.get<Book[]>(this.apiUrl, { params, observe: 'response' }).pipe(
      map(response => {
        const books = response.body ?? [];
        // Legacy APIs without pagination metadata can still display their first results.
        const total = Number(response.headers.get('X-Total-Count') ?? books.length);
        return { books, total };
      })
    );
  }
}
