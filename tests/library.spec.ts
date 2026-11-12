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

  await page.getByRole('button', { name: 'Ansicht zurücksetzen' }).click();
  const reset = await cameraState(page);
  await page.mouse.move(x, y);
  await page.mouse.down({ button: 'right' });
  await expect.poll(async () => cameraState(page)).not.toEqual(reset);
  await page.keyboard.press('Escape');
  const escaped = await cameraState(page);
  await page.waitForTimeout(200);
  expect(await cameraState(page)).toEqual(escaped);
  await page.mouse.up({ button: 'right' });

  await page.getByRole('button', { name: 'Ansicht zurücksetzen' }).click();
  const beforeBlur = await cameraState(page);
  await page.mouse.move(x, y);
  await page.mouse.down({ button: 'right' });
  await expect.poll(async () => cameraState(page)).not.toEqual(beforeBlur);
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
    const first = renderer.books[0];
    renderer.camera.position.set(
      first.home.x - Math.sin(first.homeRotation.y) * 1.1,
      1.65,
      first.home.z - Math.cos(first.homeRotation.y) * 1.1
    );
    renderer.camera.lookAt(renderer.books[0].home);
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
    { x: 0, z: 0.2, limit: 0.53 },
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
    await expect(async () => {
      const stopped = await cameraState(page);
      expect(stopped.z).toBeLessThanOrEqual(position.limit);
      expect(stopped.y).toBe(1.65);
      await page.waitForTimeout(200);
      expect(await cameraState(page)).toEqual(stopped);
    }).toPass({ timeout: 10_000 });
    await page.mouse.up({ button: 'right' });
  }
});

test('clicking a reachable book takes it out and Escape restores book and controls', async ({ page }) => {
  await page.route(`${api}*`, route => route.fulfill({ json: [book] }));
  await page.setViewportSize({ width: 1000, height: 800 });
  await page.goto('http://localhost:4200/library');
  const canvas = page.getByLabel('3D-Bibliothek', { exact: true });
  await expect(canvas).toBeVisible();
  await page.evaluate(() => {
    const renderer = Reflect.get(
      Reflect.get(window, 'ng').getComponent(document.querySelector('app-library')),
      'renderer'
    );
    const first = renderer.books[0];
    renderer.camera.position.set(
      first.home.x - Math.sin(first.homeRotation.y) * 1.1,
      1.65,
      first.home.z - Math.cos(first.homeRotation.y) * 1.1
    );
    renderer.camera.lookAt(renderer.books[0].home);
    renderer.camera.updateMatrixWorld();
  });
  const bounds = (await canvas.boundingBox())!;
  await canvas.click({ position: { x: bounds.width / 2, y: bounds.height / 2 } });
  const panel = page.getByRole('complementary', { name: 'Ausgewähltes Buch' });
  await expect(panel.getByRole('button', { name: 'Zurück ins Regal' })).toBeVisible();
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
    .toBeGreaterThan(0.3);
  const camera = await cameraState(page);
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width / 2 + 40, bounds.y + bounds.height / 2 + 10);
  await page.mouse.up();
  expect(await cameraState(page)).toEqual(camera);
  await page.keyboard.press('Escape');
  await expect(panel.getByRole('button', { name: 'Zurück ins Regal' })).toHaveCount(0);
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
});

for (const reducedMotion of ['reduce', 'no-preference'] as const) {
  test(`clicking beside a held book returns it; book clicks, dragging and controls preserve it (${reducedMotion})`, async ({
    page
  }) => {
    await page.route(`${api}*`, route => route.fulfill({ json: [book] }));
    await page.setViewportSize({ width: 1000, height: 800 });
    await page.emulateMedia({ reducedMotion });
    await page.goto('http://localhost:4200/library');
    const canvas = page.getByLabel('3D-Bibliothek', { exact: true });
    await expect(canvas).toBeVisible();
    await page.evaluate(() => {
      const renderer = Reflect.get(
        Reflect.get(window, 'ng').getComponent(document.querySelector('app-library')),
        'renderer'
      );
      const first = renderer.books[0];
      renderer.camera.position.set(
        first.home.x - Math.sin(first.homeRotation.y) * 1.1,
        1.65,
        first.home.z - Math.cos(first.homeRotation.y) * 1.1
      );
      renderer.camera.lookAt(renderer.books[0].home);
      renderer.camera.updateMatrixWorld();
    });
    const bounds = (await canvas.boundingBox())!;
    const center = { x: bounds.width / 2, y: bounds.height / 2 };
    await canvas.click({ position: center });
    const panel = page.getByRole('complementary', { name: 'Ausgewähltes Buch' });
    const returnButton = panel.getByRole('button', { name: 'Zurück ins Regal' });
    await expect(returnButton).toBeVisible();
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

    await canvas.click({ position: center });
    await expect(returnButton).toBeVisible();
    await panel.getByRole('button', { name: 'Nach links drehen' }).click();
    await expect(returnButton).toBeVisible();
    // A drag starting beside the book is a rotation gesture, not an outside click.
    await page.mouse.move(bounds.x + bounds.width - 80, bounds.y + 25);
    await page.mouse.down();
    await page.mouse.move(bounds.x + bounds.width - 25, bounds.y + 25);
    await page.mouse.up();
    await expect(returnButton).toBeVisible();

    await canvas.click({ position: { x: bounds.width - 25, y: 25 } });
    await expect(returnButton).toHaveCount(0);
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
    await expect(panel.getByRole('heading', { name: book.title, exact: true })).toBeVisible();
  });
}

