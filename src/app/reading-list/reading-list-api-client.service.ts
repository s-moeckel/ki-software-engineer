import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, concat, map, Observable, of, timeout, TimeoutError } from 'rxjs';
import { BoardAction, ReadingChange, ReadingEntry } from './reading-list';

@Injectable({ providedIn: 'root' })
export class ReadingListApiClient {
  private readonly http = inject(HttpClient);
  private readonly url = 'http://localhost:4730/reading-list';

  getEntries(): Observable<ReadingEntry[]> {
    return this.http.get<ReadingEntry[]>(this.url).pipe(timeout(15_000));
  }

  add(isbn: string): Observable<ReadingChange> {
    return this.resolve(this.http.post<ReadingEntry[]>(this.url, { isbn }));
  }

  change(action: BoardAction): Observable<ReadingChange> {
    const url = `${this.url}/${encodeURIComponent(action.isbn)}`;
    return this.resolve(
      'remove' in action
        ? this.http.delete<ReadingEntry[]>(url)
        : this.http.put<ReadingEntry[]>(url, { status: action.status, position: action.position })
    );
  }

  private resolve(request: Observable<ReadingEntry[]>): Observable<ReadingChange> {
    return request.pipe(
      timeout(15_000),
      map((entries): ReadingChange => ({ kind: 'saved', entries })),
      catchError((error: unknown): Observable<ReadingChange> => {
        if (!(error instanceof TimeoutError) && !(error instanceof HttpErrorResponse && error.status === 0)) {
          return of({ kind: 'rejected' });
        }
        // A lost response can follow a committed transaction. Never blindly repeat it.
        return concat(
          of<ReadingChange>({ kind: 'reconciling' }),
          this.getEntries().pipe(
            map((entries): ReadingChange => ({ kind: 'reconciled', entries })),
            catchError(() => of<ReadingChange>({ kind: 'unknown' }))
          )
        );
      })
    );
  }
}
