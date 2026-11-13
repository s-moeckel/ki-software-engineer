import type { Locator, Page } from '@playwright/test';
import { BookDialogPage } from './book-dialog.page';

export class BookGoogleInformationPage extends BookDialogPage {
  readonly information: Locator;

  constructor(private readonly page: Page) {
    super(page);
    this.information = this.dialog.getByRole('region', { name: 'Informationen von Google Books', exact: true });
  }

  async open(title: string): Promise<void> {
    await this.page.getByRole('button', { name: `Details for ${title}`, exact: true }).click();
  }

  async retry(): Promise<void> {
    await this.information.getByRole('button', { name: 'Erneut versuchen', exact: true }).click();
  }
}
