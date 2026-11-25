// A tablet in landscape: the desktop layout, with an on-screen keyboard covering the bottom of the page.
import { expect, test, type Page } from '@playwright/test';

import { offline, OPEN_EDITOR } from './helpers';

const VISIBLE_HEIGHT = 420;

test.use({viewport: {width: 1180, height: 820}, hasTouch: true});

// Browsers in tests have no on-screen keyboard, so this shrinks the visual viewport as one would.
async function fakeKeyboard(page: Page) {
  await page.addInitScript(visible => {
    let height: number | null = null;
    const real = Object.getOwnPropertyDescriptor(VisualViewport.prototype, "height")!;
    Object.defineProperty(VisualViewport.prototype, "height", {
      get(this: VisualViewport) { return height ?? (real.get!.call(this) as number); },
    });
    (window as unknown as {keyboard(open: boolean): void}).keyboard = open => {
      height = open ? visible : null;
      window.visualViewport!.dispatchEvent(new Event("resize"));
    };
  }, VISIBLE_HEIGHT);
}

const keyboard = (page: Page, open: boolean) =>
  page.evaluate(o => (window as unknown as {keyboard(open: boolean): void}).keyboard(o), open);

async function bottom(page: Page, selector: string): Promise<number> {
  const box = (await page.locator(selector).boundingBox())!;
  return box.y + box.height;
}

test("with the keyboard up, the code or the bottom panel fills the space above it", async ({page, context}) => {
  const errors = await offline(context);
  await fakeKeyboard(page);
  await page.goto("./#new");
  await page.locator(OPEN_EDITOR).click();
  await keyboard(page, true);
  // Typing code: the editor takes the room, and the bottom panel makes way.
  await expect(page.locator(".bottomPanel")).toBeHidden();
  expect(await bottom(page, ".editorPane")).toBeLessThanOrEqual(VISIBLE_HEIGHT);
  expect(await bottom(page, ".editorPane")).toBeGreaterThan(VISIBLE_HEIGHT - 20);
  await keyboard(page, false);
  await expect(page.locator(".bottomPanel")).toBeVisible();

  // Typing a transition's time: the panel takes the room, and the code and canvas make way.
  await page.goto("./#example/f9ad362373e4");
  await page.locator(".timeArea .transition").first().click();
  await page.locator("#startTimeInput").focus();
  await keyboard(page, true);
  await expect(page.locator(".editorPane")).toBeHidden();
  await expect(page.locator("#startTimeInput")).toBeInViewport();
  expect(await bottom(page, ".bottomPanel")).toBeLessThanOrEqual(VISIBLE_HEIGHT);
  await keyboard(page, false);
  await expect(page.locator(".editorPane")).toBeVisible();
  expect(await bottom(page, ".bottomPanel")).toBeGreaterThan(VISIBLE_HEIGHT);
  expect(errors).toEqual([]);
});
