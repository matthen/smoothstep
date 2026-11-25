// Going to a definition with Cmd or Ctrl and a click, or F12: in the same tab and in the shared code.
import { expect, test, type Page } from '@playwright/test';

import { addTab, editorCode, offline, OPEN_EDITOR, setCode, skipTour } from './helpers';

const CODE = `float wave(float t) {
  return sin(t * 6.);
}
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  float w = wave(0.5);
  fragColor = vec4(w);
}`;

// The `nth` use of `name` in the open editor.
const word = (page: Page, name: string, nth: number) =>
  page.locator(OPEN_EDITOR).getByText(name, {exact: true}).nth(nth);

test.beforeEach(async ({context}) => {
  await skipTour(context);
});

test("Ctrl-click goes to a definition, and F12 to the one at the cursor", async ({page, context}) => {
  const errors = await offline(context);
  await page.goto("./#new");
  await setCode(page, CODE);

  // Holding the key underlines a name that can be followed.
  await word(page, "wave", 1).hover();
  await page.keyboard.down("ControlOrMeta");
  await word(page, "wave", 1).hover({position: {x: 2, y: 4}});
  await expect(page.locator(".cm-definition-link")).toHaveText("wave");
  await page.keyboard.up("ControlOrMeta");
  await expect(page.locator(".cm-definition-link")).toHaveCount(0);

  // The click selects the function's name where it's defined, so typing replaces it.
  await word(page, "wave", 1).click({modifiers: ["ControlOrMeta"]});
  await expect(page.locator(".ss-popup")).toHaveCount(0);
  await page.keyboard.type("ripple");
  expect((await editorCode(page)).split("\n")[0]).toBe("float ripple(float t) {");

  // F12 on a parameter's use goes to the parameter.
  await word(page, "t", 1).click();
  await page.keyboard.press("F12");
  await page.keyboard.type("time");
  expect((await editorCode(page)).split("\n")[0]).toBe("float ripple(float time) {");

  // Ctrl-click on a number neither goes anywhere nor opens its picker.
  await word(page, "0.5", 0).click({modifiers: ["ControlOrMeta"]});
  await expect(page.locator(".ss-picker")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("Ctrl-click on a name from the shared code opens that tab at its definition", async ({page, context}) => {
  const errors = await offline(context);
  await page.goto("./#new");
  await setCode(page, "void mainImage(out vec4 fragColor, in vec2 fragCoord) {\n  fragColor = magenta();\n}");
  await addTab(page, "Add shared GLSL code");
  await setCode(page, "// Colours\n\nvec4 magenta() {\n  return vec4(0.86, 0.08, 0.78, 1.);\n}");
  await page.getByRole("tab", {name: /^Image\.glsl/}).click();

  await word(page, "magenta", 0).click({modifiers: ["ControlOrMeta"]});
  await expect(page.getByRole("tab", {name: /^shared\.glsl/})).toHaveAttribute("aria-selected", "true");
  await page.keyboard.type("pink");
  expect((await editorCode(page)).split("\n")[2]).toBe("vec4 pink() {");
  expect(errors).toEqual([]);
});
