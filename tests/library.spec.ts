import { expect, Page, test } from '@playwright/test';
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

// Read the actual camera through Angular's development debug API; no production test hooks.
async function cameraState(page: Page): Promise<{ x: number; y: number; z: number; fov: number }> {
  return page.evaluate(() => {
    const component = Reflect.get(window, 'ng').getComponent(document.querySelector('app-library'));
    const camera = Reflect.get(component, 'renderer').camera;
    return { x: camera.position.x, y: camera.position.y, z: camera.position.z, fov: camera.fov };
  });
}

test('right mouse walks, release outside the scene, Escape and blur stop movement', async ({ page }) => {
  await page.route(`${api}*`, route => route.fulfill({ json: [book] }));
  await page.setViewportSize({ width: 1000, height: 800 });
  await page.goto('http://localhost:4200/library');
  const canvas = page.getByLabel('3D-Bibliothek', { exact: true });
  await expect(canvas).toBeVisible();
  const bounds = (await canvas.boundingBox())!;
  const x = bounds.x + bounds.width / 2;
  const y = bounds.y + bounds.height / 2;
  await page.mouse.move(x, y);
  const initial = await cameraState(page);
  await page.mouse.down({ button: 'right' });
  await expect.poll(async () => (await cameraState(page)).z).toBeGreaterThan(initial.z + 0.1);
  await expect(page.getByRole('complementary', { name: 'Ausgewähltes Buch' })).toHaveCount(0);

  // Pointer capture must deliver the release even over the HTML sidebar.
  await page.mouse.move(bounds.x + bounds.width + 20, bounds.y + 20);
  await page.mouse.up({ button: 'right' });
  const stopped = await cameraState(page);
  await page.waitForTimeout(200);
  expect(await cameraState(page)).toEqual(stopped);

  await page.mouse.move(x, y);
  await page.mouse.down({ button: 'right' });
  await expect.poll(async () => cameraState(page)).not.toEqual(stopped);
  await page.keyboard.press('Escape');
  const escaped = await cameraState(page);
  await page.waitForTimeout(200);
  expect(await cameraState(page)).toEqual(escaped);
  await page.mouse.up({ button: 'right' });

  await page.mouse.down({ button: 'right' });
  await expect.poll(async () => cameraState(page)).not.toEqual(escaped);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  const blurred = await cameraState(page);
  await page.waitForTimeout(200);
  expect(await cameraState(page)).toEqual(blurred);
  await page.mouse.up({ button: 'right' });
});

test('mouse wheel zooms only a held book and right mouse cannot walk while inspecting', async ({ page }) => {
  await page.route(`${api}*`, route => route.fulfill({ json: [book] }));
  await page.setViewportSize({ width: 1000, height: 800 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('http://localhost:4200/library');
  const canvas = page.getByLabel('3D-Bibliothek', { exact: true });
  await expect(canvas).toBeVisible();
  const initial = await cameraState(page);
  await canvas.dispatchEvent('wheel', { deltaY: -100 });
  expect(await cameraState(page)).toEqual(initial);

  // Arrange a reachable camera position; interaction below uses the real HTML and pointer events.
  await page.evaluate(() => {
    const component = Reflect.get(window, 'ng').getComponent(document.querySelector('app-library'));
    const renderer = Reflect.get(component, 'renderer');
    renderer.camera.position.set(-2.965, 1.65, -1.1);
    renderer.camera.lookAt(-2.965, 0.57, -0.12);
  });
  await page
    .getByRole('complementary', { name: 'Bücherliste' })
    .getByRole('button', { name: `${book.title} ${book.author}` })
    .click();
  const selected = page.getByRole('complementary', { name: 'Ausgewähltes Buch' });
  await selected.getByRole('button', { name: 'Buch betrachten' }).click();
  await expect(selected.getByRole('button', { name: 'Zurück ins Regal' })).toBeVisible();
  const held = await cameraState(page);
  const bounds = (await canvas.boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width - 30, bounds.y + 30);
  await page.mouse.down({ button: 'right' });
  await page.waitForTimeout(200);
  expect(await cameraState(page)).toEqual(held);
  await page.mouse.up({ button: 'right' });
  const scroll = await page.evaluate(() => window.scrollY);
  await page.mouse.wheel(0, -100);
  await expect.poll(async () => (await cameraState(page)).fov).toBe(held.fov - 5);
  expect(await page.evaluate(() => window.scrollY)).toBe(scroll);
  await page.mouse.wheel(0, 100);
  await expect.poll(async () => (await cameraState(page)).fov).toBe(held.fov);
  await selected.getByRole('button', { name: 'Vergrößern' }).click();
  expect((await cameraState(page)).fov).toBe(held.fov - 5);
  await selected.getByRole('button', { name: 'Verkleinern' }).click();
  expect((await cameraState(page)).fov).toBe(held.fov);
});

test('mouse movement respects shelf and wall collisions', async ({ page }) => {
  await page.route(`${api}*`, route => route.fulfill({ json: [book] }));
  await page.setViewportSize({ width: 1000, height: 800 });
  await page.goto('http://localhost:4200/library');
  const canvas = page.getByLabel('3D-Bibliothek', { exact: true });
  await expect(canvas).toBeVisible();
  const bounds = (await canvas.boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  for (const position of [
    { x: -2.3, z: -0.7, limit: -0.57 },
    { x: 0, z: 6.5, limit: 6.6 }
  ]) {
    await page.evaluate(({ x, z }) => {
      const component = Reflect.get(window, 'ng').getComponent(document.querySelector('app-library'));
      const camera = Reflect.get(component, 'renderer').camera;
      camera.position.set(x, 1.65, z);
      camera.rotation.set(0, Math.PI, 0);
    }, position);
    await page.mouse.down({ button: 'right' });
    await expect.poll(async () => (await cameraState(page)).z).toBeGreaterThan(position.z);
    await page.waitForTimeout(250);
    const stopped = await cameraState(page);
    expect(stopped.z).toBeLessThanOrEqual(position.limit);
    expect(stopped.y).toBe(1.65);
    await page.waitForTimeout(200);
    expect(await cameraState(page)).toEqual(stopped);
    await page.mouse.up({ button: 'right' });
  }
});
