import { expect, test } from '@playwright/test';
import { api, book } from './support/books';

test.use({
  deviceScaleFactor: 0.5,
  launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }
});

test('a stalled collection request times out and can be retried', async ({ page }) => {
  await page.clock.install();
  await page.route(/^https:\/\//, route => route.abort());
  let requests = 0;
  await page.route(api, route => {
    if (++requests > 1) return route.fulfill({ json: [book] });
    // Deliberately keep the first network request pending.
  });
  await page.goto('http://localhost:4200/library');
  await expect(page.getByRole('heading', { name: 'Bibliothek wird geladen' })).toBeVisible();
  await expect.poll(() => requests).toBe(1);
  await page.clock.fastForward(15_001);
  await expect(page.getByRole('heading', { name: 'Bibliothek nicht erreichbar' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Bibliothek wird geladen' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Erneut versuchen' }).click();
  await expect(page.getByLabel('3D-Bibliothek', { exact: true })).toBeVisible();
  expect(requests).toBe(2);
});

test('starting another inspection completes an in-flight return instead of stranding the first book', async ({
  page
}) => {
  const other = { ...book, id: 'other', isbn: '9780000000001', title: 'TypeScript guide' };
  await page.route(/^https:\/\//, route => route.abort());
  await page.route(api, route => route.fulfill({ json: [book, other] }));
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('http://localhost:4200/library');
  await expect(page.getByLabel('3D-Bibliothek', { exact: true })).toBeVisible();
  await page.evaluate(() => {
    const component = Reflect.get(window, 'ng').getComponent(document.querySelector('app-library'));
    const renderer = Reflect.get(component, 'renderer');
    renderer.camera.position.set(-2.965, 1.65, -1.3);
    renderer.camera.lookAt(renderer.books[0].home);
    component.choose(component.books()[0]);
    component.inspectBook();
  });
  await expect
    .poll(() =>
      page.evaluate(() => {
        const renderer = Reflect.get(
          Reflect.get(window, 'ng').getComponent(document.querySelector('app-library')),
          'renderer'
        );
        return renderer.books[0].group.position.distanceTo(renderer.camera.position);
      })
    )
    .toBeCloseTo(0.65, 2);
  // Execute the rapid sequence in one browser turn so the 260 ms return cannot finish naturally.
  const state = await page.evaluate(() => {
    const component = Reflect.get(window, 'ng').getComponent(document.querySelector('app-library'));
    const renderer = Reflect.get(component, 'renderer');
    component.returnBook();
    component.choose(component.books()[1]);
    const home = renderer.books[1].home;
    renderer.camera.position.set(home.x + 0.6, 1.65, -1.3);
    renderer.camera.lookAt(home);
    component.inspectBook();
    return {
      returnedDistance: renderer.books[0].group.position.distanceTo(renderer.books[0].home),
      returnedRotation: renderer.books[0].group.rotation.toArray().slice(0, 3),
      held: renderer.held?.book.isbn,
      selected: component.selected()?.isbn
    };
  });
  expect(state.held).toBe(other.isbn);
  expect(state.selected).toBe(other.isbn);
  expect(state.returnedDistance).toBe(0);
  expect(state.returnedRotation).toEqual([0, 0, 0]);
});

test('WebGL context loss stops frames, releases the scene and preserves HTML detail access', async ({ page }) => {
  await page.route(/^https:\/\//, route => route.abort());
  await page.route(api, route => route.fulfill({ json: [book] }));
  await page.route(`${api}/${book.isbn}`, route => route.fulfill({ json: book }));
  await page.goto('http://localhost:4200/library');
  await expect(page.getByLabel('3D-Bibliothek', { exact: true })).toBeVisible();
  const oldRenderer = await page.evaluateHandle(() => {
    const renderer = Reflect.get(
      Reflect.get(window, 'ng').getComponent(document.querySelector('app-library')),
      'renderer'
    );
    const frame = renderer.frame.bind(renderer);
    renderer.testFrames = 0;
    renderer.frame = (time: number) => {
      renderer.testFrames++;
      frame(time);
    };
    renderer.renderer.getContext().getExtension('WEBGL_lose_context').loseContext();
    return renderer;
  });
  await expect(page.getByRole('heading', { name: '3D-Ansicht nicht verfügbar' })).toBeVisible();
  await expect(page.getByLabel('3D-Bibliothek', { exact: true })).toHaveCount(0);
  const released = await oldRenderer.evaluate(renderer => ({
    disposed: renderer.disposed,
    frames: renderer.testFrames,
    listeners: renderer.disposables.length,
    geometries: renderer.renderer.info.memory.geometries,
    textures: renderer.renderer.info.memory.textures
  }));
  expect(released.disposed).toBe(true);
  expect(released.listeners).toBe(0);
  expect(released.geometries).toBe(0);
  expect(released.textures).toBe(0);
  await page.waitForTimeout(200);
  expect(await oldRenderer.evaluate(renderer => renderer.testFrames)).toBe(released.frames);
  await page
    .getByRole('complementary', { name: 'Bücherliste' })
    .getByRole('button', { name: 'Details öffnen' })
    .click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog').getByText(book.title, { exact: true })).toBeVisible();
  await oldRenderer.dispose();
});

test('a failed reload after saving removes stale scene and data until retry succeeds', async ({ page }) => {
  await page.route(/^https:\/\//, route => route.abort());
  const updated = { ...book, title: 'Saved library title' };
  let requests = 0;
  await page.route(api, route => {
    requests++;
    return requests === 2
      ? route.fulfill({ status: 500, json: {} })
      : route.fulfill({ json: [requests > 2 ? updated : book] });
  });
  await page.route(`${api}/${book.isbn}`, route =>
    route.fulfill({
      json: route.request().method() === 'PUT' ? updated : book
    })
  );
  await page.goto('http://localhost:4200/library');
  const canvas = page.getByLabel('3D-Bibliothek', { exact: true });
  await expect(canvas).toBeVisible();
  const oldRendererDisposed = await page.evaluateHandle(() => {
    const component = Reflect.get(window, 'ng').getComponent(document.querySelector('app-library'));
    return Reflect.get(component, 'renderer');
  });
  await page
    .getByRole('complementary', { name: 'Bücherliste' })
    .getByRole('button', { name: 'Details öffnen' })
    .click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Edit', exact: true }).click();
  await dialog.getByLabel('Title', { exact: true }).fill(updated.title);
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Bibliothek nicht erreichbar' })).toBeVisible();
  await expect(canvas).toHaveCount(0);
  await expect(page.getByRole('complementary', { name: 'Bücherliste' }).getByRole('button')).toHaveCount(0);
  await expect(page.getByRole('complementary', { name: 'Ausgewähltes Buch' })).toHaveCount(0);
  expect(await oldRendererDisposed.evaluate(renderer => Reflect.get(renderer, 'disposed'))).toBe(true);
  await oldRendererDisposed.dispose();
  await page.getByRole('button', { name: 'Erneut versuchen' }).click();
  await expect(canvas).toBeVisible();
  await expect(
    page.getByRole('complementary', { name: 'Bücherliste' }).getByRole('button', { name: new RegExp(updated.title) })
  ).toBeVisible();
  expect(requests).toBe(3);
});

test('reset restores position, rotation and FOV and returns the held book', async ({ page }) => {
  await page.route(/^https:\/\//, route => route.abort());
  await page.route(api, route => route.fulfill({ json: [book] }));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('http://localhost:4200/library');
  await expect(page.getByLabel('3D-Bibliothek', { exact: true })).toBeVisible();
  await page.evaluate(() => {
    const renderer = Reflect.get(
      Reflect.get(window, 'ng').getComponent(document.querySelector('app-library')),
      'renderer'
    );
    renderer.camera.position.set(-2.965, 1.65, -1.3);
    renderer.camera.lookAt(renderer.books[0].home);
    renderer.camera.updateMatrixWorld();
  });
  await page.getByRole('complementary', { name: 'Bücherliste' }).getByRole('button').first().click();
  const panel = page.getByRole('complementary', { name: 'Ausgewähltes Buch' });
  await panel.getByRole('button', { name: 'Buch betrachten' }).click();
  await panel.getByRole('button', { name: 'Vergrößern', exact: true }).click();
  const state = () =>
    page.evaluate(() => {
      const renderer = Reflect.get(
        Reflect.get(window, 'ng').getComponent(document.querySelector('app-library')),
        'renderer'
      );
      return {
        position: renderer.camera.position.toArray(),
        rotation: renderer.camera.rotation.toArray().slice(0, 3),
        fov: renderer.camera.fov,
        projection: renderer.camera.projectionMatrix.elements[5],
        bookDistance: renderer.books[0].group.position.distanceTo(renderer.books[0].home)
      };
    });
  expect((await state()).fov).toBe(60);
  await page.getByRole('button', { name: 'Ansicht zurücksetzen' }).click();
  const reset = await state();
  expect(reset.position).toEqual([0, 1.65, -3.6]);
  expect(reset.rotation).toEqual([-0.08, Math.PI, 0]);
  expect(reset.fov).toBe(65);
  expect(reset.projection).toBeCloseTo(1 / Math.tan((65 * Math.PI) / 360));
  expect(reset.bookDistance).toBe(0);
  await expect(panel.getByRole('button', { name: 'Zurück ins Regal' })).toHaveCount(0);
});

for (const reducedMotion of ['reduce', 'no-preference'] as const) {
  test(`other book selections and details stay locked while inspecting and unlock after returning (${reducedMotion})`, async ({
    page
  }) => {
    const other = { ...book, id: 'other', isbn: '9780000000001', title: 'TypeScript guide' };
    await page.route(/^https:\/\//, route => route.abort());
    await page.route(api, route => route.fulfill({ json: [book, other] }));
    const detailRequests: string[] = [];
    await page.route(`${api}/*`, route => {
      detailRequests.push(route.request().url());
      return route.fulfill({ json: route.request().url().endsWith(other.isbn) ? other : book });
    });
    await page.emulateMedia({ reducedMotion });
    await page.goto('http://localhost:4200/library');
    await expect(page.getByLabel('3D-Bibliothek', { exact: true })).toBeVisible();
    await page.evaluate(() => {
      const renderer = Reflect.get(
        Reflect.get(window, 'ng').getComponent(document.querySelector('app-library')),
        'renderer'
      );
      renderer.camera.position.set(-2.965, 1.65, -1.3);
      renderer.camera.lookAt(renderer.books[0].home);
      renderer.camera.updateMatrixWorld();
    });
    const list = page.getByRole('complementary', { name: 'Bücherliste' });
    await list.getByRole('button', { name: new RegExp(book.title) }).click();
    const panel = page.getByRole('complementary', { name: 'Ausgewähltes Buch' });
    await panel.getByRole('button', { name: 'Buch betrachten' }).click();
    const otherRow = page.locator('.library-result').filter({ hasText: other.title });
    await expect(otherRow.getByRole('button').first()).toBeDisabled();
    await expect(otherRow.getByRole('button', { name: 'Details öffnen' })).toBeDisabled();
    // Even a synthetic click must not bypass the renderer's held-book guard.
    await otherRow.getByRole('button').first().dispatchEvent('click');
    await otherRow.getByRole('button', { name: 'Details öffnen' }).dispatchEvent('click');
    await expect(panel.getByRole('heading', { name: book.title, exact: true })).toBeVisible();
    expect(detailRequests).toEqual([]);
    await panel.getByRole('button', { name: 'Details öffnen' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    expect(detailRequests).toEqual([`${api}/${book.isbn}`]);
    await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
    await panel.getByRole('button', { name: 'Zurück ins Regal' }).click();
    await expect(otherRow.getByRole('button').first()).toBeEnabled();
    await otherRow.getByRole('button').first().click();
    await expect
      .poll(() =>
        page.evaluate(() => {
          const renderer = Reflect.get(
            Reflect.get(window, 'ng').getComponent(document.querySelector('app-library')),
            'renderer'
          );
          return renderer.books[0].group.position.distanceTo(renderer.books[0].home);
        })
      )
      .toBeLessThan(0.001);
    await expect(panel.getByRole('heading', { name: other.title, exact: true })).toBeVisible();
  });
}
