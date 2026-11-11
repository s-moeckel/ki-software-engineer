import {
  AfterViewInit,
  Component,
  DestroyRef,
  ElementRef,
  NgZone,
  OnDestroy,
  ViewChild,
  inject,
  signal
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subscription, timeout } from 'rxjs';
import { BookApiClient } from '../books/book-api-client.service';
import { BookDialogService } from '../books/book-dialog.service';
import { Book } from '../books/book';
import { createLibraryLayout, searchLibrary } from './library-data';
import { LibraryRenderer } from './library-renderer';

@Component({
  selector: 'app-library',
  imports: [RouterLink],
  templateUrl: './library.component.html',
  styleUrl: './library.component.css'
})
export class LibraryComponent implements AfterViewInit, OnDestroy {
  @ViewChild('scene', { static: true }) private sceneHost!: ElementRef<HTMLElement>;
  private readonly api = inject(BookApiClient);
  private readonly dialogs = inject(BookDialogService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly zone = inject(NgZone);
  private renderer?: LibraryRenderer;
  private selectedIsbn?: string;
  private currentRequest?: Subscription;

  readonly books = signal<Book[]>([]);
  readonly query = signal('');
  readonly selected = signal<Book | undefined>(undefined);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly graphicsError = signal(false);
  readonly reducedMotion = signal(false);
  readonly lowQuality = signal(false);
  readonly searchResults = signal<Book[]>([]);
  readonly inspecting = signal(false);

  ngAfterViewInit(): void {
    this.dialogs.changes.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.reloadAfterDialog());
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.currentRequest?.unsubscribe();
    this.currentRequest = this.api
      .getAllBooks()
      .pipe(timeout(15_000), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: books => {
          this.books.set(books);
          if (this.selectedIsbn && !books.some(book => book.isbn === this.selectedIsbn)) {
            this.selectedIsbn = undefined;
            this.selected.set(undefined);
          }
          this.searchResults.set(searchLibrary(books, this.query()));
          this.loading.set(false);
          this.createScene();
        },
        error: () => {
          this.renderer?.dispose();
          this.renderer = undefined;
          this.sceneHost.nativeElement.replaceChildren();
          this.books.set([]);
          this.searchResults.set([]);
          this.selected.set(undefined);
          this.inspecting.set(false);
          this.loading.set(false);
          this.error.set('Die Sammlung ist gerade nicht erreichbar. Bitte erneut versuchen.');
        }
      });
  }

  search(value: string): void {
    this.query.set(value);
    this.searchResults.set(searchLibrary(this.books(), value));
    this.renderer?.setSearchMatches(new Set(this.searchResults().map(book => book.isbn)));
  }

  choose(book: Book): boolean {
    if (this.renderer) return this.renderer.select(book.isbn);
    this.selectedIsbn = book.isbn;
    this.selected.set(book);
    return true;
  }

  inspectBook(): void {
    this.renderer?.inspect();
  }

  returnBook(): void {
    this.renderer?.returnBook();
    this.inspecting.set(false);
  }

  rotate(horizontal: number, vertical = 0): void {
    this.renderer?.rotate(horizontal, vertical);
  }

  zoom(amount: number): void {
    this.renderer?.zoom(amount);
  }

  resetView(): void {
    this.renderer?.reset();
  }

  enablePointerLock(): void {
    this.renderer?.requestPointerLock();
  }

  setLowQuality(): void {
    this.lowQuality.update(value => !value);
    this.renderer?.setLowQuality(this.lowQuality());
  }

  openDetails(): void {
    if (this.selected()) this.dialogs.openDetails(this.selected()!.isbn);
  }

  private reloadAfterDialog(): void {
    this.renderer?.returnBook();
    this.inspecting.set(false);
    this.renderer?.reset();
    this.load();
  }

  private createScene(): void {
    this.renderer?.dispose();
    this.inspecting.set(false);
    this.renderer = undefined;
    this.graphicsError.set(false);
    if (!this.books().length) return;
    this.zone.runOutsideAngular(() => {
      try {
        const media = window.matchMedia('(prefers-reduced-motion: reduce)');
        this.reducedMotion.set(media.matches);
        const renderer = new LibraryRenderer(this.sceneHost.nativeElement, createLibraryLayout(this.books()), {
          reducedMotion: media.matches,
          lowQuality: this.lowQuality(),
          onSelect: isbn =>
            this.zone.run(() => {
              this.selectedIsbn = isbn;
              this.selected.set(this.books().find(book => book.isbn === isbn));
            }),
          onFailure: () => this.zone.run(() => this.graphicsError.set(true)),
          onInspectChange: inspecting => this.zone.run(() => this.inspecting.set(inspecting))
        });
        this.renderer = renderer;
        renderer.setSearchMatches(new Set(this.searchResults().map(book => book.isbn)));
        if (this.selectedIsbn) renderer.select(this.selectedIsbn);
      } catch {
        this.sceneHost.nativeElement.replaceChildren();
        this.zone.run(() => this.graphicsError.set(true));
      }
    });
  }

  ngOnDestroy(): void {
    this.renderer?.dispose();
  }
}
