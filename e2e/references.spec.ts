// Find references with Shift-F12, Rename with F2, and the minimap beside long code.
import { expect, test, type Page } from '@playwright/test';

import { addTab, editorCode, offline, OPEN_EDITOR, setCode, skipTour } from './helpers';

const CODE = `float wave(float t) {
  return sin(t * 6.);
}
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  float w = wave(0.5) + wave(0.25);
  fragColor = vec4(w);
}`;

const word = (page: Page, name: string, nth: number) =>
  page.locator(OPEN_EDITOR).getByText(name, {exact: true}).nth(nth);
const openPanel = (page: Page) => page.locator(".ss-code-editor:not([hidden]) .ss-references");
const tab = (page: Page, name: RegExp) => page.getByRole("tab", {name});

test.beforeEach(async ({context}) => {
  await skipTour(context);
});

// Image.glsl calls magenta() from shared.glsl twice.
async function sharedSetup(page: Page) {
  await page.goto("./#new");
  await setCode(page, "void mainImage(out vec4 fragColor, in vec2 fragCoord) {\n  fragColor = magenta() * magenta();\n}");
  await addTab(page, "Add shared GLSL code");
  await setCode(page, "vec4 magenta() {\n  return vec4(0.86, 0.08, 0.78, 1.);\n}");
  await tab(page, /^Image\.glsl/).click();
}

