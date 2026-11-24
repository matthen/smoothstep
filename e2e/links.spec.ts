// Menu paths and web addresses in the code are links.
import { expect, test } from '@playwright/test';

import { addTab, docsPanel, offline, setCode, skipTour } from './helpers';

test.beforeEach(async ({context}) => {
  await skipTour(context);
});

test("a link in a comment opens a menu item, a tab or a web address", async ({page, context}) => {
  const errors = await offline(context);
  await page.goto("./");
  await page.getByRole("button", {name: "Continue"}).click();
  await page.locator(".cm-link", {hasText: "Help → Tutorial"}).click();
  await expect(page).toHaveURL(/#tutorial$/);

  await page.goto("./#new");
  await setCode(page, "// [Help → Keyboard shortcuts], the [Textures] tab and https://example.com/\n" +
    "void mainImage(out vec4 fragColor, in vec2 fragCoord) {\n  float a[2] = float[2](0., 1.); // Help → Welcome\n" +
    "  fragColor = vec4(a[1]);\n}");
  // Only bracketed names, and only in comments.
  await expect(page.locator(".cm-link")).toHaveCount(3);
  await page.locator(".cm-link", {hasText: "Help → Keyboard shortcuts"}).click();
  const reference = docsPanel(page);
  await expect(reference.getByRole("heading", {name: "Keyboard Shortcuts", level: 1})).toBeVisible();
  await page.getByRole("tab", {name: "Image.glsl"}).click();
  await page.locator(".cm-link", {hasText: "Textures"}).click();
  await expect(page.getByRole("tab", {name: "Textures"})).toHaveAttribute("aria-selected", "true");

  // In an example with buffers, a link to another code tab opens it.
  await page.goto("./#example/5c81f0d3a7e2");
  await page.locator(".cm-content:visible .cm-link", {hasText: "iBuffer1"}).first().click();
  await expect(page.getByRole("tab", {name: "iBuffer1.glsl"})).toHaveAttribute("aria-selected", "true");
  await page.locator(".cm-content:visible .cm-link", {hasText: "Image"}).click();
  await expect(page.getByRole("tab", {name: "Image.glsl"})).toHaveAttribute("aria-selected", "true");

  await page.goto("./#new");
  await setCode(page, "// https://example.com/\nvoid mainImage(out vec4 fragColor, in vec2 fragCoord) {\n  fragColor = vec4(1.);\n}");
  await context.route("https://example.com/**", route => route.fulfill({body: "example"}));
  const popup = page.waitForEvent("popup");
  await page.locator(".cm-link", {hasText: "https://example.com/"}).click();
  expect((await popup).url()).toBe("https://example.com/");
  expect(errors).toEqual([]);
});

test("a Markdown link into the docs opens the Docs tab at its heading", async ({page, context}) => {
  const errors = await offline(context);
  await page.goto("./#new");
  await setCode(page, "// See [drawList](docs/canvas2d#drawlist), or the [inputs](https://smoothstep.io/docs/reference.html#textures).\n" +
    "void mainImage(out vec4 fragColor, in vec2 fragCoord) {\n  fragColor = vec4(1.);\n}");
  const reference = docsPanel(page);
  await page.locator(".cm-link", {hasText: "drawList"}).click();
  await expect(reference.getByRole("heading", {name: "drawList"})).toBeInViewport();
  await page.getByRole("tab", {name: "Image.glsl"}).click();
  await page.locator(".cm-link", {hasText: "inputs"}).click();
  await expect(reference.getByRole("button", {name: "Choose a page"})).toHaveText("Reference");
  await expect(reference.getByRole("heading", {name: "Textures"})).toBeInViewport();

  // The Canvas2D layer's starter code links to its page.
  await page.getByRole("tab", {name: "Image.glsl"}).click();
  await addTab(page, "Add the Canvas2D layer");
  await page.locator(".cm-content:visible .cm-link", {hasText: "the Canvas2D layer"}).click();
  await expect(reference.getByRole("heading", {name: "The Canvas2D layer", level: 1})).toBeVisible();
  expect(errors).toEqual([]);
});

test("an example is marked until it's saved, and saving keeps a copy as one of your own", async ({page, context}) => {
  const errors = await offline(context);
  await page.goto("./#example/534226b1d5ed");
  const tag = page.locator(".appHeader").getByText("Example", {exact: true});
  await expect(tag).toBeVisible();
  await page.getByRole("button", {name: "File"}).click();
  await page.getByRole("menu").getByText("Save a copy", {exact: true}).click();
  await expect(page.getByText("Saved a copy to your animations.")).toBeVisible();
  await expect(page).toHaveURL(/#anim\/\w+$/);
  await expect(tag).toBeHidden();
  await page.getByRole("button", {name: "File"}).click();
  await expect(page.getByRole("menu").getByText("Save", {exact: true})).toBeVisible();
  expect(errors).toEqual([]);
});
