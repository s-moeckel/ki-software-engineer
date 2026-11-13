import { AbstractControl, ValidationErrors } from '@angular/forms';

export function publicationDateValidator(control: AbstractControl): ValidationErrors | null {
  const value: unknown = control.value;
  if (value === '') return null;
  if (typeof value !== 'string' || !/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value)) {
    return { publicationDate: true };
  }
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
    ? null
    : { publicationDate: true };
}
