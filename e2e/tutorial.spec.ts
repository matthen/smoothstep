// The in-app tutorial: opens in a new animation, notices when a step is done, and has a Learn pane on phones.
import { devices, expect, test } from '@playwright/test';

import { addTab, canvasCenter, editorCode, near, offline, skipTour } from './helpers';

test.beforeEach(async ({context}) => {
  await skipTour(context);
});

test("the tutorial puts code in the editor, notices the build, and moves on", async ({page, context}) => {
  const errors = await offline(context);
  await page.goto("./");
  await page.getByRole("dialog").getByRole("link", {name: "Tutorial", exact: true}).click();
  await expect(page).toHaveURL(/#tutorial$/);
  await expect(page.locator("#titleInput")).toHaveValue("Tutorial: Colour from position");

  const panel = page.getByRole("complementary", {name: "Tutorial"});
  await expect(panel.getByText("Step 1 of 4")).toBeVisible();
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
  await expect(panel.getByText("Step 2 of 4")).toBeVisible();
  await expect(panel.getByRole("heading", {name: "Pick a colour"})).toBeVisible();
  await expect(status).not.toHaveAttribute("data-done");

  // The lesson picker lists all nine lessons.
  await panel.getByRole("button", {name: "Choose a lesson"}).click();
  await expect(page.getByRole("menuitem")).toHaveCount(9);
  await page.keyboard.press("Escape");

  // The lesson is remembered, and starts again from its first step in the new animation; a lesson
  // link opens that lesson.
  await page.goto("about:blank");
  await page.goto("./#tutorial");
  await expect(panel.getByText("Step 1 of 4")).toBeVisible();
  await page.goto("about:blank");
  await page.goto("./#tutorial/2");
  await expect(page.locator("#titleInput")).toHaveValue("Tutorial: Moving with time");
  await expect(panel.getByRole("heading", {name: "Animate with iTime"})).toBeVisible();

  // A lesson's challenges keep their hints hidden until asked for, and again on the next visit.
  await panel.getByRole("button", {name: /Challenges$/}).click();
  await expect(panel.getByRole("heading", {name: "Challenges"})).toBeVisible();
  const hints = panel.getByRole("region", {name: "Hints"});
  await expect(hints).toHaveCount(0);
  await panel.getByRole("button", {name: "Show hints"}).click();
  await expect(hints).toContainText("iDuration");
  await panel.getByRole("button", {name: "Next"}).click();
  await panel.getByRole("button", {name: "Back"}).click();
  await expect(hints).toHaveCount(0);

  // Closing it leaves an ordinary new animation.
  await panel.getByRole("button", {name: "Close tutorial"}).click();
  await expect(panel).toHaveCount(0);
  await expect(page).toHaveURL(/#new$/);
  expect(errors).toEqual([]);
});

test("the buffers lesson adds a buffer, fills several tabs, and checks every tab's code", async ({page, context}) => {
  const errors = await offline(context);
  await page.goto("./#tutorial/8");
  const panel = page.getByRole("complementary", {name: "Tutorial"});
  const status = panel.getByRole("status");
  const next = () => panel.getByRole("button", {name: "Next"}).click();
  const tab = (name: string) => page.getByRole("tab", {name: new RegExp("^" + name)});

  // Add a buffer.
  await expect(panel.getByRole("heading", {name: "Add a buffer"})).toBeVisible();
  await addTab(page, "Add a buffer");
  await expect(status).toHaveAttribute("data-done", "true");

  // The buffer's code goes in its tab. The image doesn't read it yet, so the canvas stays as it was.
  await next();
  await panel.getByRole("button", {name: "Put this in the editor"}).click();
  await expect(tab("iBuffer0.glsl")).toHaveAttribute("aria-selected", "true");
  await page.getByRole("button", {name: "Build"}).click();
  await expect(status).toHaveAttribute("data-done", "true");

  // The image shows the heat.
  await next();
  await panel.getByRole("button", {name: "Put this in the editor"}).click();
  await expect(tab("Image.glsl")).toHaveAttribute("aria-selected", "true");
  await page.getByRole("button", {name: "Build"}).click();
  await page.locator(".playerButtons button").nth(1).click();
  await expect(status).toHaveAttribute("data-done", "true");

  await next();
  await panel.getByRole("button", {name: "Put this in the editor"}).click();
  await page.getByRole("button", {name: "Build"}).click();
  await expect(status).toHaveAttribute("data-done", "true");

  // One button fills the shared.glsl tab, the buffer and the image.
  await next();
  await expect(panel.locator(".learnCodeTab")).toHaveText(["shared.glsl", "iBuffer0.glsl", "Image.glsl"]);
  await panel.getByRole("button", {name: "Put this in the editor"}).click();
  await expect(tab("shared.glsl")).toBeVisible();
  await page.getByRole("button", {name: "Build"}).click();
  await expect(status).toHaveAttribute("data-done", "true");
  // Every tab compiled.
  await expect(page.locator(".shaderTab[data-error]")).toHaveCount(0);
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
    await expect(panel.getByText("Step 1 of 4")).toBeVisible();
    await expect(page.locator(".cm-content")).toBeHidden();

    // Putting code in shows the editor, ready to build.
    await panel.getByRole("button", {name: "Put this in the editor"}).tap();
    await expect(page.locator(".cm-content")).toBeVisible();
    await expect(panel).toBeHidden();
    await page.getByRole("button", {name: "Build"}).tap();
    // The Learn tab ticks once the step is done, until you go back to it.
    await expect(panes.getByLabel("step done")).toBeVisible();
    await panes.getByText("Learn", {exact: true}).tap();
    await expect(panel.getByRole("status")).toHaveAttribute("data-done", "true");
    await expect(panes.getByLabel("step done")).toBeHidden();
    expect(errors).toEqual([]);
  });
});
