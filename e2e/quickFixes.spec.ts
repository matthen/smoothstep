// Buttons under compile errors that fix common GLSL mistakes, in real WebGL.
import { expect, test } from '@playwright/test';

import { editorCode, offline, setCode } from './helpers';

test("an int where a float is needed is fixed with a click, and the code builds", async ({page, context}) => {
  const errors = await offline(context);
  await page.goto("./#new");
  await setCode(page, "void mainImage(out vec4 fragColor, in vec2 fragCoord) {\n  float x = 1;\n  fragColor = vec4(x);\n}");
  await page.keyboard.press("Shift+Enter");
  const error = page.locator(".ss-line-error");
  await expect(error).toContainText("cannot convert from 'const int'");
  await error.getByRole("button", {name: "Change 1 to 1.0"}).click();
  // It builds by itself.
  await expect(error).toHaveCount(0);
  await expect(page.getByRole("tab", {name: /^Image/})).not.toHaveAttribute("data-error");
  expect(await editorCode(page)).toContain("  float x = 1.0;");
  expect(errors).toEqual([]);
});
