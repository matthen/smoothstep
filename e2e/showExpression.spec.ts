// Showing a selected expression on the canvas in place of the image, and reading pixels with the inspector.
import { expect, test, type Page } from '@playwright/test';
import { PNG } from 'pngjs';

import { addTab, editorCode, expectCenter, offline, OPEN_EDITOR, PIXEL_WAIT, setCode, skipTour } from './helpers';

const RED = [255, 0, 0];

// The image is red, whatever its variables hold.
const CODE = `void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / iResolution.xy;
  vec3 tint = vec3(0.0, 1.0, 0.0);
  float d = 0.5;
  fragColor = vec4(1.0, 0.0, 0.0, 1.0) + 0.0 * vec4(tint, d + uv.x);
}`;

// The `nth` use of `name` in the open editor.
const word = (page: Page, name: string, nth = 0) =>
  page.locator(OPEN_EDITOR).getByText(name, {exact: true}).nth(nth);

const showButton = (page: Page) => page.getByRole("button", {name: "Show on canvas"});
const probeBar = (page: Page) => page.getByRole("status", {name: "Showing an expression"});

async function start(page: Page, code = CODE) {
  await page.goto("./#new");
  await setCode(page, code);
  await page.keyboard.press("Shift+Enter");
  await expectCenter(page, RED);
}

// Selects the text from the start of `from` to the end of `to`, on one line of the open editor.
async function select(page: Page, from: string, to: string, nth = 0) {
  await word(page, from, nth).click({position: {x: 1, y: 6}});
  const box = (await word(page, to).boundingBox())!;
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 1, box.y + box.height / 2, {steps: 4});
  await page.mouse.up();
}

test.beforeEach(async ({context}) => {
  await skipTour(context);
});

test("showing a selected expression puts its value on the canvas until it's turned off", async ({page, context}) => {
  const errors = await offline(context);
  await start(page);

  // The button under a selected name shows it: a vec3 as its colour.
  await word(page, "tint").dblclick();
  await showButton(page).click();
  await expectCenter(page, [0, 255, 0]);
  await expect(probeBar(page)).toContainText("tint");
  await expect(probeBar(page)).toContainText("vec3");
  await expect(page.locator(".cm-shown-expression")).toHaveText("tint");

  // Alt+Enter shows the selection instead: a float as grey.
  await word(page, "d").dblclick();
  await page.keyboard.press("Alt+Enter");
  await expect(probeBar(page)).toContainText("float");
  await expectCenter(page, [128, 128, 128]);

  // The range switch shows -1 to 1 across the colours, so 0.5 is lighter.
  await probeBar(page).getByText("-1 to 1").click();
  await expectCenter(page, [191, 191, 191], {tolerance: 20});

  // Turning it off shows the image again, and the code was never changed.
  await probeBar(page).getByRole("button", {name: "Show the image"}).click();
  await expect(probeBar(page)).toHaveCount(0);
  await expectCenter(page, RED);
  expect(await editorCode(page)).toBe(CODE);
  expect(errors).toEqual([]);
});

test("Alt+Enter on the shown name turns it off, and building again keeps showing it", async ({page, context}) => {
  const errors = await offline(context);
  await start(page);
  await word(page, "tint").click();
  await page.keyboard.press("Alt+Enter");
  await expectCenter(page, [0, 255, 0]);

  // An edit above the expression moves it; the build shows the same expression with the new code.
  await page.keyboard.press("Home");
  await page.keyboard.type("  ");
  await page.locator(OPEN_EDITOR).press("ControlOrMeta+Home");
  await page.keyboard.type("// green\n");
  await page.keyboard.press("Shift+Enter");
  await expect(page.locator(".cm-shown-expression")).toHaveText("tint");
  await expectCenter(page, [0, 255, 0]);

  await word(page, "tint").click();
  await page.keyboard.press("Alt+Enter");
  await expect(probeBar(page)).toHaveCount(0);
  await expectCenter(page, RED);
  expect(errors).toEqual([]);
});

test("with nothing selected, the button shows the name the cursor rests in, with its fields", async ({page, context}) => {
  const errors = await offline(context);
  await start(page);

  await word(page, "tint", 1).click({position: {x: 4, y: 6}});
  await showButton(page).click();
  await expectCenter(page, [0, 255, 0]);
  await expect(probeBar(page)).toContainText("tint");

  // A click in `uv` of `uv.x` shows the whole access.
  await word(page, "uv", 1).click({position: {x: 4, y: 6}});
  await showButton(page).click();
  await expect(probeBar(page)).toContainText("uv.x");
  await expect(probeBar(page)).toContainText("float");
  await expect(page.locator(".cm-shown-expression")).toHaveText("uv.x");

  // Typing a name doesn't bring the button up, and nor does a keyword or a function call.
  await page.keyboard.press("End");
  await page.keyboard.type("\n  float e = d");
  await page.waitForTimeout(800);
  await expect(showButton(page)).toHaveCount(0);
  await word(page, "vec4", 1).click({position: {x: 4, y: 6}});
  await page.waitForTimeout(800);
  await expect(showButton(page)).toHaveCount(0);
  expect(errors).toEqual([]);
});

