// The Console tab: what the Canvas2D code prints, folded when it repeats, and every tab's errors,
// which go to their line when clicked.
import { expect, test, type Page } from '@playwright/test';

import { addTab, offline, OPEN_EDITOR, setCode, skipTour } from './helpers';

const LOGGING = [
  "console.log(\"loaded\", [1, 2], {a: \"b\"});",
  "function draw(ctx, {frame}) {",
  "  clear(ctx);",
  "  console.log(\"tick\");",
  "}",
].join("\n");

const BROKEN_SHADER = [
  "void mainImage(out vec4 fragColor, in vec2 fragCoord) {",
  "  vec2 uv = fragCoord / iResolution.xy;",
  "  fragColor = vec4(uv, missing, 1.0);",
  "}",
].join("\n");

function consoleTab(page: Page) {
  return page.getByRole("tab", {name: /^Console/});
}

function entries(page: Page) {
  return page.getByRole("log", {name: "Console"}).locator(".consoleEntry");
}

// The text of the line the cursor is on in the open editor.
function cursorLine(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const node = document.getSelection()?.anchorNode;
    const element = node instanceof Element ? node : node?.parentElement;
    return element?.closest(".cm-line")?.textContent ?? null;
  });
}

test.beforeEach(async ({context}) => {
  await skipTour(context);
});

test("console.log in the Canvas2D code prints in the Console, with a repeated line folded into a count", async ({page, context}) => {
  const errors = await offline(context);
  await page.goto("./");
  await page.getByRole("button", {name: "Continue"}).click();
  await consoleTab(page).click();
  await expect(page.getByText("console.log in the Canvas2D.js tab prints here")).toBeVisible();

  await addTab(page, "Add the Canvas2D layer");
  await setCode(page, LOGGING);
  await page.keyboard.press("Shift+Enter");
  await expect(entries(page).first()).toHaveText(/^Built( in \d+ ms)?$/);
  await expect(entries(page).filter({hasText: "loaded"})).toContainText('loaded [1, 2] {a: "b"}');

  await page.getByRole("button", {name: "Play"}).click();
  const ticks = entries(page).filter({hasText: "tick"});
  await expect(ticks.locator(".consoleCount")).toHaveText(/^×\d{2,}$/, {timeout: 30_000});
  await page.getByRole("button", {name: "Pause"}).click();
  // Folded, so one line however many steps have drawn, unless a restart or loop line splits them.
  const texts = await entries(page).allTextContents();
  const isTick = (text: string | undefined) => text?.includes("tick") ?? false;
  expect(texts.filter((text, i) => isTick(text) && isTick(texts[i + 1]))).toEqual([]);
  await expect(ticks.last()).toContainText(/frame \d+/);

  // Its place goes to the line that printed it.
  await page.getByRole("tab", {name: /^Image\.glsl/}).click();
  await ticks.last().click();
  await expect(page.getByRole("tab", {name: /^Canvas2D\.js/})).toHaveAttribute("aria-selected", "true");
  await expect.poll(() => cursorLine(page)).toBe("  console.log(\"tick\");");
  expect(errors).toEqual([]);
});

test("a shader error is listed with its tab and line, and clicking it goes there", async ({page, context}) => {
  await offline(context);
  await page.goto("./");
  await page.getByRole("button", {name: "Continue"}).click();
  await addTab(page, "Add the Canvas2D layer");
  await page.getByRole("tab", {name: /^Image\.glsl/}).click();
  await setCode(page, BROKEN_SHADER);
  await page.keyboard.press("Shift+Enter");

  // The Console isn't open, so its tab says there are errors to see, and doesn't open itself.
  await expect(consoleTab(page)).toHaveAttribute("aria-selected", "false");
  await expect(consoleTab(page).getByRole("img", {name: "new errors"})).toBeVisible();
  await consoleTab(page).click();
  await expect(consoleTab(page).getByRole("img", {name: "new errors"})).toHaveCount(0);
  // Its icon stays red while errors are listed.
  await expect(consoleTab(page).locator(".consoleIcon")).toHaveAttribute("data-errors");
  await expect(entries(page).first()).toHaveText("Build failed: 1 error");
  const error = entries(page).filter({hasText: /^Image\.glsl, line 3: .*missing/});
  await expect(error).toHaveCount(1);

  await page.getByRole("tab", {name: /^Canvas2D\.js/}).click();
  await expect(page.locator(OPEN_EDITOR)).not.toContainText("mainImage");
  await error.click();
  await expect(page.getByRole("tab", {name: /^Image\.glsl/})).toHaveAttribute("aria-selected", "true");
  await expect.poll(() => cursorLine(page)).toBe("  fragColor = vec4(uv, missing, 1.0);");
});

test("Canvas2D code with a syntax error makes the build line say it failed", async ({page, context}) => {
  await offline(context);
  await page.goto("./");
  await page.getByRole("button", {name: "Continue"}).click();
  await consoleTab(page).click();
  await addTab(page, "Add the Canvas2D layer");
  await setCode(page, "function draw(ctx) {\n  clear(ctx;\n}");
  await page.keyboard.press("Shift+Enter");
  await expect(entries(page).first()).toHaveText("Build failed: 1 error");
  await expect(entries(page).filter({hasText: /^Canvas2D\.js, line \d+: /})).toHaveCount(1);
});

test("a missing closing brace is one error on the line of the { it should close", async ({page, context}) => {
  await offline(context);
  await page.goto("./");
  await page.getByRole("button", {name: "Continue"}).click();
  await setCode(page, "void mainImage(out vec4 fragColor, in vec2 fragCoord) {\n  fragColor = vec4(1.0);\n");
  await page.keyboard.press("Shift+Enter");
  await consoleTab(page).click();
  await expect(entries(page).first()).toHaveText("Build failed: 1 error");
  await expect(entries(page).nth(1)).toHaveText("Image.glsl, line 1: This { is never closed. Add a } to end it.");
});
