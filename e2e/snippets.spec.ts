// Snippets in the completion list: each inserts with its Tab stops, and the code it makes builds.
import { expect, test, type Page } from '@playwright/test';

import { addTab, editorCode, offline, OPEN_EDITOR, setCode, skipTour } from './helpers';

test.beforeEach(async ({context}) => {
  await skipTour(context);
});

// Types `typed` and picks the snippet called `label` from the completions.
async function snippet(page: Page, typed: string, label: string) {
  await page.keyboard.type(typed);
  const option = page.locator(".cm-tooltip-autocomplete li.ss-snippet-option")
    .filter({has: page.locator(".cm-completionLabel", {hasText: new RegExp(`^${label}$`)})});
  await expect(page.locator(".cm-tooltip-autocomplete completion-section")).toHaveText("Snippets");
  // The list updates as each letter's completions arrive, so let it settle before clicking.
  await page.waitForTimeout(400);
  await option.click();
  await expect(page.locator(".cm-tooltip-autocomplete")).toBeHidden();
}

async function tab(page: Page, times: number) {
  for (let i = 0; i < times; i++) {
    await page.keyboard.press("Tab");
  }
}

async function clear(page: Page) {
  await setCode(page, "");
  await page.keyboard.press("Delete");
}

async function expectBuilds(page: Page) {
  await page.keyboard.press("Shift+Enter");
  await expect(page.getByRole("button", {name: "Build"})).toBeHidden();
  await expect(page.locator(".ss-line-error")).toHaveCount(0);
}

test("Canvas2D snippets insert with Tab stops, and build", async ({page, context}) => {
  const errors = await offline(context);
  await page.goto("./#new");
  await addTab(page, "Add the Canvas2D layer");
  await clear(page);

  await snippet(page, "draw", "draw");
  await snippet(page, "drawList", "drawList");
  // The first field is selected, so typing replaces it.
  await page.keyboard.type("tomato");
  await tab(page, 3);
  await page.keyboard.press("Enter");
  await snippet(page, "trail", "trail");
  await tab(page, 1);
  await page.keyboard.press("Enter");
  await snippet(page, "textures", "textures");
  await tab(page, 1);
  const code = await editorCode(page);
  expect(code).toContain('Set({fillStyle: "tomato"})');
  expect(code).toMatch(/\]\);\n {2}\/\/ Rub out.*\n(.*\n){4} {2}const image = textures\[0\];/);
  await expectBuilds(page);

  await clear(page);
  await snippet(page, "planck", "planck");
  await tab(page, 2);
  expect(await editorCode(page)).toMatch(/^import planck from "planck";\n\nlet world, ball;/);
  await expectBuilds(page);

  await setCode(page, "function draw(ctx, {data}) {\n  clear(ctx);\n  ctx.fillText(data.sides, 100, 100);\n}\n");
  await page.keyboard.press("ControlOrMeta+End");
  await snippet(page, "setup", "setup");
  await tab(page, 2);
  await expectBuilds(page);
  expect(errors).toEqual([]);
});

test("GLSL snippets insert with Tab stops, and build", async ({page, context}) => {
  const errors = await offline(context);
  await page.goto("./#new");
  await page.locator(OPEN_EDITOR).click();

  for (const [typed, label, fields] of [["mainIm", "mainImage", 1], ["raym", "raymarch", 1], ["feed", "feedback", 2]] as const) {
    await clear(page);
    await snippet(page, typed, label);
    await tab(page, fields);
    await expectBuilds(page);
  }

  await setCode(page, "void mainImage(out vec4 fragColor, in vec2 fragCoord) {\n  vec3 col = vec3(0.2);\n\n" +
    "  fragColor = vec4(col, 1.0);\n}");
  await page.keyboard.press("ControlOrMeta+Home");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.type("  ");
  await snippet(page, "iCanv", "iCanvas2D");
  expect(await editorCode(page)).toContain("  col = col * (1.0 - drawn.a) + drawn.rgb;\n  fragColor");
  await expectBuilds(page);

  // In a buffer, the feedback loop reads that buffer.
  await addTab(page, "Add a buffer");
  await clear(page);
  await snippet(page, "feed", "feedback");
  expect(await editorCode(page)).toContain("texture(iBuffer0, uv)");
  await tab(page, 2);
  await expectBuilds(page);
  expect(errors).toEqual([]);
});
