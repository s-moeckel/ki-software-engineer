import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, input, signal, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { Subscription } from 'rxjs';
import { BookDialogService } from './book-dialog.service';
import { Book } from './book';
import { BookApiClient } from './book-api-client.service';
import { BookItemComponent } from './book-item.component';
import { ReadingListAddComponent } from '../reading-list/reading-list-add.component';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-book-list',
  imports: [
    ReactiveFormsModule,
    BookItemComponent,
    MatDialogModule,
    MatSnackBarModule,
    MatButtonModule,
    ReadingListAddComponent
  ],
  template: `
    <div class="container mx-auto px-4 py-12 max-w-7xl">
      <h1
        class="text-3xl font-bold mb-10 text-blue-700 dark:text-blue-300 border-b pb-4 border-gray-200 dark:border-gray-700"
      >
        Book Collection
      </h1>

      <div class="mb-6">
        <button mat-flat-button type="button" (click)="openCreate()">Buch anlegen</button>
      </div>

      <div class="mb-6">
        <div class="flex items-center border-b-2 border-gray-300 dark:border-gray-600 py-2">
          <input
            type="text"
            aria-label="Search for books"
            [formControl]="search"
            placeholder="Search for books..."
            class="appearance-none bg-transparent border-none w-full text-gray-700 dark:text-gray-200 mr-3 py-1 px-2 leading-tight focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
          />
          @if (search.value) {
            <button
              aria-label="Clear search"
              (click)="clearSearch()"
              class="flex-shrink-0 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
            >
              <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            </button>
          }
        </div>
      </div>

      @if (loading()) {
        <div class="flex justify-center items-center py-20">
          <div class="animate-pulse flex flex-col items-center">
            <div
              class="h-16 w-16 rounded-full border-4 border-t-blue-700 dark:border-t-blue-400 border-r-blue-700 dark:border-r-blue-400 border-b-gray-200 dark:border-b-gray-700 border-l-gray-200 dark:border-l-gray-700 animate-spin"
            ></div>
            <p class="mt-4 text-gray-600 dark:text-gray-300">Loading books...</p>
          </div>
        </div>
      }

      @if (loadError()) {
        <p role="alert">Could not load books. <button type="button" (click)="loadBooks()">Retry</button></p>
      }
      <nav aria-label="Bücherseiten" class="flex flex-wrap items-center justify-center gap-4 my-6">
        <button
          mat-stroked-button
          type="button"
          (click)="changePage(-1)"
          [disabled]="loading() || loadError() || page() <= 1"
        >
          Zurück
        </button>
        <p role="status" aria-atomic="true">
          @if (!loading() && !loadError()) {
            Seite {{ page() }} von {{ pageCount() }} · {{ total() }} Bücher
          }
        </p>
        <button
          mat-stroked-button
          type="button"
          (click)="changePage(1)"
          [disabled]="loading() || loadError() || page() >= pageCount()"
        >
          Weiter
        </button>
      </nav>
      @if (!loading() && !loadError()) {
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-8">
          @for (book of books(); track book.id) {
            <app-book-item [book]="book" (details)="openDetails($event)">
              <app-reading-list-add [isbn]="book.isbn" />
            </app-book-item>
          }
          @if (books().length === 0) {
            <div
              class="col-span-full flex flex-col items-center justify-center py-16 text-center bg-gray-50 dark:bg-gray-900 rounded-xl"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-16 w-16 text-gray-400 dark:text-gray-400 mb-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="1.5"
                  d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                />
              </svg>
              <p class="text-xl font-medium text-gray-600 dark:text-gray-300 mb-2">
                {{ search.value ? 'No books match your search' : 'No books available' }}
              </p>
              <p class="text-gray-500 dark:text-gray-400">
                {{ search.value ? 'Try different search terms or clear the search' : 'Check back later' }}
              </p>
              @if (search.value) {
                <button
                  (click)="clearSearch()"
                  class="mt-4 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-md transition duration-200"
                >
                  Clear Search
                </button>
              }
            </div>
          }
        </div>
      }
    </div>
  `
})
export class BookListComponent implements OnInit {
  readonly pageSize = input(10);
  readonly books = signal<Book[]>([]);
  readonly loading = signal(true);
  readonly search = new FormControl('', { nonNullable: true });
  readonly loadError = signal(false);
  readonly page = signal(1);
  readonly total = signal(0);
  readonly pageCount = computed(() => Math.max(1, Math.ceil(this.total() / this.pageSize())));
  private searchTimeout?: ReturnType<typeof setTimeout>;
  private listRequest?: Subscription;
  private readonly destroyRef = inject(DestroyRef);
  private readonly dialogs = inject(BookDialogService);

  private readonly bookApiClient = inject(BookApiClient);

  constructor() {
    this.destroyRef.onDestroy(() => clearTimeout(this.searchTimeout));
  }

  ngOnInit(): void {
    this.search.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.onSearchChange());
    this.dialogs.changes.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.loadBooks());
    this.loadBooks();
  }

  loadBooks(): void {
    clearTimeout(this.searchTimeout);
    this.listRequest?.unsubscribe();
    this.loading.set(true);
    this.loadError.set(false);
    this.listRequest = this.bookApiClient
      .getBooks(this.pageSize(), this.search.value, this.page())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: result => {
          this.total.set(result.total);
          if (this.page() > this.pageCount()) {
            this.page.set(this.pageCount());
            this.loadBooks();
            return;
          }
          this.books.set(result.books);
          this.loading.set(false);
        },
        error: () => {
          this.loadError.set(true);
          this.loading.set(false);
        }
      });
  }

  onSearchChange(): void {
    this.page.set(1);
    clearTimeout(this.searchTimeout);
    // Invalidate the previous search immediately, including its in-flight response.
    this.listRequest?.unsubscribe();
    this.loading.set(true);
    this.loadError.set(false);
    this.searchTimeout = setTimeout(() => {
      this.loadBooks();
    }, 300);
  }

  openDetails(book: Book): void {
    this.dialogs.openDetails(book.isbn);
  }

  openCreate(): void {
    this.dialogs.openCreate();
  }

  clearSearch(): void {
    this.page.set(1);
    this.search.setValue('', { emitEvent: false });
    this.loadBooks();
  }

  changePage(direction: -1 | 1): void {
    const page = this.page() + direction;
    if (this.loading() || this.loadError() || page < 1 || page > this.pageCount()) return;
    this.page.set(page);
    this.loadBooks();
  }
}
