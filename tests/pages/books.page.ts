import type { Locator, Page } from '@playwright/test';

export class BooksPage {
  readonly searchInput: Locator;
  readonly clearButton: Locator;
  readonly retryButton: Locator;
  readonly loading: Locator;
  readonly error: Locator;
  readonly emptySearch: Locator;
  readonly emptyList: Locator;

  constructor(private readonly page: Page) {
    this.searchInput = page.getByRole('textbox', { name: 'Search for books', exact: true });
    this.clearButton = page.getByRole('button', { name: 'Clear search', exact: true });
    this.error = page.getByRole('alert').filter({ hasText: 'Could not load books.' });
    this.retryButton = this.error.getByRole('button', { name: 'Retry', exact: true });
    this.loading = page.getByText('Loading books...', { exact: true });
    this.emptySearch = page.getByText('No books match your search', { exact: true });
    this.emptyList = page.getByText('No books available', { exact: true });
  }

  bookTitle(title: string): Locator {
    return this.page.getByRole('heading', { name: title, exact: true });
  }

  async search(query: string): Promise<void> {
    await this.searchInput.fill(query);
  }

  async clearSearch(): Promise<void> {
    await this.clearButton.click();
  }

  async retry(): Promise<void> {
    await this.retryButton.click();
  }
}
