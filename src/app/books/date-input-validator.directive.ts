import { Directive, ElementRef, forwardRef, inject } from '@angular/core';
import { NG_VALIDATORS, ValidationErrors, Validator } from '@angular/forms';

@Directive({
  selector: 'input[appDateInputValidator]',
  providers: [{ provide: NG_VALIDATORS, useExisting: forwardRef(() => DateInputValidatorDirective), multi: true }],
  host: { '(input)': 'onInput()' }
})
export class DateInputValidatorDirective implements Validator {
  private readonly element = inject<ElementRef<HTMLInputElement>>(ElementRef);
  private onChange: () => void = () => {};

  validate(): ValidationErrors | null {
    // A partly entered native date has value "", just like a deliberately empty optional field.
    return this.element.nativeElement.validity.badInput ? { publicationDate: true } : null;
  }

  registerOnValidatorChange(fn: () => void): void {
    this.onChange = fn;
  }

  onInput(): void {
    this.onChange();
  }
}