test('book actions fit without an internal scrollbar with long metadata on desktop and mobile', async ({
  page
}, testInfo) => {
  await page.route(`${api}*`, route =>
    route.fulfill({
      json: [
        {
          ...book,
          title: 'Learning Path: Learn Web Development with Python and modern application architecture',
          subtitle: 'A complete practical guide to building and maintaining accessible applications',
          author: 'Fabrizio Romano, Gaston C. Hillar, Arun Ravindran and additional contributing authors',
          publisher: 'Packt Publishing with a very long publisher name'
        }
      ]
    })
  );
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('http://localhost:4200/library');
  await expect(page.getByLabel('3D-Bibliothek', { exact: true })).toBeVisible();
  await page.evaluate(() => {
    const renderer = Reflect.get(
      Reflect.get(window, 'ng').getComponent(document.querySelector('app-library')),
      'renderer'
    );
    const first = renderer.books[0];
    renderer.camera.position.set(
      first.home.x - Math.sin(first.homeRotation.y) * 1.1,
      1.65,
      first.home.z - Math.cos(first.homeRotation.y) * 1.1
    );
    renderer.camera.lookAt(renderer.books[0].home);
    renderer.camera.updateMatrixWorld();
  });
  await page.getByRole('complementary', { name: 'Bücherliste' }).getByRole('button').first().click();
  const panel = page.getByRole('complementary', { name: 'Ausgewähltes Buch' });
  await panel.getByRole('button', { name: 'Buch betrachten' }).click();
  await expect(panel.getByRole('button', { name: 'Zurück ins Regal' })).toBeVisible();
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1000, height: 700 },
    { width: 390, height: 844 }
  ]) {
    await page.setViewportSize(viewport);
    await panel.scrollIntoViewIfNeeded();
    expect(
      await panel.evaluate(
        element => element.scrollHeight <= element.clientHeight + 1 && element.scrollWidth <= element.clientWidth + 1
      )
    ).toBe(true);
    const bounds = (await panel.boundingBox())!;
    for (const button of await panel.getByRole('button').all()) {
      const action = (await button.boundingBox())!;
      expect(action.y).toBeGreaterThanOrEqual(bounds.y);
      expect(action.y + action.height).toBeLessThanOrEqual(bounds.y + bounds.height);
      expect(action.height).toBeGreaterThanOrEqual(44);
    }
    await page.screenshot({ path: testInfo.outputPath(`book-panel-${viewport.width}.png`), fullPage: true });
  }
});

