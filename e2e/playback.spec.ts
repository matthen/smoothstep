import { expect, test, type Page } from '@playwright/test';

import { offline } from './helpers';

// The frame counter (iFrame) shown in the canvas overlay.
async function frameIndex(page: Page): Promise<number> {
  return Number(await page.locator("#canvasContainer .fps p").last().textContent());
}

test("rebuilding restarts iFrame, so animations that set up on the first frames work", async ({page, context}) => {
  const errors = await offline(context);
  await page.goto("./#example/26d46785c1f6");
  await expect(page.locator("#titleInput")).not.toHaveValue("Untitled animation");
  await page.locator(".appHeader").click({position: {x: 4, y: 4}});
  await page.keyboard.press("Space");
  await expect.poll(() => frameIndex(page)).toBeGreaterThan(60);
  await page.locator(".cm-content").click();
  await page.keyboard.press("Shift+Enter");
  await expect.poll(() => frameIndex(page)).toBeLessThan(30);
  expect(errors).toEqual([]);
});
