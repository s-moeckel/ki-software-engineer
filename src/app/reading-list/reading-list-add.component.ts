import { ChangeDetectionStrategy, Component, DestroyRef, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { ReadingListApiClient } from './reading-list-api-client.service';

@Component({
  selector: 'app-reading-list-add',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule],
  template: `
    @if (added()) {
      <p role="status" class="mt-3">In der Leseliste</p>
    } @else {
      <button mat-stroked-button type="button" class="mt-3" (click)="blocked() ? reload() : add()" [disabled]="busy()">
        {{
          busy()
            ? 'Bitte warten…'
            : blocked()
              ? 'Serverstand erneut laden'
              : error()
                ? 'Erneut versuchen'
                : 'Zur Leseliste hinzufügen'
        }}
      </button>
    }
    @if (error()) {
      <p role="alert" class="mt-2 text-red-700 dark:text-red-300">{{ error() }}</p>
    }
  `
})
export class ReadingListAddComponent {
  readonly isbn = input.required<string>();
  readonly busy = signal(false);
  readonly added = signal(false);
  readonly blocked = signal(false);
  readonly error = signal('');
  private readonly api = inject(ReadingListApiClient);
  private readonly destroyRef = inject(DestroyRef);

  add(): void {
    if (this.busy() || this.blocked() || this.added()) return;
    this.busy.set(true);
    this.error.set('');
    this.api
      .add(this.isbn())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(result => {
        if (result.kind === 'reconciling') {
          this.error.set('Speicherergebnis unklar. Serverstand wird geladen.');
          return;
        }
        this.busy.set(false);
        if (result.kind === 'saved' || result.kind === 'reconciled') {
          this.added.set(result.entries.some(e => e.isbn === this.isbn()));
          this.error.set(
            this.added() ? '' : 'Nicht hinzugefügt. Serverstand wurde abgeglichen. Bitte erneut versuchen.'
          );
        } else {
          this.blocked.set(result.kind === 'unknown');
          this.error.set(
            result.kind === 'unknown'
              ? 'Serverstand konnte nicht geladen werden. Bitte vor dem nächsten Versuch erneut laden.'
              : 'Buch konnte nicht zur Leseliste hinzugefügt werden. Bitte erneut versuchen.'
          );
        }
      });
  }

  reload(): void {
    if (this.busy()) return;
    this.busy.set(true);
    this.api
      .getEntries()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: entries => {
          this.busy.set(false);
          this.blocked.set(false);
          this.added.set(entries.some(e => e.isbn === this.isbn()));
          this.error.set(
            this.added() ? '' : 'Nicht hinzugefügt. Serverstand wurde abgeglichen. Bitte erneut versuchen.'
          );
        },
        error: () => {
          this.busy.set(false);
          this.error.set('Serverstand konnte nicht geladen werden. Bitte erneut laden.');
        }
      });
  }
}
