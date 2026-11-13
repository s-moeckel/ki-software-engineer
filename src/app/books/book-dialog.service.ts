import { inject, Injectable } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Subject } from 'rxjs';
import { ToastService } from '../shared/toast.service';
import { Book } from './book';
import { BookDetailsDialogComponent } from './book-details-dialog.component';
import { BookCreateDialogComponent } from './book-create-dialog.component';

@Injectable({ providedIn: 'root' })
export class BookDialogService {
  private readonly dialog = inject(MatDialog);
  private readonly toast = inject(ToastService);
  private readonly changed = new Subject<void>();
  readonly changes = this.changed.asObservable();

  openCreate(): void {
    const ref = this.dialog.open<BookCreateDialogComponent, void, Book>(BookCreateDialogComponent, {
      width: '720px',
      maxWidth: '95vw',
      maxHeight: '90dvh',
      autoFocus: 'first-tabbable',
      restoreFocus: true
    });
    const form = ref.componentInstance;
    ref.afterClosed().subscribe(saved => {
      if (saved) this.toast.show('Buch erfolgreich angelegt.');
      if (saved || form.saveUnconfirmed) this.changed.next();
    });
  }

  openDetails(isbn: string): void {
    const ref = this.dialog.open<BookDetailsDialogComponent, { isbn: string }, Book>(BookDetailsDialogComponent, {
      data: { isbn },
      width: '720px',
      maxWidth: '95vw',
      maxHeight: '90dvh',
      autoFocus: 'first-heading',
      restoreFocus: true
    });
    const details = ref.componentInstance;
    ref.afterClosed().subscribe(saved => {
      if (saved) this.toast.show('Book updated successfully.');
      if (saved || details.saveUnconfirmed) this.changed.next();
    });
  }
}
