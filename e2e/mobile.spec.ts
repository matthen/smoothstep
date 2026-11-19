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

  // A sideways swipe scrolls a long timeline rather than adding a transition, and the labels stay put.
  await page.locator(".durationInput").fill("40");
  const area = (await page.locator(".timeArea").boundingBox())!;
  const cdp = await context.newCDPSession(page);
  const y = area.y + 120;
  await cdp.send("Input.dispatchTouchEvent", {type: "touchStart", touchPoints: [{x: area.x + 300, y}]});
  for (let i = 1; i <= 10; i++) {
    await cdp.send("Input.dispatchTouchEvent", {type: "touchMove", touchPoints: [{x: area.x + 300 - 26 * i, y}]});
  }
  await cdp.send("Input.dispatchTouchEvent", {type: "touchEnd", touchPoints: []});
  // Wait for the fling to stop: a tap during momentum scrolling only stops it.
  let last = -1;
  await expect.poll(async () => {
    const now = await page.locator(".gridContainer").evaluate(e => e.scrollLeft);
    const settled = now === last && now > 100;
    last = now;
    return settled;
  }, {intervals: [200]}).toBe(true);
  await expect(page.locator(".timeArea .transition:not(.hover)")).toHaveCount(1);
  const label = (await page.locator(".rowLabel").first().boundingBox())!;
  expect(Math.abs(label.x - area.x)).toBeLessThan(4);

  // The timeline follows the playhead: seeking far ahead scrolls it into view, and back to the start returns.
  const grid = page.locator(".gridContainer");
  const slider = (await page.locator(".playerButtons .slider").boundingBox())!;
  await page.touchscreen.tap(slider.x + slider.width * 0.9, slider.y + slider.height / 2);
  await expect.poll(() => grid.evaluate(e => e.scrollLeft)).toBeGreaterThan(800);
  const scrubber = (await page.locator(".timeArea .scrubber").boundingBox())!;
  expect(scrubber.x).toBeGreaterThanOrEqual(area.x);
  expect(scrubber.x).toBeLessThan(area.x + area.width);
  await page.getByRole("button", {name: "Back to the start"}).tap();
  await expect.poll(() => grid.evaluate(e => e.scrollLeft)).toBe(0);

  await panes.getByText("Textures", {exact: true}).tap();
  await expect(page.locator("div#textures .texture")).toHaveCount(8);
  await expect(page.locator(".timeArea")).toBeHidden();
  expect(errors).toEqual([]);
});
