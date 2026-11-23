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
  // From the start of the name, since a tab's × is part of it.
  const tab = page.getByRole("tab", {name: new RegExp("^" + name)});
  await tab.click();
  await expect(tab).toHaveAttribute("aria-selected", "true");
}

test.beforeEach(async ({context}) => {
  // No tour offer over the code.
  await skipTour(context);
});

test("a buffer draws before the image, using shared code, and is kept when saved", async ({page, context}) => {
  const errors = await offline(context);
  await page.goto("./");
  await page.getByRole("button", {name: "Continue"}).click();
  // A plain animation has only the image, and no shared.glsl tab.
  await expect(tabs(page)).toHaveText(["Image.glsl"]);

  // A buffer comes without shared GLSL code, which ⊕ adds, opened and ready to type in.
  await addTab(page, "Add a buffer");
  await expect(tabs(page)).toHaveText(["iBuffer0.glsl", "Image.glsl"]);
  await expect(page.getByRole("tab", {name: "iBuffer0.glsl"})).toHaveAttribute("aria-selected", "true");
  await setCode(page, MAGENTA_BUFFER);
  await addTab(page, "Add shared GLSL code");
  await expect(tabs(page)).toHaveText(["shared.glsl", "iBuffer0.glsl", "Image.glsl"]);
  await expect(page.getByRole("tab", {name: "shared.glsl"})).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(OPEN_EDITOR)).toBeFocused();
  await setCode(page, SHARED);
  await openTab(page, "Image.glsl");
  await setCode(page, READS_BUFFER);
  await page.keyboard.press("Shift+Enter");
  expect(near(await canvasCenter(page), MAGENTA)).toBe(true);

  await page.keyboard.press("ControlOrMeta+s");
  await expect(page).toHaveURL(/#anim\/[a-f0-9]+$/);
  const saved = page.url();
  await page.goto("about:blank");
  await page.goto(saved);
  await expect(tabs(page)).toHaveText(["shared.glsl", "iBuffer0.glsl", "Image.glsl"]);
  await expect(page.getByRole("tab", {name: "Image.glsl"})).toHaveAttribute("aria-selected", "true");
  expect(near(await canvasCenter(page), MAGENTA)).toBe(true);
  await openTab(page, "shared.glsl");
  await expect(page.locator(OPEN_EDITOR)).toContainText("vec4 magenta()");
  expect(errors).toEqual([]);
});

test("an error opens the tab it's in, and the last buffer can be removed", async ({page, context}) => {
  const errors = await offline(context);
  await page.goto("./");
  await page.getByRole("button", {name: "Continue"}).click();
  await addTab(page, "Add a buffer");
  await setCode(page, "void mainImage(out vec4 fragColor, in vec2 fragCoord) {\n  fragColor = oops;\n}");
  await openTab(page, "Image.glsl");
  await page.getByRole("button", {name: "Build"}).click();
  const buffer = page.getByRole("tab", {name: "iBuffer0.glsl"});
  await expect(buffer).toHaveAttribute("aria-selected", "true");
  await expect(buffer).toHaveAttribute("data-error", "true");
  await expect(page.locator(".ss-line-error").first()).toBeVisible();

  // An error in the shared code shows in the shared.glsl tab, under the line it's on.
  await setCode(page, MAGENTA_BUFFER);
  await addTab(page, "Add shared GLSL code");
  await setCode(page, "float fine = 1.;\nfloat broken = ;");
  await openTab(page, "Image.glsl");
  await page.getByRole("button", {name: "Build"}).click();
  await expect(page.getByRole("tab", {name: "shared.glsl"})).toHaveAttribute("data-error", "true");
  await expect(page.getByRole("tab", {name: "shared.glsl"})).toHaveAttribute("aria-selected", "true");
  // The message comes straight after the second line of the shared code.
  const afterLine = await page.locator(".ss-line-error").first().evaluate(el => el.previousElementSibling?.textContent);
  expect(afterLine).toBe("float broken = ;");

  // Removing a buffer whose code was changed asks first.
  page.once("dialog", dialog => void dialog.accept());
  await page.getByLabel("Remove iBuffer0.glsl").click();
  await expect(tabs(page)).toHaveText(["shared.glsl", "Image.glsl"]);

  // So does removing shared.glsl with code in it, but not when it has only what it started with.
  page.once("dialog", dialog => void dialog.accept());
  await page.getByLabel("Remove shared.glsl").click();
  await expect(tabs(page)).toHaveText(["Image.glsl"]);
  await addTab(page, "Add shared GLSL code");
  await expect(tabs(page)).toHaveText(["shared.glsl", "Image.glsl"]);
  await page.getByLabel("Remove shared.glsl").click();
  await expect(tabs(page)).toHaveText(["Image.glsl"]);
  expect(errors).toEqual([]);
});

test("a link to shared.glsl in a comment adds the tab, which isn't code until it's written in", async ({page, context}) => {
  const errors = await offline(context);
  await page.goto("./");
  await page.getByRole("button", {name: "Continue"}).click();
  await setCode(page, "// See [shared.glsl].\nvoid mainImage(out vec4 fragColor, in vec2 fragCoord) {\n  fragColor = vec4(1.);\n}");
  await page.keyboard.press("Shift+Enter");
  await page.locator(".cm-link", {hasText: "shared.glsl"}).click();
  await expect(tabs(page)).toHaveText(["shared.glsl", "Image.glsl"]);
  await expect(page.getByRole("tab", {name: "shared.glsl"})).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(OPEN_EDITOR)).toContainText("can be used in every shader tab");
  // Nothing to build, and nothing of it saved.
  await expect(page.getByRole("button", {name: "Build"})).toHaveCount(0);
  await page.keyboard.press("ControlOrMeta+s");
  await expect(page).toHaveURL(/#anim\/[a-f0-9]+$/);
  await page.reload();
  await expect(tabs(page)).toHaveText(["Image.glsl"]);
  expect(errors).toEqual([]);
});

test("the ink example's buffers draw in the app and the embedded player", async ({page, context}) => {
  const errors = await offline(context);
  await page.goto("./#example/5c81f0d3a7e2");
  await expect(page.locator("#titleInput")).toHaveValue("Ink in water");
  await expect(tabs(page)).toHaveText(["shared.glsl", "iBuffer0.glsl", "iBuffer1.glsl", "Image.glsl"]);
  await expect(page.getByRole("tab", {name: "Image.glsl"})).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("button", {name: "Build"})).toHaveCount(0);

  await page.goto("about:blank");
  await page.goto("./embed.html#example/5c81f0d3a7e2");
  await expect(page.locator("canvas")).toBeVisible();
  await expect(page.locator(".message")).toHaveCount(0);
  expect(errors).toEqual([]);
});
