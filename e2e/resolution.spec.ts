// On a high-DPI screen the preview draws more pixels than it takes up, so it's sharp, in the app and
// the embedded player.
import { expect, test, type Page } from '@playwright/test';
import { PNG } from 'pngjs';

import { offline, setCode, skipTour } from './helpers';

test.use({deviceScaleFactor: 2});

// White on the right half of the frame, by iResolution.
const HALVES = "void mainImage(out vec4 fragColor, in vec2 fragCoord) {\n" +
  "  fragColor = vec4(vec3(step(0.5, fragCoord.x / iResolution.x)), 1.);\n}";

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

test("the preview draws at twice its size on a 2× screen, and the shader fills it", async ({page, context}) => {
  const errors = await offline(context);
  await page.goto("./");
  await page.getByRole("button", {name: "Continue"}).click();
  await setCode(page, HALVES);
  await page.keyboard.press("Shift+Enter");

  const {drawing, display} = await drawingAndDisplay(page, "#canvas");
  expect(drawing).toEqual(display.map(d => 2 * d));
  // The size shown over the canvas is the size the shader draws at.
  await expect(page.locator("#canvasContainer .fps p").first()).toHaveText(`${drawing[0]}×${drawing[1]}px`);
  await expect.poll(() => colourAt(page, 0.75, 0.5)).toEqual([255, 255, 255]);
  expect(await colourAt(page, 0.25, 0.5)).toEqual([0, 0, 0]);
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
