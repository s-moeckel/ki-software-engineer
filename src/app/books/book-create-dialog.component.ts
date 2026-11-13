import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { timeout, TimeoutError } from 'rxjs';
import { Book } from './book';
import { BookApiClient } from './book-api-client.service';

@Component({
  selector: 'app-book-create-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, MatButtonModule, MatDialogModule, MatFormFieldModule, MatInputModule],
  templateUrl: './book-create-dialog.component.html',
  styles: `
    :host {
      display: block;
      min-width: 0;
    }
    mat-form-field {
      width: 100%;
    }
  `
})
export class BookCreateDialogComponent {
  private readonly api = inject(BookApiClient);
  private readonly destroyRef = inject(DestroyRef);
  readonly dialogRef = inject(MatDialogRef<BookCreateDialogComponent, Book>);
  readonly state = signal<'editing' | 'saving' | 'uncertain'>('editing');
  readonly saveError = signal('');
  saveUnconfirmed = false;

  readonly form = new FormGroup({
    isbn: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.pattern(/\S/)] }),
    title: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.pattern(/\S/)] }),
    author: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.pattern(/\S/)] }),
    numPages: new FormControl<number | null>(null, [
      Validators.required,
      control =>
        Number.isInteger(control.value) && control.value > 0 && control.value <= 2_147_483_647
          ? null
          : { positiveInteger: true }
    ]),
    subtitle: new FormControl('', { nonNullable: true }),
    publisher: new FormControl('', { nonNullable: true }),
    price: new FormControl('', { nonNullable: true }),
    cover: new FormControl('', { nonNullable: true }),
    abstract: new FormControl('', { nonNullable: true })
  });

  save(): void {
    if (this.state() === 'saving') return;
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const draft = this.form.getRawValue();
    this.state.set('saving');
    this.saveError.set('');
    this.dialogRef.disableClose = true;
    this.form.disable();
    this.api
      .createBook({ ...draft, isbn: draft.isbn.trim(), numPages: draft.numPages! })
      .pipe(timeout(15_000), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: book => this.dialogRef.close(book),
        error: (error: unknown) => {
          this.dialogRef.disableClose = false;
          if (error instanceof TimeoutError || (error instanceof HttpErrorResponse && error.status === 0)) {
            this.saveUnconfirmed = true;
            this.state.set('uncertain');
            this.saveError.set(
              'Das Speicherergebnis ist unbekannt. Der Server könnte das Buch bereits angelegt haben. Ihr Entwurf bleibt erhalten. Sie können schließen und die Sammlung prüfen oder mit derselben ISBN erneut versuchen; ein Duplikat wird verhindert.'
            );
            return;
          }
          this.form.enable();
          this.state.set('editing');
          if (error instanceof HttpErrorResponse && error.status === 409) {
            this.form.controls.isbn.setErrors({ duplicate: true });
            this.saveError.set('Diese ISBN ist bereits vorhanden. Bitte prüfen Sie die Sammlung.');
          } else {
            this.saveError.set('Das Buch konnte nicht angelegt werden. Bitte versuchen Sie es erneut.');
          }
        }
      });
  }
}
