// The in-app tutorial: opens in a new animation, notices when a step is done, and has a Learn pane on phones.
import { devices, expect, test } from '@playwright/test';

import { canvasCenter, editorCode, near, offline } from './helpers';

test.beforeEach(async ({context}) => {
  // about:blank has no storage, so skip it there.
  await context.addInitScript(() => {
    if (window.location.protocol.startsWith("http")) {
      window.localStorage.setItem("smoothstep.tour", "taken");
    }
  });
});

test("the tutorial puts code in the editor, notices the build, and moves on", async ({page, context}) => {
  const errors = await offline(context);
  await page.goto("./");
  await page.getByRole("dialog").getByRole("link", {name: "Getting started tutorial"}).click();
  await expect(page).toHaveURL(/#tutorial$/);
  await expect(page.locator("#titleInput")).toHaveValue("Tutorial: Colour from position");

  const panel = page.getByRole("complementary", {name: "Tutorial"});
  await expect(panel.getByText("Step 1 of 3")).toBeVisible();
  const status = panel.getByRole("status");
  await expect(status).not.toHaveAttribute("data-done");

  await panel.getByRole("button", {name: "Put this in the editor"}).click();
  await expect.poll(() => editorCode(page)).toContain("fragColor = vec4(uv.x, uv.y, 0.6, 1.0);");
  await expect(panel.getByRole("button", {name: "In the editor"})).toBeDisabled();
  await page.getByRole("button", {name: "Build"}).click();
  await expect(status).toHaveAttribute("data-done", "true");
  await expect(status).toContainText("Done.");
  expect(near(await canvasCenter(page), [128, 128, 153])).toBe(true);
  await expect(panel.getByRole("button", {name: "Next"})).toHaveAttribute("data-variant", "filled");

  await panel.getByRole("button", {name: "Next"}).click();
  await expect(panel.getByText("Step 2 of 3")).toBeVisible();
  await expect(panel.getByRole("heading", {name: "Pick a colour"})).toBeVisible();
  await expect(status).not.toHaveAttribute("data-done");

  // The lesson picker lists all eight lessons.
  await panel.getByRole("button", {name: "Choose a lesson"}).click();
  await expect(page.getByRole("menuitem")).toHaveCount(8);
  await page.keyboard.press("Escape");

  // Progress is remembered, and a lesson link opens that lesson in a new animation.
  await page.goto("about:blank");
  await page.goto("./#tutorial");
  await expect(panel.getByText("Step 2 of 3")).toBeVisible();
  await page.goto("about:blank");
  await page.goto("./#tutorial/2");
  await expect(page.locator("#titleInput")).toHaveValue("Tutorial: Moving with time");
  await expect(panel.getByRole("heading", {name: "Animate with iTime"})).toBeVisible();

  // Closing it leaves an ordinary new animation.
  await panel.getByRole("button", {name: "Close tutorial"}).click();
  await expect(panel).toHaveCount(0);
  await expect(page).toHaveURL(/#new$/);
  expect(errors).toEqual([]);
});

// Pixel 7 without its browser type, which can't be set inside a describe.
const {viewport, userAgent, deviceScaleFactor, isMobile, hasTouch} = devices['Pixel 7'];
const pixel7 = {viewport, userAgent, deviceScaleFactor, isMobile, hasTouch};

test.describe("on a phone", () => {
  test.use(pixel7);

  test("the tutorial is a Learn pane", async ({page, context}) => {
    const errors = await offline(context);
    await page.goto("./#tutorial");
    const panes = page.locator(".mobileTabs");
    await expect(panes.getByText("Learn", {exact: true})).toBeVisible();
    const panel = page.getByRole("complementary", {name: "Tutorial"});
    await expect(panel.getByText("Step 1 of 3")).toBeVisible();
    await expect(page.locator(".cm-content")).toBeHidden();

    // Putting code in shows the editor, ready to build.
    await panel.getByRole("button", {name: "Put this in the editor"}).tap();
    await expect(page.locator(".cm-content")).toBeVisible();
    await expect(panel).toBeHidden();
    await page.getByRole("button", {name: "Build"}).tap();
    await panes.getByText("Learn", {exact: true}).tap();
    await expect(panel.getByRole("status")).toHaveAttribute("data-done", "true");
    expect(errors).toEqual([]);
  });
});
