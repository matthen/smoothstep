// Menu paths and web addresses in the code are links.
import { expect, test } from '@playwright/test';

import { offline, setCode } from './helpers';

test.beforeEach(async ({context}) => {
  await context.addInitScript(() => {
    if (window.location.protocol.startsWith("http")) {
      window.localStorage.setItem("smoothstep.tour", "taken");
    }
  });
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
  await expect(page.getByRole("dialog", {name: "Keyboard shortcuts"})).toBeVisible();
  await page.keyboard.press("Escape");
  await page.locator(".cm-link", {hasText: "Textures"}).click();
  await expect(page.getByRole("tab", {name: "Textures"})).toHaveAttribute("aria-selected", "true");

  // In an example with buffers, a link to another code tab opens it.
  await page.goto("./#example/5c81f0d3a7e2");
  await page.locator(".cm-content:visible .cm-link", {hasText: "iBuffer1"}).first().click();
  await expect(page.getByRole("tab", {name: "iBuffer1"})).toHaveAttribute("aria-selected", "true");
  await page.locator(".cm-content:visible .cm-link", {hasText: "Image"}).click();
  await expect(page.getByRole("tab", {name: "Image"})).toHaveAttribute("aria-selected", "true");

  await page.goto("./#new");
  await setCode(page, "// https://example.com/\nvoid mainImage(out vec4 fragColor, in vec2 fragCoord) {\n  fragColor = vec4(1.);\n}");
  await context.route("https://example.com/**", route => route.fulfill({body: "example"}));
  const popup = page.waitForEvent("popup");
  await page.locator(".cm-link", {hasText: "https://example.com/"}).click();
  expect((await popup).url()).toBe("https://example.com/");
  expect(errors).toEqual([]);
});