// The colour across the middle of the canvas, `fraction` of the way from its left.
async function canvasPixel(page: Page, fraction: number): Promise<number[]> {
  const png = PNG.sync.read(await page.locator("#canvas").screenshot());
  const x = Math.min(png.width - 1, Math.floor(png.width * fraction));
  const i = (Math.floor(png.height / 2) * png.width + x) * 4;
  return [png.data[i]!, png.data[i + 1]!, png.data[i + 2]!];
}

test("Auto shows the lowest value as black and the highest as white, and says what they are", async ({page, context}) => {
  const errors = await offline(context);
  // From -2 at the left to 6 at the right, so 2 in the middle.
  await start(page, `void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / iResolution.xy;
  float v = clamp(uv.x * 12.0 - 4.0, -2.0, 6.0);
  fragColor = vec4(1.0, 0.0, 0.0, 1.0) + 0.0 * v;
}`);
  await word(page, "v").click({position: {x: 2, y: 6}});
  await page.keyboard.press("Alt+Enter");
  await expect(probeBar(page)).toContainText("-2 to 6");
  await expectCenter(page, [128, 128, 128], {tolerance: 12});
  await expect.poll(() => canvasPixel(page, 0.02), PIXEL_WAIT).toEqual([0, 0, 0]);
  await expect.poll(() => canvasPixel(page, 0.98), PIXEL_WAIT).toEqual([255, 255, 255]);

  // 0 to 1 clips instead, so the middle's 2 is white.
  await probeBar(page).getByText("0 to 1", {exact: true}).click();
  await expectCenter(page, [255, 255, 255], {tolerance: 2});
  await expect(probeBar(page)).not.toContainText("-2 to 6");

  // The inspector still reads the value itself.
  const canvas = page.locator("#canvas");
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.75, box.y + box.height / 2);
  await expect(page.getByRole("status", {name: "Pixel values"})).toContainText(/v = (5\.0|4\.99)\d/, PIXEL_WAIT);
  expect(errors).toEqual([]);
});

test("a selection that isn't an expression says so, and the image keeps drawing", async ({page, context}) => {
  const errors = await offline(context);
  await start(page);

  // A whole statement has no button, and the shortcut explains.
  await select(page, "float", "0.5");
  await expect(showButton(page)).toHaveCount(0);
  await page.keyboard.press("Alt+Enter");
  await expect(page.getByText("Select a single expression, such as a variable or a calculation.")).toBeVisible();
  await expect(probeBar(page)).toHaveCount(0);

  // One that doesn't build gives the compiler's reason.
  await setCode(page, CODE.replace("d + uv.x", "d + uv.z"));
  await page.keyboard.press("Shift+Enter");
  await expectCenter(page, RED);
  await select(page, "uv", "z", 1);
  await page.keyboard.press("Alt+Enter");
  await expect(page.getByText("Can't show that on the canvas")).toBeVisible();
  await expect(probeBar(page)).toHaveCount(0);
  await expectCenter(page, RED);
  expect(errors).toEqual([]);
});

test("an expression in a buffer shows that buffer's value, even when the image doesn't read it", async ({page, context}) => {
  const errors = await offline(context);
  await start(page);
  // The button goes with the tab it's in.
  await word(page, "tint").dblclick();
  await expect(showButton(page)).toBeVisible();
  await addTab(page, "Add a buffer");
  await expect(showButton(page)).toHaveCount(0);
  await setCode(page, `void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  float level = 0.25;
  fragColor = vec4(level);
}`);
  await page.keyboard.press("Shift+Enter");
  await word(page, "level").dblclick();
  await page.keyboard.press("Alt+Enter");
  await expect(probeBar(page)).toContainText("in iBuffer0.glsl");
  await expectCenter(page, [64, 64, 64], {tolerance: 20});
  expect(errors).toEqual([]);
});

test("the pixel inspector reads the colour, and the shown expression's value", async ({page, context}) => {
  const errors = await offline(context);
  await start(page);
  const canvas = page.locator("#canvas");
  const readout = page.getByRole("status", {name: "Pixel values"});

  await canvas.hover();
  await page.getByRole("button", {name: "Pixel inspector"}).click();
  await canvas.hover();
  await expect(readout).toContainText(/1\.000\s+0\.000\s+0\.000/);
  await expect(readout).toContainText("#ff0000");
  await expect(readout).toContainText(/fragCoord \d+\.5, \d+\.5 · uv 0\.(49|50)\d, 0\.(49|50)\d/);

  // While an expression shows, it reads the value itself: here a float, past what the colours show.
  await setCode(page, CODE.replace("float d = 0.5;", "float d = uv.x * 4.0;"));
  await page.keyboard.press("Shift+Enter");
  await word(page, "d").dblclick();
  await page.keyboard.press("Alt+Enter");
  await expect(probeBar(page)).toBeVisible();
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.75, box.y + box.height / 2);
  await expect(readout).toContainText(/d = 3\.0\d\d|d = 2\.99\d/, PIXEL_WAIT);

  // Leaving the canvas hides it, and turning the inspector off stops it.
  await page.mouse.move(box.x + box.width / 2, box.y + box.height + 200);
  await expect(readout).toHaveCount(0);
  expect(errors).toEqual([]);
});

