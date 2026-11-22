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
