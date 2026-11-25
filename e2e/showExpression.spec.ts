// Showing a selected expression on the canvas in place of the image, and reading pixels with the inspector.
import { expect, test, type Page } from '@playwright/test';

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
});
