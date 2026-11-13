import type { Locator, Page } from '@playwright/test';

export class LibraryPage {
  readonly canvas: Locator;
  readonly searchInput: Locator;
  readonly list: Locator;
  readonly selectedBook: Locator;

  constructor(private readonly page: Page) {
    this.canvas = page.getByLabel('3D-Bibliothek', { exact: true });
    this.searchInput = page.getByRole('searchbox', { name: 'Bibliothek durchsuchen' });
    this.list = page.getByRole('complementary', { name: 'Bücherliste' });
    this.selectedBook = page.getByRole('complementary', { name: 'Ausgewähltes Buch' });
  }

  async search(query: string): Promise<void> {
    await this.searchInput.fill(query);
  }

  async selectBook(title: string): Promise<void> {
    await this.list
      .getByRole('button')
      .filter({ has: this.page.getByText(title, { exact: true }) })
      .click();
  }

  async openDetails(): Promise<void> {
    await this.selectedBook.getByRole('button', { name: 'Details öffnen', exact: true }).click();
  }
}
