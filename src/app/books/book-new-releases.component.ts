import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  OnInit,
  signal,
  viewChild
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { Subscription, timeout } from 'rxjs';
import { ReadingListAddComponent } from '../reading-list/reading-list-add.component';
import { Book } from './book';
import { BookApiClient } from './book-api-client.service';
import { BookDialogService } from './book-dialog.service';
import { BookItemComponent } from './book-item.component';

@Component({
  selector: 'app-book-new-releases',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BookItemComponent, ReadingListAddComponent, MatButtonModule, DatePipe],
  templateUrl: './book-new-releases.component.html',
  styles: `
    :host {
      display: block;
      min-width: 0;
    }
  `
})
export class BookNewReleasesComponent implements OnInit {
  private readonly api = inject(BookApiClient);
  private readonly destroyRef = inject(DestroyRef);
  readonly dialogs = inject(BookDialogService);
  readonly books = signal<Book[]>([]);
  readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  readonly row = viewChild<ElementRef<HTMLElement>>('row');
  private request?: Subscription;

  ngOnInit(): void {
    this.dialogs.changes.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.load());
    this.load();
  }

  load(): void {
    this.request?.unsubscribe();
    this.state.set('loading');
    this.request = this.api
      .getNewReleases()
      .pipe(timeout(15_000), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: books => {
          this.books.set(books);
          this.state.set('ready');
        },
        error: () => this.state.set('error')
      });
  }

  scroll(direction: -1 | 1): void {
    const element = this.row()?.nativeElement;
    if (element) element.scrollBy({ left: direction * element.clientWidth, behavior: 'instant' });
  }

  onKey(event: KeyboardEvent): void {
    if (event.target !== event.currentTarget) return;
    const element = this.row()?.nativeElement;
    if (!element) return;
    switch (event.key) {
      case 'ArrowLeft':
        this.scroll(-1);
        break;
      case 'ArrowRight':
        this.scroll(1);
        break;
      case 'Home':
        element.scrollLeft = 0;
        break;
      case 'End':
        element.scrollLeft = element.scrollWidth;
        break;
      default:
        return;
    }
    event.preventDefault();
  }
}
