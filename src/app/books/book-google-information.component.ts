import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { GoogleBooksApiClient } from './google-books-api-client.service';
import { GoogleBooksInformation } from './google-books-information';

type InformationState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ready'; information: GoogleBooksInformation | null };

@Component({
  selector: 'app-book-google-information',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule],
  templateUrl: './book-google-information.component.html',
  styles: ':host { display: block; min-width: 0; }'
})
export class BookGoogleInformationComponent {
  readonly isbn = input.required<string>();
  readonly state = signal<InformationState>({ kind: 'loading' });
  private readonly api = inject(GoogleBooksApiClient);
  private readonly attempt = signal(0);

  constructor() {
    effect(onCleanup => {
      const isbn = this.isbn();
      this.attempt();
      this.state.set({ kind: 'loading' });
      const request = this.api.getByIsbn(isbn).subscribe({
        next: information => this.state.set({ kind: 'ready', information }),
        error: () => this.state.set({ kind: 'error' })
      });
      onCleanup(() => request.unsubscribe());
    });
  }

  retry(): void {
    this.attempt.update(attempt => attempt + 1);
  }
}
