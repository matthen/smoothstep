// The Docs tab shows the docs in place of the code, and the docs site works on its own, offline.
import { expect, test, type Page } from '@playwright/test';

import { addTab, docsPanel, docsTab, editorCode, offline, OPEN_EDITOR, setCode, skipTour } from './helpers';

test.beforeEach(async ({context}) => {
  await skipTour(context);
});

async function openDocumentation(page: Page) {
  await page.getByRole("button", {name: "Help"}).click();
  await page.getByRole("menuitem", {name: "Documentation"}).click();
  const panel = docsPanel(page);
  await expect(panel).toBeVisible();
  await expect(docsTab(page)).toHaveAttribute("aria-selected", "true");
  return panel;
}

test("Help → Documentation opens the Docs tab, to search and insert from", async ({page, context}) => {
  const errors = await offline(context);
  await page.goto("./#new");
  await setCode(page, "// My animation\n");
  const url = page.url();
  await expect(docsTab(page)).toHaveCount(0);

  const panel = await openDocumentation(page);
  await expect(panel.getByRole("heading", {name: "smoothstep.io documentation"})).toBeVisible();
  // The docs take the code's place, and the animation stays as it was.
  expect(page.url()).toBe(url);
  await expect(page.locator(OPEN_EDITOR)).toHaveCount(0);
  await expect(page.getByRole("button", {name: "Build"})).toBeHidden();
  await page.getByRole("tab", {name: "Image.glsl"}).click();
  await expect(panel).toBeHidden();
  expect(await editorCode(page)).toContain("// My animation");
  await docsTab(page).click();
  await expect(panel).toBeVisible();

  // Search finds a page, and a result opens it at its heading.
  await panel.getByRole("textbox", {name: "Search the docs"}).fill("planck");
  const result = panel.getByRole("list", {name: "Search results"}).getByRole("button").first();
  await expect(result).toContainText("The Canvas2D layer › Libraries");
  await result.click();
  await expect(panel.getByRole("button", {name: "Choose a page"})).toHaveText("The Canvas2D layer");

  // JavaScript can't go in the Image.glsl tab; GLSL can, and Insert goes back to the code.
  const jsBlock = panel.locator('.doc-code[data-lang="js"]').first();
  await expect(jsBlock.getByRole("button", {name: "Insert this JavaScript"})).toBeDisabled();
  await expect(jsBlock).toContainText("Add the Canvas2D layer to insert");
  const glslBlock = panel.locator('.doc-code[data-lang="glsl"]').first();
  const inserted = (await glslBlock.locator("pre").innerText()).split("\n")[0]!;
  await glslBlock.getByRole("button", {name: "Insert this GLSL"}).click();
  await expect(panel).toBeHidden();
  await expect(page.getByRole("tab", {name: "Image.glsl"})).toHaveAttribute("aria-selected", "true");
  expect(await editorCode(page)).toContain(inserted);
  await expect(page.locator(OPEN_EDITOR)).toBeFocused();

  // From the Canvas2D.js tab, JavaScript goes in at its cursor.
  await addTab(page, "Add the Canvas2D layer");
  await setCode(page, "");
  await docsTab(page).click();
  const js = await jsBlock.locator("pre").innerText();
  await jsBlock.getByRole("button", {name: "Insert this JavaScript"}).click();
  await expect(page.getByRole("tab", {name: "Canvas2D.js"})).toHaveAttribute("aria-selected", "true");
  expect(await editorCode(page)).toBe(js.replace(/\n$/, ""));

  // A link to another page opens it in the tab; its own link opens the docs site.
  await docsTab(page).click();
  await panel.getByRole("button", {name: "Choose a page"}).click();
  await page.getByRole("menuitem", {name: "Keyboard Shortcuts"}).click();
  await expect(panel.getByRole("heading", {name: "Editor helpers"})).toBeVisible();
  await expect(panel.getByRole("link", {name: "Open the docs in a new tab"}))
    .toHaveAttribute("href", /docs\/keyboard-shortcuts\.html$/);
  await page.getByLabel("Close the docs").click();
  await expect(docsTab(page)).toHaveCount(0);
  await expect(panel).toHaveCount(0);
  await expect(page.getByRole("tab", {name: "Canvas2D.js"})).toHaveAttribute("aria-selected", "true");
  expect(errors).toEqual([]);
});

