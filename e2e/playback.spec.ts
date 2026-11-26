import { expect, test, type Page } from '@playwright/test';

import { FRAME_WAIT, offline, skipTour } from './helpers';

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
  await expect.poll(() => frameIndex(page), FRAME_WAIT).toBeGreaterThan(60);
  await page.locator(".cm-content").click();
  const before = await frameIndex(page);
  await page.keyboard.press("Shift+Enter");
  // It counts on at 60 a second, so the count only drops if it went back to 0.
  await expect.poll(() => frameIndex(page), FRAME_WAIT).toBeLessThan(before);
  expect(errors).toEqual([]);
});

test("full screen fills the window with the canvas and the play bar, until Esc", async ({page, context}) => {
  const errors = await offline(context);
  await skipTour(context);
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

test("a click on the background around the canvas leaves full screen, and a click on the canvas doesn't", async ({page, context}) => {
  const errors = await offline(context);
  await skipTour(context);
  await page.goto("./#new");
  await page.getByRole("button", {name: "Full screen"}).click();
  const canvas = (await page.locator("#canvas").boundingBox())!;
  await page.mouse.click(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);
  await expect(page.getByRole("button", {name: "Exit full screen"})).toBeVisible();
  await page.mouse.click(4, 4);
  await expect(page.getByRole("button", {name: "Full screen"})).toBeVisible();
  expect(errors).toEqual([]);
});

test("dragging the divider sets how wide the canvas's side is, which stays after a reload", async ({page, context}) => {
  const errors = await offline(context);
  await skipTour(context);
  await page.goto("./#new");
  const pane = page.locator(".previewPane");
  const divider = page.getByRole("separator", {name: "Resize the canvas"});
  const width = async () => (await pane.boundingBox())!.width;
  const drag = async (toX: number) => {
    const box = (await divider.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + 200);
    await page.mouse.down();
    await page.mouse.move(toX, box.y + 200, {steps: 5});
    await page.mouse.up();
  };
  const start = await width();
  // A click without moving doesn't change it.
  await divider.click();
  expect(await width()).toBe(start);
  await drag((await divider.boundingBox())!.x - 200);
  await expect.poll(width).toBeGreaterThan(start + 150);
  // Dragged as far as it goes the other way, the canvas's side keeps some width.
  await drag(page.viewportSize()!.width - 2);
  await expect.poll(width).toBeLessThan(start);
  expect(await width()).toBeGreaterThan(start / 3);
  await divider.focus();
  await page.keyboard.press("ArrowLeft");
  const widened = await width();
  await page.reload();
  await expect.poll(width).toBeCloseTo(widened, 0);
  await divider.dblclick();
  await expect.poll(width).toBeCloseTo(start, 0);
  expect(errors).toEqual([]);
});

test("the tutorial keeps its own split, whatever width the divider was dragged to", async ({page, context}) => {
  await offline(context);
  await skipTour(context);
  await context.addInitScript(() => {
    if (window.location.protocol.startsWith("http")) {
      window.localStorage.setItem("smoothstep.previewWidth", "5000");
    }
  });
  await page.goto("./#tutorial");
  const editor = (await page.locator(".editorPane").boundingBox())!;
  const preview = (await page.locator(".previewPane").boundingBox())!;
  expect(editor.width).toBeGreaterThan(preview.width);
  await expect(page.getByRole("separator", {name: "Resize the canvas"})).toBeHidden();
});
