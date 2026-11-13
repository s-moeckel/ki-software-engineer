import { expect, Page, test } from '@playwright/test';
import { api, book } from './support/books';

const views = [
  { path: '/library', name: 'Virtual Library öffnen', text: 'Library' },
  { path: '/universe', name: 'BookMonkey Universe öffnen', text: 'Universe' },
  { path: '/', name: 'Listenansicht öffnen', text: 'Listenansicht' }
];

async function expectActiveView(page: Page, path: string) {
  const navigation = page.getByRole('navigation', { name: 'Hauptnavigation' });
  await expect(navigation.locator('[aria-current="page"]')).toHaveCount(1);
  for (const view of views) {
    const link = navigation.getByRole('link', { name: view.name, exact: true });
    await expect(link).toHaveAttribute('href', view.path);
    await expect(link.locator('span:not([aria-hidden])')).toHaveText(view.text);
    if (view.path === path) {
      await expect(link).toHaveAttribute('aria-current', 'page');
      await expect(link).toHaveCSS('font-weight', '700');
      await expect(link).toHaveCSS('text-decoration-line', 'underline');
      const inactive = navigation.locator('a:not([aria-current])').first();
      expect(await link.evaluate(element => getComputedStyle(element).backgroundColor)).not.toBe(
        await inactive.evaluate(element => getComputedStyle(element).backgroundColor)
      );
    } else {
      await expect(link).not.toHaveAttribute('aria-current');
    }
  }
}

test.beforeEach(async ({ page }) => {
  // Navigation and global actions also work without WebGL or external assets.
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (context: string, ...args: unknown[]) {
      if (context.startsWith('webgl')) return null;
      return Reflect.apply(original, this, [context, ...args]);
    } as typeof original;
  });
  await page.route(/^https:\/\//, route => route.abort());
  await page.route(`${api}*`, route => route.fulfill({ json: [book] }));
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

for (const mobile of [false, true]) {
  test.describe(mobile ? '320px header' : 'Desktop header', () => {
    test.use({ viewport: mobile ? { width: 320, height: 740 } : { width: 1280, height: 900 } });

    for (const start of views) {
      test(`direct entry at ${start.path}, all destinations, Home and global actions`, async ({ page }) => {
        await page.emulateMedia({ colorScheme: 'light' });
        await page.goto(`http://localhost:4200${start.path}?view=test#books`);
        await expectActiveView(page, start.path);
        const header = page.getByRole('banner');
        const nav = page.getByRole('navigation', { name: 'Hauptnavigation' });
        const home = header.getByRole('link', { name: 'BookMonkey', exact: true });
        await expect(home).toHaveAttribute('href', '/');
        await expect(header.locator('a, button')).toHaveCount(6);
        await expect(nav.locator('a > span:not([aria-hidden])')).toHaveText(views.map(view => view.text));
        await expect(header.locator('a, button').nth(4)).toHaveAccessibleName('Zufälliges Buch auswürfeln');
        const theme = header.getByRole('button', { name: /^Farbschema:/ });
        await expect(header.locator('a, button').nth(5)).toHaveAccessibleName(/^Farbschema:/);

        // Exercise both global actions from every directly opened view.
        for (const [current, next] of [
          ['System', 'Hell'],
          ['Hell', 'Dunkel'],
          ['Dunkel', 'System']
        ]) {
          await expect(theme).toHaveAccessibleName(new RegExp(`^Farbschema: ${current}\\.`));
          await theme.focus();
          await theme.press('Enter');
          await expect(theme).toHaveAccessibleName(new RegExp(`^Farbschema: ${next}\\.`));
          await expectActiveView(page, start.path);
          await expect(page.locator('html')).toHaveAttribute('data-theme', next === 'Dunkel' ? 'dark' : 'light');
        }
        const dice = header.getByRole('button', { name: 'Zufälliges Buch auswürfeln' });
        await dice.focus();
        await dice.press('Enter');
        const dialog = page.getByRole('dialog');
        await expect(dialog.getByRole('heading', { name: book.title, exact: true })).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(dialog).toBeHidden();
        await expect(dice).toBeFocused();

        // Every link has the same destination from every view, including itself.
        for (const source of views) {
          await nav.getByRole('link', { name: source.name, exact: true }).click();
          for (const target of views) {
            const link = nav.getByRole('link', { name: target.name, exact: true });
            await link.focus();
            await link.press('Enter');
            await expect(page).toHaveURL(`http://localhost:4200${target.path}`);
            await expectActiveView(page, target.path);
            expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
            await nav.getByRole('link', { name: source.name, exact: true }).click();
          }
          await home.focus();
          await home.press('Enter');
          await expect(page).toHaveURL('http://localhost:4200/');
          await expectActiveView(page, '/');
        }
        await nav.getByRole('link', { name: views[1].name }).click();
        await expectActiveView(page, '/universe');
        await page.goBack();
        await expectActiveView(page, '/');
        await page.goForward();
        await expectActiveView(page, '/universe');
      });
    }
  });
}
