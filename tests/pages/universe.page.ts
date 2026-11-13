import type { Locator, Page } from '@playwright/test';

export class UniversePage {
  readonly searchInput: Locator;
  readonly results: Locator;
  readonly selectedBook: Locator;
  readonly canvas: Locator;

  constructor(private readonly page: Page) {
    this.searchInput = page.getByRole('combobox', { name: 'Galaxie durchsuchen' });
    this.results = page.getByRole('listbox', { name: 'Suchtreffer' });
    this.selectedBook = page.getByRole('complementary', { name: 'Ausgewähltes Buch' });
    this.canvas = page.locator('app-book-universe canvas');
  }

  async search(query: string): Promise<void> {
    await this.searchInput.fill(query);
  }

  async openDetails(): Promise<void> {
    await this.selectedBook.getByRole('button', { name: 'Buchdetails öffnen ↗', exact: true }).click();
  }

  async retry(): Promise<void> {
    await this.page.getByRole('button', { name: 'Erneut versuchen', exact: true }).click();
  }
}