test("Shift-F12 lists a name's uses, highlights them, and goes to one", async ({page, context}) => {
  const errors = await offline(context);
  await page.goto("./#new");
  await setCode(page, CODE);

  await word(page, "wave", 2).click();
  await page.keyboard.press("Shift+F12");
  const panel = openPanel(page);
  await expect(panel).toContainText("3 uses of wave");
  await expect(panel.locator(".ss-reference")).toHaveText([/^1\s*float wave/, /^5\s*float w = wave/, /^5\s*float w = wave/]);
  await expect(page.locator(`${OPEN_EDITOR} .cm-reference`)).toHaveCount(3);

  // Going to the definition selects it, so typing replaces it.
  await panel.locator(".ss-reference").first().click();
  await page.keyboard.type("ripple");
  expect((await editorCode(page)).split("\n")[0]).toBe("float ripple(float t) {");
  // The edit closes the list.
  await expect(panel).toHaveCount(0);
  await expect(page.locator(".cm-reference")).toHaveCount(0);

  // A parameter's uses are only in its function, and Esc closes the list.
  await word(page, "t", 1).click();
  await page.keyboard.press("Shift+F12");
  await expect(panel.locator(".ss-reference")).toHaveCount(2);
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("Shift-F12 on a name from the shared code lists its uses in every tab, and goes to another tab", async ({page, context}) => {
  const errors = await offline(context);
  await sharedSetup(page);

  await word(page, "magenta", 1).click();
  await page.keyboard.press("Shift+F12");
  const items = openPanel(page).locator(".ss-reference");
  await expect(items).toHaveText([/^shared\.glsl\s*1\s*vec4 magenta/, /^Image\.glsl\s*2/, /^Image\.glsl\s*2/]);
  // Only this tab's uses are highlighted here.
  await expect(page.locator(`${OPEN_EDITOR} .cm-reference`)).toHaveCount(2);

  await items.first().click();
  await expect(tab(page, /^shared\.glsl/)).toHaveAttribute("aria-selected", "true");
  // The list comes along, highlighting the uses in the shared tab.
  await expect(openPanel(page).locator(".ss-reference")).toHaveCount(3);
  await expect(page.locator(`${OPEN_EDITOR} .cm-reference`)).toHaveCount(1);
  await page.keyboard.type("pink");
  expect((await editorCode(page)).split("\n")[0]).toBe("vec4 pink() {");
  expect(errors).toEqual([]);
});

test("Editing another tab the list shows closes the list", async ({page, context}) => {
  const errors = await offline(context);
  await sharedSetup(page);

  await word(page, "magenta", 1).click();
  await page.keyboard.press("Shift+F12");
  await expect(openPanel(page).locator(".ss-reference")).toHaveCount(3);

  await tab(page, /^shared\.glsl/).click();
  await page.locator(OPEN_EDITOR).click();
  await page.keyboard.press("ControlOrMeta+Home");
  await page.keyboard.type("// colours\n");
  await tab(page, /^Image\.glsl/).click();
  await expect(openPanel(page)).toHaveCount(0);
  await expect(page.locator(`${OPEN_EDITOR} .cm-reference`)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("F2 renames a shared name in every tab, as one undo step in each", async ({page, context}) => {
  const errors = await offline(context);
  await sharedSetup(page);

  await word(page, "magenta", 0).click();
  await page.keyboard.press("F2");
  const input = page.getByRole("textbox", {name: "New name for magenta"});
  await expect(input).toBeFocused();
  await expect(input).toHaveValue("magenta");

  // A built-in or a name that isn't valid is refused, and the input stays.
  await input.fill("sin");
  await input.press("Enter");
  await expect(page.locator(".ss-rename-error")).toHaveText("sin is part of GLSL. Choose another name.");
  await input.fill("2pink");
  await input.press("Enter");
  await expect(page.locator(".ss-rename-error")).toContainText("starts with a letter");

  await input.fill("pink");
  await input.press("Enter");
  await expect(input).toHaveCount(0);
  expect((await editorCode(page)).split("\n")[1]).toBe("  fragColor = pink() * pink();");
  await tab(page, /^shared\.glsl/).click();
  expect((await editorCode(page)).split("\n")[0]).toBe("vec4 pink() {");

  // Undo takes back the whole rename in this tab, and leaves the other tab's.
  await page.locator(OPEN_EDITOR).click();
  await page.keyboard.press("ControlOrMeta+z");
  expect((await editorCode(page)).split("\n")[0]).toBe("vec4 magenta() {");
  await tab(page, /^Image\.glsl/).click();
  expect((await editorCode(page)).split("\n")[1]).toBe("  fragColor = pink() * pink();");
  await page.locator(OPEN_EDITOR).click();
  await page.keyboard.press("ControlOrMeta+z");
  expect((await editorCode(page)).split("\n")[1]).toBe("  fragColor = magenta() * magenta();");
  expect(errors).toEqual([]);
});

test("F2 on a built-in says it can't be renamed, and Esc cancels a rename", async ({page, context}) => {
  const errors = await offline(context);
  await page.goto("./#new");
  await setCode(page, CODE);

  await word(page, "sin", 0).click();
  await page.keyboard.press("F2");
  await expect(page.locator(".ss-editor-message")).toHaveText("sin is part of GLSL.");
  await expect(page.getByRole("textbox", {name: /^New name/})).toHaveCount(0);

  await word(page, "w", 0).click();
  await page.keyboard.press("F2");
  const input = page.getByRole("textbox", {name: "New name for w"});
  await input.fill("x");
  await input.press("Escape");
  await expect(input).toHaveCount(0);
  expect((await editorCode(page)).split("\n")[4]).toBe("  float w = wave(0.5) + wave(0.25);");
  expect(errors).toEqual([]);
});

test("The popup on a name links to Find references and Rename", async ({page, context}) => {
  const errors = await offline(context);
  await page.goto("./#new");
  await setCode(page, CODE);

  await word(page, "wave", 1).click();
  const popup = page.locator(".ss-popup");
  await expect(popup).toContainText("Shift-F12");
  await popup.getByRole("button", {name: "Find references"}).click();
  await expect(popup).toHaveCount(0);
  await expect(openPanel(page).locator(".ss-reference")).toHaveCount(3);

  await word(page, "wave", 1).click();
  await popup.getByRole("button", {name: "Rename"}).click();
  const input = page.getByRole("textbox", {name: "New name for wave"});
  await input.fill("ripple");
  await input.press("Enter");
  expect(await editorCode(page)).toBe(CODE.replaceAll("wave", "ripple"));
  expect(errors).toEqual([]);
});

test("Long code has a minimap: a click on it scrolls there, and dragging its box scrolls along", async ({page, context}) => {
  const errors = await offline(context);
  await page.goto("./#new");
  const minimap = page.locator(".ss-code-editor:not([hidden]) .cm-minimap");
  await expect(page.locator(OPEN_EDITOR)).toBeVisible();
  await expect(minimap).toHaveCount(0);

  const lines = Array.from({length: 300}, (_, i) => `  float v${i} = ${i}.0 * sin(iTime);`);
  await setCode(page, `void mainImage(out vec4 fragColor, in vec2 fragCoord) {\n${lines.join("\n")}\n  fragColor = vec4(v0);\n}`);
  await expect(minimap).toBeVisible();
  const scroller = page.locator(".ss-code-editor:not([hidden]) .cm-scroller");
  await scroller.evaluate(el => el.scrollTop = 0);
  const scrollTop = () => scroller.evaluate(el => el.scrollTop);
  const maxScroll = await scroller.evaluate(el => el.scrollHeight - el.clientHeight);

  // Its bottom is the code's end.
  const box = (await minimap.boundingBox())!;
  const x = box.x + box.width / 2;
  const from = box.y + box.height - 4;
  await page.mouse.click(x, from);
  await expect.poll(scrollTop).toBeGreaterThan(0.95 * maxScroll);
  await expect(page.locator(OPEN_EDITOR)).toContainText("float v299 =");

  // Dragging the box back up scrolls back to the top.
  await page.mouse.move(x, from);
  await page.mouse.down();
  await page.mouse.move(x, from - 200, {steps: 5});
  await page.mouse.move(x, box.y - 50, {steps: 5});
  await page.mouse.up();
  await expect.poll(scrollTop).toBe(0);

  // Short code doesn't need one.
  await setCode(page, "void mainImage(out vec4 fragColor, in vec2 fragCoord) {\n  fragColor = vec4(1.);\n}");
  await expect(minimap).toHaveCount(0);
  expect(errors).toEqual([]);
});
