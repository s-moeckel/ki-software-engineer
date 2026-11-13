import { CdkDragDrop, DragDropModule } from '@angular/cdk/drag-drop';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  Injector,
  OnInit,
  signal
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { Subscription } from 'rxjs';
import { BookDialogService } from '../books/book-dialog.service';
import { BoardAction, applyBoardAction, ReadingEntry, readingColumns, ReadingStatus } from './reading-list';
import { ReadingListApiClient } from './reading-list-api-client.service';

@Component({
  selector: 'app-reading-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DragDropModule, MatButtonModule],
  templateUrl: './reading-list.component.html',
  styleUrl: './reading-list.component.css'
})
export class ReadingListComponent implements OnInit {
  readonly entries = signal<ReadingEntry[]>([]);
  readonly columns = computed(() =>
    readingColumns.map(column => ({ ...column, entries: this.entries().filter(e => e.status === column.status) }))
  );
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly blocked = signal(false);
  readonly error = signal('');
  readonly announcement = signal('');
  readonly disabled = computed(() => this.loading() || this.saving() || this.blocked());
  readonly retryAction = signal<BoardAction | null>(null);
  private readonly api = inject(ReadingListApiClient);
  private readonly dialogs = inject(BookDialogService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private loadRequest?: Subscription;
  private refreshPending = false;

  ngOnInit(): void {
    this.dialogs.changes.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      if (this.saving()) this.refreshPending = true;
      else this.load();
    });
    this.load();
  }

  load(): void {
    if (this.saving()) return;
    this.loadRequest?.unsubscribe();
    this.loading.set(true);
    this.error.set('');
    this.retryAction.set(null);
    this.loadRequest = this.api
      .getEntries()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: entries => {
          this.entries.set(entries);
          this.loading.set(false);
          this.blocked.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.blocked.set(true);
          this.error.set('Leseliste konnte nicht geladen werden. Bitte erneut laden.');
        }
      });
  }

  drop(event: CdkDragDrop<ReadingStatus, ReadingStatus, ReadingEntry>): void {
    if (event.previousContainer === event.container && event.previousIndex === event.currentIndex) return;
    this.change({ isbn: event.item.data.isbn, status: event.container.data, position: event.currentIndex });
  }

  setStatus(entry: ReadingEntry, event: Event): void {
    const status = (event.target as HTMLSelectElement).value as ReadingStatus;
    if (!readingColumns.some(c => c.status === status) || status === entry.status) return;
    this.change({ isbn: entry.isbn, status, position: this.entries().filter(e => e.status === status).length });
  }

  reorder(entry: ReadingEntry, delta: number): void {
    const position = entry.position + delta;
    if (position < 0 || position >= this.entries().filter(e => e.status === entry.status).length) return;
    this.change({ isbn: entry.isbn, status: entry.status, position });
  }

  remove(entry: ReadingEntry): void {
    this.change({ isbn: entry.isbn, remove: true });
  }
  openDetails(entry: ReadingEntry): void {
    this.dialogs.openDetails(entry.isbn);
  }
  retry(): void {
    const action = this.retryAction();
    if (action) this.change(action);
  }

  change(action: BoardAction): void {
    if (this.disabled()) return;
    const restoreFocus = this.host.nativeElement.contains(this.host.nativeElement.ownerDocument.activeElement);
    const before = this.entries();
    this.entries.set(applyBoardAction(before, action));
    this.saving.set(true);
    this.error.set('');
    this.retryAction.set(null);
    this.announcement.set('Änderung wird gespeichert…');
    this.api
      .change(action)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(result => {
        if (result.kind === 'reconciling') {
          this.entries.set(before);
          this.error.set('Speicherergebnis unklar. Serverstand wird geladen.');
          return;
        }
        this.saving.set(false);
        if (result.kind === 'saved' || result.kind === 'reconciled') {
          this.entries.set(result.entries);
          this.announcement.set(result.kind === 'saved' ? 'Leseliste gespeichert.' : 'Serverstand abgeglichen.');
          this.error.set(
            result.kind === 'reconciled'
              ? 'Speicherergebnis war unklar. Aktueller Serverstand wurde geladen. Bitte prüfe die Leseliste.'
              : ''
          );
        } else {
          this.entries.set(before);
          this.blocked.set(result.kind === 'unknown');
          this.retryAction.set(result.kind === 'rejected' ? action : null);
          this.error.set(
            result.kind === 'unknown'
              ? 'Serverstand konnte nicht geladen werden. Vor weiteren Änderungen bitte erneut laden.'
              : 'Änderung konnte nicht gespeichert werden. Der vorherige Stand wurde wiederhergestellt.'
          );
          this.announcement.set('Änderung zurückgenommen.');
        }
        if (this.refreshPending) {
          this.refreshPending = false;
          this.load();
        }
        if (restoreFocus) this.restoreFocus(action.isbn);
      });
  }

  private restoreFocus(isbn: string): void {
    afterNextRender(
      () => {
        const host = this.host.nativeElement;
        const active = host.ownerDocument.activeElement;
        // Do not take focus back from navigation or an open details dialog.
        if (active !== host.ownerDocument.body && !host.contains(active)) return;
        const card = [...host.querySelectorAll<HTMLElement>('[data-isbn]')].find(
          element => element.dataset['isbn'] === isbn
        );
        const target =
          card?.querySelector<HTMLSelectElement>('select:not(:disabled)') ?? host.querySelector<HTMLElement>('h1');
        target?.focus();
      },
      { injector: this.injector }
    );
  }
}
