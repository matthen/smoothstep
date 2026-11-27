// Help → Keyboard shortcuts and Help → Shader inputs, and the one-time tips shown while you work.
import { expect, test, type Page } from '@playwright/test';

import { docsPanel, offline, setCode, skipTour } from './helpers';

test.beforeEach(async ({context}) => {
  await skipTour(context);
});

async function helpMenu(page: Page, item: string) {
  await page.getByRole("button", {name: "Help"}).click();
  await page.getByRole("menuitem", {name: item}).click();
}

test("Help opens the docs, the shader inputs and the keyboard shortcuts in the Docs tab", async ({page, context}) => {
  const errors = await offline(context);
  await page.goto("./");
  await page.getByRole("button", {name: "Continue"}).click();
  await page.getByRole("button", {name: "Help"}).click();
  await expect(page.getByRole("menu")).toContainText(
    "DocumentationShader inputsKeyboard shortcutsTutorialTake the tourWelcomeSource code");
  await page.keyboard.press("Escape");

  const reference = docsPanel(page);
  await helpMenu(page, "Keyboard shortcuts");
  await expect(reference.getByRole("row", {name: /build the code/})).toContainText("Shift + Enter");
  await expect(reference.getByRole("row", {name: /play or pause/})).toContainText("Space");

  await helpMenu(page, "Shader inputs");
  await expect(reference.getByRole("heading", {name: "Reference", level: 1})).toBeVisible();
  await expect(reference.getByRole("row", {name: /^sampler2D iPrevFrame/})).toContainText("drawn just before");
  await expect(reference.getByRole("row", {name: /^float iFloat0/})).toContainText("iFloat15");
  await expect(reference.getByRole("row", {name: /^number\[\] floats/})).toContainText("iFloat0");
  await expect(reference.getByRole("row", {name: /^sampler2D iCanvas2D/})).toBeVisible();

  // Links in code comments to what used to be dialogs open their pages.
  await page.getByRole("tab", {name: "Image.glsl"}).click();
  await setCode(page, "// [Help → Acknowledgements] and [Help → Shader inputs]\n");
  await page.locator(".cm-link", {hasText: "Help → Acknowledgements"}).click();
  await expect(reference.getByRole("heading", {name: "Acknowledgements", level: 1})).toBeVisible();
  await expect(reference).toContainText("planck.js (MIT licence)");
  await page.getByRole("tab", {name: "Image.glsl"}).click();
  await page.locator(".cm-link", {hasText: "Help → Shader inputs"}).click();
  await expect(reference.getByRole("heading", {name: "Reference", level: 1})).toBeVisible();
  await page.getByLabel("Close the docs").click();

  // The tutorial's last step links to both.
  await page.goto("./#tutorial/share");
  const panel = page.getByRole("complementary", {name: "Tutorial"});
  while (!await panel.getByRole("heading", {name: "Keep learning"}).isVisible()) {
    await panel.getByRole("button", {name: "Next"}).click();
  }
  await panel.getByRole("button", {name: "Shader inputs"}).click();
  await expect(reference.getByRole("heading", {name: "Reference", level: 1})).toBeVisible();
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
  await page.route(/\/assets\/ReferencePanel-.*\.js$/, route =>
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

test("Help → Install as an app shows once the browser offers to install the app, and asks it to", async ({page, context}) => {
  const errors = await offline(context);
  await page.goto("./#new");
  const install = page.getByRole("menuitem", {name: "Install as an app"});
  await page.getByRole("button", {name: "Help"}).click();
  await expect(page.getByRole("menuitem", {name: "Documentation"})).toBeVisible();
  await expect(install).toHaveCount(0);
  await page.keyboard.press("Escape");

  // The offer Chromium makes when the app can be installed.
  const shown = await page.evaluate(() => {
    const offer = Object.assign(new Event("beforeinstallprompt", {cancelable: true}), {
      prompt: () => {
        (window as {prompted?: boolean}).prompted = true;
        return Promise.resolve();
      },
    });
    // Cancelled, so the browser shows no banner of its own.
    return window.dispatchEvent(offer);
  });
  expect(shown).toBe(false);
  await helpMenu(page, "Install as an app");
  expect(await page.evaluate(() => (window as {prompted?: boolean}).prompted)).toBe(true);
  // Each offer can be used once.
  await page.getByRole("button", {name: "Help"}).click();
  await expect(page.getByRole("menuitem", {name: "Documentation"})).toBeVisible();
  await expect(install).toHaveCount(0);
  expect(errors).toEqual([]);
});
