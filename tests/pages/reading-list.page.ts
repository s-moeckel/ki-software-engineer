import type { Locator, Page } from '@playwright/test';
import type { ReadingStatus } from '../../src/app/reading-list/reading-list';

export class ReadingListPage {
  constructor(private readonly page: Page) {}

  card(title: string): Locator {
    return this.page.getByRole('article', { name: title, exact: true });
  }

  column(name: string): Locator {
    return this.page.getByRole('region', { name, exact: true });
  }

  async setStatus(title: string, status: ReadingStatus): Promise<void> {
    await this.card(title).getByRole('combobox', { name: 'Lesestatus' }).selectOption(status);
  }
}
