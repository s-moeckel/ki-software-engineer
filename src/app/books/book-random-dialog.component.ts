import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, signal, DestroyRef, inject, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { takeUntil, timeout } from 'rxjs';
import { Book } from './book';
import { BookApiClient } from './book-api-client.service';
import { CachedCoverPipe } from './cached-cover.pipe';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-book-random-dialog',
  imports: [MatDialogModule, MatButtonModule, CachedCoverPipe],
  templateUrl: './book-random-dialog.component.html',
  styleUrl: './book-random-dialog.component.css'
})
export class BookRandomDialogComponent implements OnInit {
  private readonly api = inject(BookApiClient);
  private readonly destroyRef = inject(DestroyRef);
  private readonly reducedMotion = inject(DOCUMENT).defaultView?.matchMedia('(prefers-reduced-motion: reduce)');
  readonly dialogRef = inject(MatDialogRef<BookRandomDialogComponent, string>);
  readonly state = signal<'loading' | 'rolling' | 'result' | 'empty' | 'error'>('loading');
  private books: Book[] = [];
  readonly faces = ['front', 'back', 'right', 'left', 'top', 'bottom'];
  readonly faceBooks = signal<Book[]>([]);
  readonly result = signal<Book | undefined>(undefined);
  private readonly failedCovers = signal(new Set<string>());
  private animationTimer?: ReturnType<typeof setTimeout>;
  private coverTimer?: ReturnType<typeof setInterval>;
  private closed = false;

  constructor() {
    // Stop work as soon as closing starts, including the dialog's exit animation.
    this.dialogRef
      .beforeClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.closed = true;
        this.stopAnimation();
      });
    this.destroyRef.onDestroy(() => this.stopAnimation());
  }

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    if (this.closed || this.state() === 'rolling') return;
    this.state.set('loading');
    this.api
      .getAllBooks()
      .pipe(timeout(15_000), takeUntil(this.dialogRef.beforeClosed()), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: books => {
          if (this.closed) return;
          this.books = books;
          if (!books.length) {
            this.state.set('empty');
            return;
          }
          this.roll();
        },
        error: () => {
          if (!this.closed) this.state.set('error');
        }
      });
  }

  roll(): void {
    if (this.closed || this.state() === 'rolling' || !this.books.length) return;
    this.state.set('rolling');
    this.result.set(undefined);
    let index = 0;
    this.updateFaces(index);
    // Cover previews do not consume randomness or change the selection odds.
    this.coverTimer = setInterval(() => {
      if (!this.reducedMotion?.matches) this.updateFaces(++index);
    }, 160);
    this.animationTimer = setTimeout(() => {
      this.stopAnimation();
      this.result.set(this.books[Math.floor(Math.random() * this.books.length)]);
      this.state.set('result');
    }, 2000);
  }

  coverAvailable(book: Book): boolean {
    return !!book.cover && !this.failedCovers().has(book.cover);
  }
  coverFailed(book: Book): void {
    this.failedCovers.update(covers => new Set([...covers, book.cover]));
  }

  private updateFaces(start: number): void {
    this.faceBooks.set(this.faces.map((_, index) => this.books[(start + index) % this.books.length]));
  }

  private stopAnimation(): void {
    clearTimeout(this.animationTimer);
    clearInterval(this.coverTimer);
  }
}
