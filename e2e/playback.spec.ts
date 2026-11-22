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

test("full screen fills the window with the canvas and the play bar, until Esc", async ({page, context}) => {
  const errors = await offline(context);
  await page.addInitScript(() => localStorage.setItem("smoothstep.tour", "taken"));
  await page.goto("./#new");
  const canvas = page.locator("#canvas");
  await expect(canvas).toBeVisible();
  const small = (await canvas.boundingBox())!;
  await page.getByRole("button", {name: "Full screen"}).click();
  await expect.poll(async () => (await canvas.boundingBox())!.width).toBeGreaterThan(small.width * 1.3);
  const pane = (await page.locator(".previewPane").boundingBox())!;
  expect([pane.x, pane.y, pane.width, pane.height]).toEqual([0, 0, page.viewportSize()!.width, page.viewportSize()!.height]);
  await expect(page.getByRole("button", {name: "Play"})).toBeInViewport();
  await expect(page.getByLabel("Aspect ratio")).toBeHidden();
  // The scrubber's handle sits below the canvas, not over its edge.
  const big = (await canvas.boundingBox())!;
  expect((await page.locator(".sliderHandle").boundingBox())!.y).toBeGreaterThan(big.y + big.height);
  await page.keyboard.press("Escape");
  await expect.poll(async () => (await canvas.boundingBox())!.width).toBeCloseTo(small.width, 0);
  await expect(page.getByRole("button", {name: "Full screen"})).toBeVisible();
  expect(errors).toEqual([]);
});

test("a click on the background around the canvas leaves full screen, and a click on the canvas doesn't", async ({page}) => {
  await page.addInitScript(() => localStorage.setItem("smoothstep.tour", "taken"));
  await page.goto("./#new");
  await page.getByRole("button", {name: "Full screen"}).click();
  const canvas = (await page.locator("#canvas").boundingBox())!;
  await page.mouse.click(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);
  await expect(page.getByRole("button", {name: "Exit full screen"})).toBeVisible();
  await page.mouse.click(4, 4);
  await expect(page.getByRole("button", {name: "Full screen"})).toBeVisible();
});