test.describe("on a touch screen", () => {
  test.use({viewport: {width: 1180, height: 820}, hasTouch: true});

  test("tapping the canvas with the inspector on shows a pixel's values", async ({page, context}) => {
    const errors = await offline(context);
    await start(page);
    const canvas = page.locator("#canvas");
    // A tap shows the inspector's button, and a second turns it on.
    await canvas.tap();
    await page.getByRole("button", {name: "Pixel inspector"}).tap();
    await canvas.tap();
    const readout = page.getByRole("status", {name: "Pixel values"});
    await expect(readout).toContainText("#ff0000");
    // It stays after the finger lifts.
    await page.waitForTimeout(500);
    await expect(readout).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("tapping a variable offers to show it on the canvas", async ({page, context}) => {
    const errors = await offline(context);
    await start(page);
    await word(page, "d").tap();
    await page.locator(".ss-popup").getByRole("button", {name: "Show on canvas"}).tap();
    await expect(probeBar(page)).toContainText("float");
    await expectCenter(page, [128, 128, 128]);
    expect(errors).toEqual([]);
  });
});

test("an if's body without braces shows only where it runs, striped elsewhere", async ({page, context}) => {
  const errors = await offline(context);
  await start(page, `void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / iResolution.xy;
  float d = 0.0;
  if (uv.x > 0.75) d = uv.x;
  fragColor = vec4(1.0, 0.0, 0.0, 1.0) + 0.0 * d;
}`);
  await word(page, "d", 1).dblclick();
  await page.keyboard.press("Alt+Enter");
  await expect(probeBar(page)).toContainText("float");
  // The middle of the canvas, where uv.x is 0.5, is striped.
  await expectCenter(page, [55, 56, 72], {tolerance: 20});
  const canvas = page.locator("#canvas");
  const readout = page.getByRole("status", {name: "Pixel values"});
  await canvas.hover();
  await expect(readout).toContainText("doesn't run at this pixel");
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.9, box.y + box.height / 2);
  await expect(readout).toContainText(/d = 0\.(89|90)\d/, PIXEL_WAIT);
  expect(errors).toEqual([]);
});

test("an expression whose type is guessed wrong still shows, as the type it has", async ({page, context}) => {
  const errors = await offline(context);
  await start(page, `void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  fragColor = vec4(1.0, 0.0, 0.0, 1.0) + 0.0 * vec4(textureSize(iTexture0, 0), 0, 0);
}`);
  // An empty texture slot is 1 pixel, so the ivec2 is (1, 1): yellow.
  await word(page, "textureSize").click({position: {x: 1, y: 6}});
  for (let i = 0; i < "textureSize(iTexture0, 0)".length; i++) {
    await page.keyboard.press("Shift+ArrowRight");
  }
  await page.keyboard.press("Alt+Enter");
  await expect(probeBar(page)).toContainText("ivec2");
  await expectCenter(page, [255, 255, 0]);
  expect(errors).toEqual([]);
});

test("an expression in a shared helper shows in the buffer that reaches it through another helper", async ({page, context}) => {
  const errors = await offline(context);
  await start(page);
  await addTab(page, "Add a buffer");
  await setCode(page, `void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  fragColor = vec4(level(0.5));
}`);
  await addTab(page, "Add shared GLSL code");
  await setCode(page, `float halve(float x) {
  float scaled = x * 0.5;
  return scaled;
}
float level(float x) {
  return halve(x);
}`);
  await page.keyboard.press("Shift+Enter");
  await expectCenter(page, RED);
  await word(page, "scaled").dblclick();
  await page.keyboard.press("Alt+Enter");
  await expect(probeBar(page)).toContainText("in iBuffer0.glsl");
  await expectCenter(page, [64, 64, 64], {tolerance: 20});
  expect(errors).toEqual([]);
});

test("a shown expression keeps showing through a build, with the new code's value", async ({page, context}) => {
  const errors = await offline(context);
  await start(page);
  await word(page, "d").dblclick();
  await page.keyboard.press("Alt+Enter");
  await expectCenter(page, [128, 128, 128]);
  await word(page, "0.5").dblclick();
  await page.keyboard.type("0.25");
  await page.keyboard.press("Shift+Enter");
  await expect(probeBar(page)).toContainText("float");
  await expectCenter(page, [64, 64, 64], {tolerance: 20});
  expect(errors).toEqual([]);
});

test("showing an expression in code that doesn't build says why", async ({page, context}) => {
  const errors = await offline(context);
  await start(page);
  await setCode(page, CODE.replace("float d = 0.5;", "float d = 0.5"));
  await word(page, "tint").dblclick();
  await page.keyboard.press("Alt+Enter");
  await expect(page.getByText("The code needs to build first. Fix its errors, then try again.")).toBeVisible();
  await expect(probeBar(page)).toHaveCount(0);
  await expectCenter(page, RED);
  expect(errors).toEqual([]);
});
