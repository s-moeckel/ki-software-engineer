import type { Locator, Page } from '@playwright/test';

export class BookDialogPage {
  readonly dialog: Locator;

  constructor(page: Page) {
    this.dialog = page.getByRole('dialog');
  }

  async fill(fields: Record<string, string>): Promise<void> {
    for (const [label, value] of Object.entries(fields)) {
      await this.dialog.getByLabel(label, { exact: true }).fill(value);
    }
  }

  async create(): Promise<void> {
    await this.dialog.getByRole('button', { name: 'Buch anlegen', exact: true }).click();
  }

  async edit(): Promise<void> {
    await this.dialog.getByRole('button', { name: 'Edit', exact: true }).click();
  }

  async save(): Promise<void> {
    await this.dialog.getByRole('button', { name: 'Save', exact: true }).click();
  }

  async close(): Promise<void> {
    await this.dialog.getByRole('button', { name: 'Close', exact: true }).click();
  }
}
