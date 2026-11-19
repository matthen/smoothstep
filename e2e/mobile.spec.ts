// The phone layout: the canvas on top, and a switch between the code, timeline and textures.
import { devices, expect, test } from '@playwright/test';

import { offline } from './helpers';

test.use(devices['Pixel 7']);

test("on a phone, the panes switch and a transition can be added with two taps", async ({page, context}) => {
  const errors = await offline(context);
  await page.goto("./#new");
  await expect(page.locator("#canvas")).toBeVisible();
  await expect(page.locator(".cm-content")).toBeVisible();
  await expect(page.getByRole("tab", {name: "Animation"})).toBeHidden();

  const panes = page.locator(".mobileTabs");
  await panes.getByText("Timeline", {exact: true}).tap();
  await expect(page.locator(".cm-content")).toBeHidden();
  const row = await page.locator(".timeArea .variableRow").nth(1).boundingBox();
  // Touches can't hover, so the first tap marks the start and the second the end.
  await page.touchscreen.tap(row!.x + 45, row!.y + 10);
  await page.touchscreen.tap(row!.x + 165, row!.y + 10);
  await expect(page.locator(".properties h4")).toHaveText(/iFloat1\s*1\.0 — 4\.1s/);

  // Tapping an existing transition abandons a half-made one and selects it.
  await page.locator(".timeArea").tap({position: {x: 10, y: 5}});
  await page.touchscreen.tap(row!.x + 45, row!.y + 38);
  await page.locator(".timeArea .transition.selected, .timeArea .transition").first().tap();
  await expect(page.locator(".timeArea .transition:not(.hover)")).toHaveCount(1);
  await expect(page.locator(".properties h4")).toHaveText(/iFloat1\s*1\.0 — 4\.1s/);

  await panes.getByText("Textures", {exact: true}).tap();
  await expect(page.locator("div#textures .texture")).toHaveCount(8);
  await expect(page.locator(".timeArea")).toBeHidden();
  expect(errors).toEqual([]);
});
