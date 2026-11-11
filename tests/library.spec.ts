import { expect, test } from '@playwright/test';
import { api, book } from './support/books';

// Software WebGL keeps real rendering testable on CI; lower pixel density limits its CPU cost.
test.use({
  deviceScaleFactor: 0.5,
  launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }
});
test.setTimeout(120_000);

test.beforeEach(async ({ page }) => {
  await page.route(/^https:\/\//, route => route.abort());
  await page.route(`${api}*`, route =>
    route.fulfill({
      json: Array.from({ length: 250 }, (_, index) => ({
        ...book,
        id: `book-${index}`,
        isbn: `978${String(index).padStart(10, '0')}`,
        title: `${['Angular in practice', 'The art of programming', 'Designing interfaces', 'Modern TypeScript'][index % 4]} ${index + 1}`
      }))
    })
  );
});

test('scene fills its viewport and stays separate from navigation and results after resizing', async ({
  page
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('http://localhost:4200/library');
  const canvas = page.getByLabel('3D-Bibliothek', { exact: true });
  await expect(canvas).toBeVisible();
  await expect(page.getByRole('heading', { name: 'DEINE SAMMLUNG' })).toContainText('250 Bücher');
  await expect(page.getByRole('heading', { name: '3D-Ansicht nicht verfügbar' })).toHaveCount(0);

  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 1024, height: 768 },
    { width: 390, height: 844 }
  ]) {
    await page.setViewportSize(viewport);
    await expect
      .poll(
        async () => {
          return page.evaluate(() => {
            const host = document.querySelector('.library-scene')!.getBoundingClientRect();
            const surface = document.querySelector('.library-scene canvas')!.getBoundingClientRect();
            return Math.abs(host.width - surface.width) < 2 && Math.abs(host.height - surface.height) < 2;
          });
        },
        { timeout: 30_000 }
      )
      .toBe(true);
    const scene = (await canvas.boundingBox())!;
    const list = (await page.getByRole('complementary', { name: 'Bücherliste' }).boundingBox())!;
    const heading = (await page.locator('.library-heading').boundingBox())!;
    expect(scene.y).toBeGreaterThanOrEqual(heading.y + heading.height - 1);
    expect(scene.width).toBeGreaterThan(300);
    expect(scene.height).toBeGreaterThan(300);
    expect(list.x >= scene.x + scene.width - 1 || list.y >= scene.y + scene.height - 1).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`library-${viewport.width}.png`), fullPage: true });
  }
  expect(errors).toEqual([]);
});

test('search and book actions remain accessible on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('http://localhost:4200/library');
  const search = page.getByRole('searchbox', { name: 'Bibliothek durchsuchen' });
  await search.fill('Angular in practice 1');
  const list = page.getByRole('complementary', { name: 'Bücherliste' });
  await expect(list.getByRole('button', { name: 'Angular in practice 1 Jane Reader' })).toBeVisible();
  await list.getByRole('button', { name: 'Angular in practice 1 Jane Reader' }).click();
  const selected = page.getByRole('complementary', { name: 'Ausgewähltes Buch' });
  await expect(selected).toBeVisible();
  await expect(selected.getByRole('button', { name: 'Buch betrachten' })).toBeVisible();
  await expect(selected.getByRole('button', { name: 'Details öffnen' })).toBeVisible();
});
