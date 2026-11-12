import { expect, test } from '@playwright/test';
import { api, book } from './support/books';

test.use({
  deviceScaleFactor: 0.5,
  launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }
});

for (const [title, isbn] of [
  ['Teufelsgold', '9783404177271'],
  ['Quest', '9783404209804'],
  ['Transport 9', '9783695710010']
]) {
  test(`the library displays the cached ${title} cover when inspecting the book`, async ({ page }) => {
    const covered = {
      ...book,
      isbn,
      title,
      cover: `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg?default=false`
    };
    const cached = `http://localhost:4730/covers?url=${encodeURIComponent(covered.cover)}`;
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.route(/^https:\/\//, route => route.abort());
    await page.route(api, route => route.fulfill({ json: [covered] }));
    await page.route('http://localhost:4730/covers?**', route => {
      expect(route.request().url()).toBe(cached);
      return route.fulfill({
        contentType: 'image/png',
        body: Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==',
          'base64'
        )
      });
    });
    await page.goto('http://localhost:4200/library');
    await expect(page.getByLabel('3D-Bibliothek', { exact: true })).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(() => {
          const component = Reflect.get(window, 'ng').getComponent(document.querySelector('app-library'));
          const renderer = Reflect.get(component, 'renderer');
          const image = renderer.books[0].materials[0].map?.image;
          return image instanceof HTMLImageElement ? { src: image.src, width: image.naturalWidth } : undefined;
        })
      )
      .toEqual({ src: cached, width: 1 });
    const state = await page.evaluate(() => {
      const component = Reflect.get(window, 'ng').getComponent(document.querySelector('app-library'));
      const renderer = Reflect.get(component, 'renderer');
      const first = renderer.books[0];
      renderer.camera.position.set(
        first.home.x - Math.sin(first.homeRotation.y) * 1.1,
        1.65,
        first.home.z - Math.cos(first.homeRotation.y) * 1.1
      );
      renderer.camera.lookAt(renderer.books[0].home);
      component.choose(component.books()[0]);
      component.inspectBook();
      return {
        isbn: renderer.held?.book.isbn,
        src: renderer.held?.materials[0].map?.image.src
      };
    });
    expect(state).toEqual({ isbn: covered.isbn, src: cached });
  });
}
