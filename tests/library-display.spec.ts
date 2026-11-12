import { expect, test } from '@playwright/test';
import { api, book } from './support/books';

test.use({
  deviceScaleFactor: 0.5,
  launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }
});

test('the collection stands along the walls and only four books occupy the central display', async ({
  page
}, testInfo) => {
  await page.route(/^https:\/\//, route => route.abort());
  await page.route(api, route =>
    route.fulfill({
      json: Array.from({ length: 250 }, (_, index) => ({
        ...book,
        id: String(index),
        isbn: `978${String(index).padStart(10, '0')}`,
        title: `Book ${index}`
      }))
    })
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('http://localhost:4200/library');
  await expect(page.getByLabel('3D-Bibliothek', { exact: true })).toBeVisible();
  const state = await page.evaluate(() => {
    const renderer = Reflect.get(
      Reflect.get(window, 'ng').getComponent(document.querySelector('app-library')),
      'renderer'
    );
    const wall = renderer.books.slice(0, 250);
    const display = renderer.books.slice(250);
    const cameraPosition = renderer.camera.position.clone();
    const cameraRotation = renderer.camera.rotation.clone();
    renderer.scene.updateMatrixWorld(true);
    const reachable = wall
      .filter((item: { home: { y: number } }) => item.home.y < 0.5)
      .every((item: { home: { x: number; z: number }; homeRotation: { y: number } }) => {
        renderer.camera.position.set(
          item.home.x - Math.sin(item.homeRotation.y) * 1.1,
          1.65,
          item.home.z - Math.cos(item.homeRotation.y) * 1.1
        );
        return renderer.canReach(item);
      });
    renderer.camera.position.copy(cameraPosition);
    renderer.camera.rotation.copy(cameraRotation);
    return {
      count: renderer.books.length,
      reachable,
      outside: wall.every((item: { home: { x: number; z: number } }) => Math.abs(item.home.x) > 3 || item.home.z > 4),
      featured: display.map((item: { book: { isbn: string } }) => item.book.isbn),
      expected: wall.slice(0, 4).map((item: { book: { isbn: string } }) => item.book.isbn),
      positions: display.map((item: { home: { toArray(): number[] } }) => item.home.toArray()),
      freestanding: renderer.roomObjects.some(
        (mesh: { geometry: { parameters: { width: number; height: number } } }) =>
          mesh.geometry.parameters.width === 1.65 && mesh.geometry.parameters.height === 1.9
      )
    };
  });
  expect(state.count).toBe(254);
  expect(state.outside).toBe(true);
  expect(state.reachable).toBe(true);
  expect(state.featured).toEqual(state.expected);
  expect(state.positions).toEqual([
    [-0.375, 1.12, 1.5],
    [0.375, 1.12, 1.5],
    [-0.375, 1.94, 1.5],
    [0.375, 1.94, 1.5]
  ]);
  expect(state.freestanding).toBe(false);
  await page.screenshot({ path: testInfo.outputPath('library-wall-shelves.png'), fullPage: true });
});

test('display books can be picked and returned to their original display orientation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route(/^https:\/\//, route => route.abort());
  await page.route(api, route => route.fulfill({ json: [book] }));
  await page.goto('http://localhost:4200/library');
  const canvas = page.getByLabel('3D-Bibliothek', { exact: true });
  await expect(canvas).toBeVisible();
  const target = await page.evaluate(() => {
    const component = Reflect.get(window, 'ng').getComponent(document.querySelector('app-library'));
    const renderer = Reflect.get(component, 'renderer');
    const display = renderer.books[1];
    renderer.camera.position.set(display.home.x, 1.65, 0.1);
    renderer.camera.lookAt(display.home);
    renderer.camera.updateMatrixWorld();
    const position = display.home.clone().project(renderer.camera);
    return { x: position.x, y: position.y };
  });
  const bounds = (await canvas.boundingBox())!;
  await canvas.click({ position: { x: ((target.x + 1) / 2) * bounds.width, y: ((1 - target.y) / 2) * bounds.height } });
  const panel = page.getByRole('complementary', { name: 'Ausgewähltes Buch' });
  await expect(panel.getByRole('button', { name: 'Zurück ins Regal' })).toBeVisible();
  await panel.getByRole('button', { name: 'Nach links drehen' }).click();
  await panel.getByRole('button', { name: 'Zurück ins Regal' }).click();
  const state = await page.evaluate(() => {
    const component = Reflect.get(window, 'ng').getComponent(document.querySelector('app-library'));
    const renderer = Reflect.get(component, 'renderer');
    const display = renderer.books[1];
    return {
      distance: display.group.position.distanceTo(display.home),
      rotationRestored: display.group.rotation.equals(display.homeRotation),
      count: component.books().length
    };
  });
  expect(state.distance).toBe(0);
  expect(state.rotationRestored).toBe(true);
  expect(state.count).toBe(1);
  // Clearing selection and search restores both shelf and display materials.
  await page.evaluate(() => {
    const renderer = Reflect.get(
      Reflect.get(window, 'ng').getComponent(document.querySelector('app-library')),
      'renderer'
    );
    renderer.setSelected(undefined);
  });
  await page.getByRole('searchbox').fill('no matching book');
  await page.getByRole('searchbox').fill('');
  expect(
    await page.evaluate(() => {
      const renderer = Reflect.get(
        Reflect.get(window, 'ng').getComponent(document.querySelector('app-library')),
        'renderer'
      );
      return renderer.books.every((item: { materials: { emissiveIntensity: number }[] }) =>
        item.materials.every(material => material.emissiveIntensity === 0)
      );
    })
  ).toBe(true);
});
