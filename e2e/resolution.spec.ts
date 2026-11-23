// On a high-DPI screen the preview draws more pixels than it takes up, so it's sharp, in the app and
// the embedded player, with the shaders and the Canvas2D layer agreeing on the size.
import { expect, test, type Page } from '@playwright/test';
import { PNG } from 'pngjs';

import { addTab, MAGENTA, near, offline, OPEN_EDITOR, setCode, skipTour } from './helpers';

test.use({deviceScaleFactor: 2});

// White on the right half of the frame, by iResolution, with the Canvas2D layer's drawing over it.
const HALVES = "void mainImage(out vec4 fragColor, in vec2 fragCoord) {\n" +
  "  vec4 drawn = texture(iCanvas2D, fragCoord / iResolution.xy);\n" +
  "  vec3 col = vec3(step(0.5, fragCoord.x / iResolution.x));\n" +
  "  fragColor = vec4(drawn.rgb + (1. - drawn.a) * col, 1.);\n}";
// Magenta over the top half, in the layer's own units.
const TOP_HALF = "function draw(ctx, {width, height}) {\n  clear(ctx);\n" +
  "  ctx.fillStyle = \"rgb(220, 20, 200)\";\n  ctx.fillRect(0, 0, width, height / 2);\n}";

async function drawingAndDisplay(page: Page, selector: string) {
  return page.locator(selector).evaluate((canvas: HTMLCanvasElement) => {
    const box = canvas.getBoundingClientRect();
    return {drawing: [canvas.width, canvas.height], display: [Math.round(box.width), Math.round(box.height)]};
  });
}

// The colour at fractions of the way across and down the canvas.
async function colourAt(page: Page, x: number, y: number) {
  const png = PNG.sync.read(await page.locator("#canvas").screenshot());
  const i = (Math.floor(png.height * y) * png.width + Math.floor(png.width * x)) * 4;
  return [png.data[i]!, png.data[i + 1]!, png.data[i + 2]!];
}

test.beforeEach(async ({context}) => {
  await skipTour(context);
});

test("the preview draws at twice its size on a 2× screen, and the shaders and layer fill it", async ({page, context}) => {
  const errors = await offline(context);
  await page.goto("./");
  await page.getByRole("button", {name: "Continue"}).click();
  await setCode(page, HALVES);
  await addTab(page, "Add the Canvas2D layer");
  await setCode(page, TOP_HALF);
  await page.keyboard.press("Shift+Enter");

  const {drawing, display} = await drawingAndDisplay(page, "#canvas");
  expect(drawing).toEqual(display.map(d => 2 * d));
  // The size shown over the canvas is the size the shaders draw at.
  await expect(page.locator("#canvasContainer .fps p").first()).toHaveText(`${drawing[0]}×${drawing[1]}px`);
  await expect.poll(() => colourAt(page, 0.75, 0.75)).toEqual([255, 255, 255]);
  expect(await colourAt(page, 0.25, 0.75)).toEqual([0, 0, 0]);
  expect(near(await colourAt(page, 0.25, 0.25), MAGENTA)).toBe(true);
  expect(near(await colourAt(page, 0.75, 0.25), MAGENTA)).toBe(true);
  expect(errors).toEqual([]);
});

test("the embedded player draws at twice its size on a 2× screen", async ({page, context}) => {
  const errors = await offline(context);
  // Small enough that twice its size is under the cap on drawing size.
  await page.setViewportSize({width: 800, height: 600});
  await page.goto("./embed.html#example/5c81f0d3a7e2");
  await expect(page.locator("canvas")).toBeVisible();
  const {drawing, display} = await drawingAndDisplay(page, "canvas");
  expect(drawing).toEqual(display.map(d => 2 * d));
  expect(errors).toEqual([]);
});

// Step 0 marks the buffer and notes its iTime, and later steps keep what it holds.
const MARKS_START = "void mainImage(out vec4 fragColor, in vec2 fragCoord) {\n" +
  "  vec4 last = texture(iBuffer0, fragCoord / iResolution.xy);\n" +
  "  fragColor = iFrame == 0 ? vec4(1., iTime, 0., 1.) : last;\n}";
// Green while the buffer holds the mark from the start of playback; red if it was lost or set again later.
const CHECKS_MARK = "void mainImage(out vec4 fragColor, in vec2 fragCoord) {\n" +
  "  vec4 mark = texture(iBuffer0, fragCoord / iResolution.xy);\n" +
  "  fragColor = mark.r > 0.5 && mark.g < 0.5 ? vec4(0., 1., 0., 1.) : vec4(1., 0., 0., 1.);\n}";

test("a slow preview drops to 1× without losing the simulation, and the next build tries 2× again", async ({page, context}) => {
  const errors = await offline(context);
  // While window.slowFrames counts down, each frame's callbacks run 50 ms late, so the preview is slow.
  await page.addInitScript(() => {
    const w = window as unknown as {slowFrames: number};
    w.slowFrames = 0;
    const raf = window.requestAnimationFrame.bind(window);
    let lastFrame = -1;
    window.requestAnimationFrame = callback => raf(now => {
      if (now !== lastFrame && w.slowFrames > 0) {
        w.slowFrames -= 1;
      }
      const slow = w.slowFrames > 0;
      lastFrame = now;
      if (slow) {
        setTimeout(() => callback(performance.now()), 50);
      } else {
        callback(now);
      }
    });
  });
  await page.setViewportSize({width: 800, height: 600});
  await page.goto("./");
  await page.getByRole("button", {name: "Continue"}).click();
  await addTab(page, "Add a buffer");
  await setCode(page, MARKS_START);
  await page.getByRole("tab", {name: "Image.glsl", exact: true}).click();
  await setCode(page, CHECKS_MARK);
  await page.keyboard.press("Shift+Enter");
  const size = page.locator("#canvasContainer .fps p").first();
  const sizeAt = async (ratio: number) => {
    const {display} = await drawingAndDisplay(page, "#canvas");
    return `${display[0]! * ratio}×${display[1]! * ratio}px`;
  };
  await expect(size).toHaveText(await sizeAt(2));
  await page.getByRole("button", {name: "Play"}).click();
  await expect.poll(() => colourAt(page, 0.5, 0.5)).toEqual([0, 255, 0]);

  await page.evaluate(() => {(window as unknown as {slowFrames: number}).slowFrames = 10_000;});
  await expect(size).toHaveText(await sizeAt(1), {timeout: 10_000});
  expect(await colourAt(page, 0.5, 0.5)).toEqual([0, 255, 0]);

  // Built while still slow, the new code gets a fresh look at 2×.
  await page.locator(OPEN_EDITOR).click();
  await page.keyboard.press("Shift+Enter");
  await page.evaluate(() => {(window as unknown as {slowFrames: number}).slowFrames = 0;});
  await expect(size).toHaveText(await sizeAt(2));
  await page.waitForTimeout(1000);
  await expect(size).toHaveText(await sizeAt(2));
  expect(errors).toEqual([]);
});
