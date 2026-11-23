// Buffers and shared code: the tabs above the code, drawing buffers before the image, errors in
// any tab, and keeping them when saved.
import { expect, test, type Page } from '@playwright/test';

import { addTab, canvasCenter, MAGENTA, near, offline, OPEN_EDITOR, setCode, skipTour } from './helpers';

const MAGENTA_BUFFER = "void mainImage(out vec4 fragColor, in vec2 fragCoord) {\n  fragColor = magenta();\n}";
const SHARED = "vec4 magenta() {\n  return vec4(0.86, 0.08, 0.78, 1.);\n}";
const READS_BUFFER = "void mainImage(out vec4 fragColor, in vec2 fragCoord) {\n" +
  "  fragColor = texture(iBuffer0, fragCoord / iResolution.xy);\n}";

function tabs(page: Page) {
  return page.getByRole("tablist", {name: "Code, in the order it draws"}).getByRole("tab");
}

async function openTab(page: Page, name: string) {
  await page.getByRole("tab", {name, exact: true}).click();
  await expect(page.getByRole("tab", {name, exact: true})).toHaveAttribute("aria-selected", "true");
}

test.beforeEach(async ({context}) => {
  // No tour offer over the code.
  await skipTour(context);
});

test("a buffer draws before the image, using shared code, and is kept when saved", async ({page, context}) => {
  const errors = await offline(context);
  await page.goto("./");
  await page.getByRole("button", {name: "Continue"}).click();
  // A plain animation has only the image, and no Shared GLSL tab.
  await expect(tabs(page)).toHaveText(["Image"]);

  await addTab(page, "Add a buffer");
  await expect(tabs(page)).toHaveText(["Shared GLSL", "iBuffer0", "Image"]);
  await expect(page.getByRole("tab", {name: "iBuffer0"})).toHaveAttribute("aria-selected", "true");
  await setCode(page, MAGENTA_BUFFER);
  await openTab(page, "Shared GLSL");
  await setCode(page, SHARED);
  await openTab(page, "Image");
  await setCode(page, READS_BUFFER);
  await page.keyboard.press("Shift+Enter");
  expect(near(await canvasCenter(page), MAGENTA)).toBe(true);

  await page.keyboard.press("ControlOrMeta+s");
  await expect(page).toHaveURL(/#anim\/[a-f0-9]+$/);
  const saved = page.url();
  await page.goto("about:blank");
  await page.goto(saved);
  await expect(tabs(page)).toHaveText(["Shared GLSL", "iBuffer0", "Image"]);
  await expect(page.getByRole("tab", {name: "Image"})).toHaveAttribute("aria-selected", "true");
  expect(near(await canvasCenter(page), MAGENTA)).toBe(true);
  await openTab(page, "Shared GLSL");
  await expect(page.locator(OPEN_EDITOR)).toContainText("vec4 magenta()");
  expect(errors).toEqual([]);
});

test("an error opens the tab it's in, and the last buffer can be removed", async ({page, context}) => {
  const errors = await offline(context);
  await page.goto("./");
  await page.getByRole("button", {name: "Continue"}).click();
  await addTab(page, "Add a buffer");
  await setCode(page, "void mainImage(out vec4 fragColor, in vec2 fragCoord) {\n  fragColor = oops;\n}");
  await openTab(page, "Image");
  await page.getByRole("button", {name: "Build"}).click();
  const buffer = page.getByRole("tab", {name: "iBuffer0"});
  await expect(buffer).toHaveAttribute("aria-selected", "true");
  await expect(buffer).toHaveAttribute("data-error", "true");
  await expect(page.locator(".ss-line-error").first()).toBeVisible();

  // An error in the shared code shows in the Shared GLSL tab, under the line it's on.
  await setCode(page, MAGENTA_BUFFER);
  await openTab(page, "Shared GLSL");
  await setCode(page, "float fine = 1.;\nfloat broken = ;");
  await openTab(page, "Image");
  await page.getByRole("button", {name: "Build"}).click();
  await expect(page.getByRole("tab", {name: "Shared GLSL"})).toHaveAttribute("data-error", "true");
  await expect(page.getByRole("tab", {name: "Shared GLSL"})).toHaveAttribute("aria-selected", "true");
  // The message comes straight after the second line of the shared code.
  const afterLine = await page.locator(".ss-line-error").first().evaluate(el => el.previousElementSibling?.textContent);
  expect(afterLine).toBe("float broken = ;");

  // Removing a buffer whose code was changed asks first.
  page.once("dialog", dialog => void dialog.accept());
  await page.getByLabel("Remove iBuffer0").click();
  await expect(tabs(page)).toHaveText(["Shared GLSL", "Image"]);
  expect(errors).toEqual([]);
});

test("the ink example's buffers draw in the app and the embedded player", async ({page, context}) => {
  const errors = await offline(context);
  await page.goto("./#example/5c81f0d3a7e2");
  await expect(page.locator("#titleInput")).toHaveValue("Ink in water");
  await expect(tabs(page)).toHaveText(["Shared GLSL", "iBuffer0", "iBuffer1", "Image"]);
  await expect(page.getByRole("tab", {name: "Image"})).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("button", {name: "Build"})).toHaveCount(0);

  await page.goto("about:blank");
  await page.goto("./embed.html#example/5c81f0d3a7e2");
  await expect(page.locator("canvas")).toBeVisible();
  await expect(page.locator(".message")).toHaveCount(0);
  expect(errors).toEqual([]);
});
