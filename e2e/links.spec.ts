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

test("clicking a menu path in a comment opens it, and a web address opens in a new tab", async ({page, context}) => {
  const errors = await offline(context);
  await page.goto("./");
  await page.getByRole("button", {name: "Continue"}).click();
  await page.locator(".cm-link", {hasText: "Help → Tutorial"}).click();
  await expect(page).toHaveURL(/#tutorial$/);

  await page.goto("./#new");
  await setCode(page, "// Help → Keyboard shortcuts and https://example.com/\n" +
    "void mainImage(out vec4 fragColor, in vec2 fragCoord) {\n  fragColor = vec4(1.);\n}");
  await page.locator(".cm-link", {hasText: "Help → Keyboard shortcuts"}).click();
  await expect(page.getByRole("dialog", {name: "Keyboard shortcuts"})).toBeVisible();
  await page.keyboard.press("Escape");

  await context.route("https://example.com/**", route => route.fulfill({body: "example"}));
  const popup = page.waitForEvent("popup");
  await page.locator(".cm-link", {hasText: "https://example.com/"}).click();
  expect((await popup).url()).toBe("https://example.com/");
  expect(errors).toEqual([]);
});