test("a popup's docs link and a missing-function error open the right section", async ({page, context}) => {
  const errors = await offline(context);
  await page.goto("./#new");
  await page.locator(OPEN_EDITOR).getByText("iTime", {exact: true}).first().click();
  const popup = page.locator(".cm-tooltip.ss-popup");
  await popup.getByRole("link", {name: "In the docs"}).click();
  const panel = docsPanel(page);
  await expect(panel.getByRole("heading", {name: "Input Uniforms"})).toBeInViewport();
  await expect(panel.getByRole("button", {name: "Choose a page"})).toHaveText("Coding Specification");

  // Already open, on another page and scrolled down, a link still goes to its heading.
  await panel.locator(".referenceBody").evaluate(body => {body.scrollTop = body.scrollHeight;});
  await addTab(page, "Add the Canvas2D layer");
  await setCode(page, "let x = 1;");
  await page.keyboard.press("Shift+Enter");
  await page.locator(".ss-line-error").getByRole("link", {name: "How draw works"}).click();
  await expect(panel.getByRole("heading", {name: "setup and draw"})).toBeInViewport();
  await panel.locator(".referenceBody").evaluate(body => {body.scrollTop = body.scrollHeight;});
  await page.getByRole("button", {name: "Help"}).click();
  await page.getByRole("menuitem", {name: "Shader inputs"}).click();
  await expect(panel.getByRole("heading", {name: "Reference", level: 1})).toBeInViewport();
  expect(errors).toEqual([]);
});

test("during the tutorial, the docs open in the code's tabs beside the Learn panel", async ({page, context}) => {
  const errors = await offline(context);
  await page.goto("./#tutorial");
  const learn = page.getByRole("complementary", {name: "Tutorial"});
  await expect(learn).toBeVisible();
  await expect(docsTab(page)).toHaveCount(0);
  await openDocumentation(page);
  await expect(learn).toBeVisible();
  await page.getByLabel("Close the docs").click();
  await expect(page.locator(OPEN_EDITOR)).toBeVisible();
  await expect(page).toHaveURL(/#tutorial/);
  expect(errors).toEqual([]);
});

test("a new animation has the Docs tab, until it's closed", async ({page, context}) => {
  const errors = await offline(context, {docs: true});
  // The docs' code loads only when the tab first shows.
  let docsLoaded = false;
  page.on("request", request => {docsLoaded ||= /ReferencePanel/.test(request.url());});
  await page.goto("./");
  await page.getByRole("button", {name: "Continue"}).click();
  await expect(docsTab(page)).toHaveAttribute("aria-selected", "false");
  await expect(page.getByRole("tab", {name: "Image.glsl"})).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(OPEN_EDITOR)).toBeVisible();
  expect(docsLoaded).toBe(false);
  await docsTab(page).click();
  await expect(docsPanel(page).getByRole("heading", {name: "smoothstep.io documentation"})).toBeVisible();
  expect(docsLoaded).toBe(true);
  // Its links are the docs site's pages, so one opened in a new tab works too; clicked, it opens here.
  const link = docsPanel(page).locator(".referenceBody").getByRole("link", {name: "Canvas2D layer"}).first();
  const href = (await link.getAttribute("href"))!;
  expect(href).toMatch(/^docs\/canvas2d\.html/);
  expect((await page.request.get(new URL(href, page.url()).href)).ok()).toBe(true);
  await link.click();
  await expect(docsPanel(page).getByRole("heading", {name: "drawList"})).toBeVisible();

  // Not with an example, or anything else that isn't new.
  await page.goto("./#example/534226b1d5ed");
  await expect(page.locator("#canvas")).toBeVisible();
  await expect(page.getByRole("tab", {name: "Image.glsl"})).toBeVisible();
  await expect(docsTab(page)).toHaveCount(0);

  await page.goto("about:blank");
  await page.goto("./#new");
  await page.getByLabel("Close the docs").click();
  await page.reload();
  await expect(page.getByRole("tab", {name: "Image.glsl"})).toBeVisible();
  await expect(docsTab(page)).toHaveCount(0);

  // Help → Documentation opens them, and new animations have the tab again.
  await openDocumentation(page);
  await page.reload();
  await expect(docsTab(page)).toBeVisible();
  expect(errors).toEqual([]);
});

test("the docs site works offline, at any path", async ({page, context}) => {
  const errors = await offline(context);
  await page.goto("./docs/index.html");
  await expect(page.getByRole("heading", {level: 1})).toHaveText("smoothstep.io documentation");
  const image = page.locator("main img").first();
  await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  await page.locator("main").getByRole("link", {name: "Canvas2D layer"}).first().click();
  await expect(page).toHaveURL(/\/sub\/docs\/canvas2d\.html$/);
  await expect(page.getByRole("heading", {name: "drawList"})).toBeVisible();
  await page.getByRole("link", {name: "Open smoothstep.io"}).click();
  await expect(page).toHaveURL(/\/sub\/$/);
  expect(errors).toEqual([]);
});
