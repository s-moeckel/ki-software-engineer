import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, signal, DestroyRef, inject, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { timeout, TimeoutError } from 'rxjs';
import { Book } from './book';
import { publicationDateValidator } from './publication-date';
import { BookApiClient } from './book-api-client.service';
import { CachedCoverPipe } from './cached-cover.pipe';
import { ReadingListAddComponent } from '../reading-list/reading-list-add.component';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-book-details-dialog',
  imports: [
    DatePipe,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    CachedCoverPipe,
    ReadingListAddComponent
  ],
  templateUrl: './book-details-dialog.component.html',
  styles: `
    :host {
      display: block;
      min-width: 0;
    }
    mat-form-field {
      width: 100%;
    }
    dd {
      margin: 0;
      overflow-wrap: anywhere;
    }
    dt {
      font-weight: 600;
    }
  `
})
export class BookDetailsDialogComponent implements OnInit {
  private readonly api = inject(BookApiClient);
  private readonly destroyRef = inject(DestroyRef);
  private readonly requestTimeoutMs = 15_000;
  readonly dialogRef = inject(MatDialogRef<BookDetailsDialogComponent, Book>);
  readonly data = inject<{ isbn: string }>(MAT_DIALOG_DATA);
  readonly state = signal<'loading' | 'viewing' | 'editing' | 'saving' | 'uncertain' | 'error'>('loading');
  readonly book = signal<Book | undefined>(undefined);
  readonly loadError = signal('');
  readonly saveError = signal('');
  saveUnconfirmed = false;
  readonly coverFailed = signal(false);

  readonly form = new FormGroup({
    title: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.pattern(/\S/)] }),
    subtitle: new FormControl('', { nonNullable: true }),
    author: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.pattern(/\S/)] }),
    publisher: new FormControl('', { nonNullable: true }),
    numPages: new FormControl<number | null>(null, [
      Validators.required,
      control => (Number.isInteger(control.value) && control.value > 0 ? null : { positiveInteger: true })
    ]),
    publicationDate: new FormControl('', { nonNullable: true, validators: [publicationDateValidator] }),
    price: new FormControl('', { nonNullable: true }),
    cover: new FormControl('', { nonNullable: true }),
    abstract: new FormControl('', { nonNullable: true })
  });

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.state.set('loading');
    this.loadError.set('');
    this.saveError.set('');
    this.api
      .getBook(this.data.isbn)
      .pipe(timeout(this.requestTimeoutMs), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: book => {
          this.book.set(book);
          this.coverFailed.set(false);
          this.state.set('viewing');
        },
        error: (error: HttpErrorResponse) => {
          this.loadError.set(
            error.status === 404
              ? 'This book could not be found. It may have been removed.'
              : 'Could not load book details. Please try again.'
          );
          this.state.set('error');
        }
      });
  }

  edit(): void {
    const book = this.book();
    if (this.state() !== 'viewing' || !book) return;
    this.form.enable();
    this.form.reset({ ...book, subtitle: book.subtitle ?? '', publicationDate: book.publicationDate ?? '' });
    this.saveError.set('');
    this.state.set('editing');
  }

  cancel(): void {
    if (this.state() !== 'editing') return;
    this.form.reset();
    this.saveError.set('');
    this.state.set('viewing');
  }

  save(): void {
    const book = this.book();
    if (this.state() !== 'editing' || !book) return;
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const draft = this.form.getRawValue();
    const updated: Book = { ...book, ...draft, numPages: draft.numPages! };
    this.state.set('saving');
    this.saveError.set('');
    this.dialogRef.disableClose = true;
    this.form.disable();
    this.api
      .updateBook(this.data.isbn, updated)
      .pipe(timeout(this.requestTimeoutMs), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: book => this.dialogRef.close(book),
        error: (error: unknown) => {
          this.dialogRef.disableClose = false;
          if (error instanceof TimeoutError || (error instanceof HttpErrorResponse && error.status === 0)) {
            this.saveUnconfirmed = true;
            this.state.set('uncertain');
            this.saveError.set(
              'The save result is unknown. Your draft is shown below. Reload the saved version before editing again; this discards the draft. The server may still be processing the save.'
            );
            return;
          }
          this.state.set('editing');
          this.form.enable();
          this.saveError.set('Could not save your changes. Please try again.');
        }
      });
  }
}
