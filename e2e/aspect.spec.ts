// The aspect ratio menu in the play bar, including a custom ratio that's saved with the animation.
import { expect, test } from '@playwright/test';

import { offline, skipTour } from './helpers';

test.beforeEach(async ({context}) => {
  await skipTour(context);
});

test("a custom aspect ratio shapes the canvas and is saved", async ({page, context}) => {
  const errors = await offline(context);
  await page.goto("./#new");
  const canvas = page.locator("#canvas");
  await expect(canvas).toBeVisible();
  const ratio = () => canvas.evaluate(c => c.clientWidth / c.clientHeight);

  await page.getByLabel("Aspect ratio").selectOption({label: "Custom…"});
  await page.getByLabel("Ratio width").fill("21");
  await page.getByLabel("Ratio height").fill("9");
  await page.getByRole("button", {name: "Use"}).click();
  await expect.poll(ratio).toBeCloseTo(21 / 9, 1);
  await expect(page.getByLabel("Aspect ratio")).toHaveValue("21_9");

  await page.getByRole("button", {name: "Save"}).click();
  await expect(page).toHaveURL(/#anim\//);
  await page.reload();
  await expect(page.getByLabel("Aspect ratio")).toHaveValue("21_9");
  await expect.poll(ratio).toBeCloseTo(21 / 9, 1);
  expect(errors).toEqual([]);
});

test.describe("on a small laptop screen", () => {
  test.use({viewport: {width: 1280, height: 720}});

  test("a tall canvas still leaves the scrub bar room, with every control on screen", async ({page, context}) => {
    const errors = await offline(context);
    await page.goto("./#new");
    await page.getByLabel("Aspect ratio").selectOption("9_16");
    await expect.poll(async () => (await page.locator("#canvas").boundingBox())!.height).toBeGreaterThan(
      (await page.locator("#canvas").boundingBox())!.width);
    expect((await page.locator("div.slider").boundingBox())!.width).toBeGreaterThan(60);
    await expect(page.getByRole("button", {name: "Full screen"})).toBeInViewport({ratio: 1});
    expect(errors).toEqual([]);
  });
});

test.describe("on a phone held sideways", () => {
  test.use({viewport: {width: 750, height: 342}, hasTouch: true, isMobile: true});

  test("the full screen button is on screen and opens full screen", async ({page, context}) => {
    const errors = await offline(context);
    await page.goto("./#new");
    const full = page.getByRole("button", {name: "Full screen"});
    await expect(full).toBeInViewport({ratio: 1});
    await full.tap();
    await expect(page.getByRole("button", {name: "Exit full screen"})).toBeInViewport({ratio: 1});
    expect((await page.locator("div.slider").boundingBox())!.width).toBeGreaterThan(60);
    expect(errors).toEqual([]);
  });
});
