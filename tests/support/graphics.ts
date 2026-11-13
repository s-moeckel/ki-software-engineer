import type { Page } from '@playwright/test';

// Observe actual browser frame opportunities rather than waiting a fixed wall-clock duration.
export async function waitForAnimationFrames(page: Page, count = 12): Promise<void> {
  await page.evaluate(
    frames =>
      new Promise<void>(resolve => {
        const next = () => {
          if (--frames <= 0) resolve();
          else requestAnimationFrame(next);
        };
        requestAnimationFrame(next);
      }),
    count
  );
}

export async function disableWebGL(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, context: string, ...args: unknown[]) {
      if (context.startsWith('webgl')) return null;
      return Reflect.apply(original, this, [context, ...args]);
    } as typeof original;
    // Test-owned browser environment control; no application hooks are involved.
    Reflect.set(window, '__restoreTestWebGL', () => {
      HTMLCanvasElement.prototype.getContext = original;
    });
  });
}