for (const interaction of ['canvas', 'HTML', 'keyboard'] as const) {
  test(`a visible part of a nearby book can be taken out even when a shelf board obscures its centre (${interaction})`, async ({
    page
  }) => {
    await page.route(`${api}*`, route => route.fulfill({ json: [book] }));
    await page.setViewportSize({ width: 1000, height: 800 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('http://localhost:4200/library');
    const canvas = page.getByLabel('3D-Bibliothek', { exact: true });
    await expect(canvas).toBeVisible();
    await page.evaluate(() => {
      const renderer = Reflect.get(
        Reflect.get(window, 'ng').getComponent(document.querySelector('app-library')),
        'renderer'
      );
      const home = renderer.books[0].home;
      const angle = renderer.books[0].homeRotation.y;
      renderer.camera.position.set(home.x - Math.sin(angle) * 1.1, 1.65, home.z - Math.cos(angle) * 1.1);
      renderer.camera.lookAt(home.x - Math.sin(angle) * 0.08, home.y - 0.09, home.z - Math.cos(angle) * 0.08);
      renderer.camera.updateMatrixWorld();
    });
    if (interaction === 'canvas') {
      const bounds = (await canvas.boundingBox())!;
      await canvas.click({ position: { x: bounds.width / 2, y: bounds.height / 2 } });
    } else {
      await page.getByRole('complementary', { name: 'Bücherliste' }).getByRole('button').first().click();
      if (interaction === 'HTML') {
        await page.getByRole('button', { name: 'Buch betrachten', exact: true }).click();
      } else {
        await page.keyboard.press('e');
      }
    }
    await expect(page.getByRole('button', { name: 'Zurück ins Regal', exact: true })).toBeVisible();
  });
}

test('distant and obstructed books cannot be taken out', async ({ page }) => {
  await page.route(`${api}*`, route => route.fulfill({ json: [book] }));
  await page.setViewportSize({ width: 1000, height: 800 });
  await page.goto('http://localhost:4200/library');
  const canvas = page.getByLabel('3D-Bibliothek', { exact: true });
  await expect(canvas).toBeVisible();
  await page.evaluate(() => {
    const renderer = Reflect.get(
      Reflect.get(window, 'ng').getComponent(document.querySelector('app-library')),
      'renderer'
    );
    const home = renderer.books[0].home;
    const angle = renderer.books[0].homeRotation.y;
    renderer.camera.position.set(home.x - Math.sin(angle) * 3, 1.65, home.z - Math.cos(angle) * 3);
    renderer.camera.lookAt(renderer.books[0].home);
    renderer.camera.updateMatrixWorld();
  });
  const bounds = (await canvas.boundingBox())!;
  await canvas.click({ position: { x: bounds.width / 2, y: bounds.height / 2 } });
  const panel = page.getByRole('complementary', { name: 'Ausgewähltes Buch' });
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Zurück ins Regal' })).toHaveCount(0);
  // The same reachable book viewed through the shelf back must still be blocked.
  await page.evaluate(() => {
    const renderer = Reflect.get(
      Reflect.get(window, 'ng').getComponent(document.querySelector('app-library')),
      'renderer'
    );
    const home = renderer.books[0].home;
    const angle = renderer.books[0].homeRotation.y;
    renderer.camera.position.set(home.x + Math.sin(angle) * 0.6, home.y, home.z + Math.cos(angle) * 0.6);
    renderer.camera.lookAt(renderer.books[0].home);
    renderer.camera.updateMatrixWorld();
  });
  await panel.getByRole('button', { name: 'Buch betrachten' }).click();
  await expect(panel.getByRole('button', { name: 'Zurück ins Regal' })).toHaveCount(0);
  expect(
    await page.evaluate(() => {
      const renderer = Reflect.get(
        Reflect.get(window, 'ng').getComponent(document.querySelector('app-library')),
        'renderer'
      );
      return renderer.books[0].group.position.distanceTo(renderer.books[0].home);
    })
  ).toBe(0);
});

test('search greys out nonmatches, leaves positions unchanged and restores covers on clear', async ({
  page
}, testInfo) => {
  await page.route(`${api}*`, route =>
    route.fulfill({ json: [book, { ...book, id: 'other', isbn: 'other', title: 'TypeScript guide' }] })
  );
  await page.setViewportSize({ width: 1000, height: 800 });
  await page.goto('http://localhost:4200/library');
  await expect(page.getByLabel('3D-Bibliothek', { exact: true })).toBeVisible();
  const appearance = () =>
    page.evaluate(() => {
      const renderer = Reflect.get(
        Reflect.get(window, 'ng').getComponent(document.querySelector('app-library')),
        'renderer'
      );
      return renderer.books.map(
        (item: {
          book: { isbn: string };
          group: { position: { toArray(): number[] }; scale: { toArray(): number[] } };
          body: { material: unknown };
        }) => ({
          isbn: item.book.isbn,
          position: item.group.position.toArray(),
          scale: item.group.scale.toArray(),
          muted: !Array.isArray(item.body.material)
        })
      );
    });
  const initial = await appearance();
  const search = page.getByRole('searchbox', { name: 'Bibliothek durchsuchen' });
  await search.fill('Angular');
  // Search affects the sorted shelf books and their interactive display copies.
  await expect
    .poll(async () => (await appearance()).map((item: { muted: boolean }) => item.muted))
    .toEqual([false, true, false, true]);
  expect(
    (await appearance()).map((item: { position: number[]; scale: number[] }) => [item.position, item.scale])
  ).toEqual(initial.map((item: { position: number[]; scale: number[] }) => [item.position, item.scale]));
  await page.screenshot({ path: testInfo.outputPath('library-search-muted.png') });
  await search.fill('no matching book');
  await expect.poll(async () => (await appearance()).every((item: { muted: boolean }) => item.muted)).toBe(true);
  await search.fill('');
  await expect.poll(appearance).toEqual(initial);
  await search.fill('   ');
  await expect.poll(appearance).toEqual(initial);
});
