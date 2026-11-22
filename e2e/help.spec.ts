// Help → Keyboard shortcuts and Help → Shader inputs, and the one-time tips shown while you work.
import { expect, test, type Page } from '@playwright/test';

import { offline, setCode, skipTour } from './helpers';

test.beforeEach(async ({context}) => {
  await skipTour(context);
});

async function helpMenu(page: Page, item: string) {
  await page.getByRole("button", {name: "Help"}).click();
  await page.getByRole("menuitem", {name: item}).click();
}

test("Help opens the keyboard shortcuts and the shader inputs", async ({page, context}) => {
  const errors = await offline(context);
  await page.goto("./");
  await page.getByRole("button", {name: "Continue"}).click();

  await helpMenu(page, "Keyboard shortcuts");
  const shortcuts = page.getByRole("dialog", {name: "Keyboard shortcuts"});
  await expect(shortcuts.getByRole("row", {name: /Build the code/})).toContainText("Shift+Enter");
  await expect(shortcuts.getByRole("row", {name: /Play or pause/})).toContainText("Space");
  await page.keyboard.press("Escape");
  await expect(shortcuts).toBeHidden();

  await helpMenu(page, "Shader inputs");
  const inputs = page.getByRole("dialog", {name: "Shader inputs"});
  await expect(inputs.getByRole("row", {name: /iPrevFrame/})).toContainText("sampler2D");
  await expect(inputs.getByRole("row", {name: /iFloat0/})).toContainText("iFloat15");
  await inputs.getByRole("button", {name: "Close"}).click();
  await expect(inputs).toBeHidden();

  // The tutorial's last step links to both.
  await page.goto("./#tutorial/9");
  const panel = page.getByRole("complementary", {name: "Tutorial"});
  while (!await panel.getByRole("heading", {name: "Keep learning"}).isVisible()) {
    await panel.getByRole("button", {name: "Next"}).click();
  }
  await panel.getByRole("button", {name: "Shader inputs"}).click();
  await expect(inputs).toBeVisible();
  expect(errors).toEqual([]);
});

test("a compile error shows a tip once, which can turn tips off", async ({page, context}) => {
  const errors = await offline(context, {tips: true});
  await page.goto("./");
  await page.getByRole("button", {name: "Continue"}).click();

  // The first build, of the code as it opened, shows nothing.
  const tip = page.locator(".tipNotification");
  await page.waitForTimeout(500);
  await expect(tip).toHaveCount(0);

  await setCode(page, "void mainImage(out vec4 fragColor, in vec2 fragCoord) {\n  fragColor = oops;\n}\n");
  await page.keyboard.press("Shift+Enter");
  await expect(tip).toContainText("Your code didn't build");
  await expect(page.locator(".ss-line-error").first()).toBeVisible();

  // Seen once, it doesn't come back.
  await page.goto("about:blank");
  await page.goto("./");
  await page.getByRole("button", {name: "Continue"}).click();
  await setCode(page, "void mainImage(out vec4 fragColor, in vec2 fragCoord) {\n  fragColor = oops;\n}\n");
  await page.keyboard.press("Shift+Enter");
  await expect(page.locator(".ss-line-error").first()).toBeVisible();
  await page.waitForTimeout(500);
  await expect(tip).toHaveCount(0);

  // A first save shows the next tip, which can turn the rest off.
  await page.keyboard.press("ControlOrMeta+s");
  await expect(tip).toContainText("Saved in this browser");
  await tip.getByRole("button", {name: "Don't show tips"}).click();
  await expect(tip).toHaveCount(0);
  expect(await page.evaluate(() => window.localStorage.getItem("smoothstep.tips"))).toBe("off");
  expect(errors).toEqual([]);
});

test("a part of the app that's gone after an update reloads the page, then explains", async ({page, context}) => {
  await offline(context);
  // An older page asking for a file the new version doesn't have gets the app's HTML instead.
  await page.route(/\/assets\/KeyboardShortcuts-.*\.js$/, route =>
    route.fulfill({contentType: "text/html", body: "<!doctype html>"}));
  let loads = 0;
  page.on("load", () => loads++);
  await page.goto("./#new");
  await expect(page.locator("#canvas")).toBeVisible();

  await helpMenu(page, "Keyboard shortcuts");
  await expect.poll(() => loads).toBe(2);
  await expect(page.locator("#canvas")).toBeVisible();

  // A second failure soon after doesn't reload again.
  await helpMenu(page, "Keyboard shortcuts");
  await expect(page.getByText(/a new version came out while this page was open/)).toBeVisible();
  expect(loads).toBe(2);
});
