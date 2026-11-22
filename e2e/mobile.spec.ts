// The phone layout: the canvas on top, and a switch between the code, timeline and textures.
import { devices, expect, test } from '@playwright/test';

import { offline, transitionTimes } from './helpers';

test.use(devices['Pixel 7']);

test("on a phone, the welcome screen has no ✕ and keeps its buttons on screen", async ({page, context}) => {
  const errors = await offline(context);
  await page.goto("./");
  const welcome = page.getByRole("dialog");
  await expect(welcome.getByRole("heading", {name: "Build animations with GLSL"})).toBeVisible();
  await expect(welcome.locator(".mantine-Modal-close")).toHaveCount(0);
  const viewport = page.viewportSize()!;
  for (const name of ["Learn", "Continue"]) {
    const box = (await welcome.locator(".splashActions").getByRole("button", {name}).boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
  }
  // Learn offers the tutorial and the tour.
  await welcome.getByRole("button", {name: "Learn"}).tap();
  await expect(page.getByRole("menuitem", {name: "Tutorial"})).toBeVisible();
  await expect(page.getByRole("menuitem", {name: "Take the tour"})).toBeVisible();
  await page.keyboard.press("Escape");
  await welcome.getByRole("button", {name: "Continue"}).tap();
  await expect(welcome).toBeHidden();
  expect(errors).toEqual([]);
});

test("on a phone, the panes switch and a transition can be added with two taps", async ({page, context}) => {
  const errors = await offline(context);
  await page.goto("./#new");
  await expect(page.locator("#canvas")).toBeVisible();
  await expect(page.locator(".cm-content")).toBeVisible();
  await expect(page.getByRole("tab", {name: "Timeline"})).toBeHidden();

  const panes = page.locator(".mobileTabs");
  await panes.getByText("Timeline", {exact: true}).tap();
  await expect(page.locator(".cm-content")).toBeHidden();
  const grid = page.locator(".gridContainer");
  const timeArea = page.locator(".timeArea");
  const scale = async () => Number(await timeArea.getAttribute("data-px-per-second"));
  // The whole animation fits the phone's width.
  expect(await grid.evaluate(e => e.scrollWidth <= e.clientWidth)).toBe(true);
  const fitted = await scale();
  const row = await page.locator(".timeArea .variableRow").nth(1).boundingBox();
  // Touches can't hover, so the first tap marks the start and the second the end.
  await page.touchscreen.tap(row!.x + 1.07 * fitted, row!.y + 10);
  await page.touchscreen.tap(row!.x + 4.12 * fitted, row!.y + 10);
  await expect.poll(() => transitionTimes(page)).toBe("1 — 4.1");

  // Tapping an existing transition abandons a half-made one and selects it.
  await timeArea.tap({position: {x: 10, y: 5}});
  await page.touchscreen.tap(row!.x + 1.07 * fitted, row!.y + 38);
  await page.locator(".timeArea .transition.selected, .timeArea .transition").first().tap();
  await expect(page.locator(".timeArea .transition:not(.hover)")).toHaveCount(1);
  await expect.poll(() => transitionTimes(page)).toBe("1 — 4.1");

  // A longer animation still fits, until two fingers pinch to zoom in.
  await page.locator(".durationInput").fill("40");
  await expect.poll(scale).toBeLessThan(fitted / 2);
  expect(await grid.evaluate(e => e.scrollWidth <= e.clientWidth)).toBe(true);
  const longFit = await scale();
  const area = (await timeArea.boundingBox())!;
  const gridBox = (await grid.boundingBox())!;
  const cdp = await context.newCDPSession(page);
  const y = area.y + 14;  // Across the first row, which has no transition.
  const middle = area.x + 100;
  // A pinch between a transition's two taps, to place its end more precisely, doesn't end it.
  await page.touchscreen.tap(middle - 60, y);
  await cdp.send("Input.dispatchTouchEvent", {type: "touchStart", touchPoints: [{x: middle - 20, y, id: 0}]});
  await cdp.send("Input.dispatchTouchEvent", {type: "touchStart", touchPoints: [{x: middle - 20, y, id: 0}, {x: middle + 20, y, id: 1}]});
  for (let i = 1; i <= 10; i++) {
    await cdp.send("Input.dispatchTouchEvent", {type: "touchMove", touchPoints: [{x: middle - 20 - 8 * i, y, id: 0}, {x: middle + 20 + 8 * i, y, id: 1}]});
  }
  await cdp.send("Input.dispatchTouchEvent", {type: "touchEnd", touchPoints: []});
  await expect.poll(scale).toBeGreaterThan(longFit * 3);
  await expect(page.locator(".timeArea .transition:not(.hover)")).toHaveCount(1);

  // A sideways swipe scrolls the zoomed timeline rather than adding a transition, and the labels stay put.
  await grid.evaluate(e => { e.scrollLeft = 0; });
  const label = (await page.locator(".rowLabel").first().boundingBox())!;
  const start = area.x + 200;
  await cdp.send("Input.dispatchTouchEvent", {type: "touchStart", touchPoints: [{x: start, y}]});
  // Until the finger lifts, it might be a swipe, so no new transition shows yet.
  await page.waitForTimeout(100);
  await expect(page.locator(".timeArea .transition.hover")).toHaveCount(0);
  for (let i = 1; i <= 10; i++) {
    await cdp.send("Input.dispatchTouchEvent", {type: "touchMove", touchPoints: [{x: start - 16 * i, y}]});
  }
  await cdp.send("Input.dispatchTouchEvent", {type: "touchEnd", touchPoints: []});
  // Wait for the fling to stop: a tap during momentum scrolling only stops it.
  let last = -1;
  await expect.poll(async () => {
    const now = await grid.evaluate(e => e.scrollLeft);
    const settled = now === last && now > 100;
    last = now;
    return settled;
  }, {intervals: [200]}).toBe(true);
  await expect(page.locator(".timeArea .transition:not(.hover)")).toHaveCount(1);
  const labelAfter = (await page.locator(".rowLabel").first().boundingBox())!;
  expect(Math.abs(labelAfter.x - label.x)).toBeLessThan(1);

  // The timeline follows the playhead: seeking far ahead scrolls it into view, and back to the start returns.
  const slider = (await page.locator(".playerButtons .slider").boundingBox())!;
  await page.touchscreen.tap(slider.x + slider.width * 0.9, slider.y + slider.height / 2);
  await expect.poll(() => grid.evaluate(e => e.scrollLeft)).toBeGreaterThan(800);
  const scrubber = (await page.locator(".timeArea .scrubber").boundingBox())!;
  expect(scrubber.x).toBeGreaterThanOrEqual(area.x);
  expect(scrubber.x).toBeLessThan(gridBox.x + gridBox.width);
  await page.getByRole("button", {name: "Back to the start"}).tap();
  await expect.poll(() => grid.evaluate(e => e.scrollLeft)).toBe(0);

  await panes.getByText("Textures", {exact: true}).tap();
  await expect(page.locator("div#textures .texture")).toHaveCount(3);
  await page.screenshot({path: "test-results/mobile-textures.png"});
  await expect(page.locator(".timeArea")).toBeHidden();
  expect(errors).toEqual([]);
});

test("on a phone, the button under the timeline's rows adds the next one", async ({page, context}) => {
  const errors = await offline(context);
  await page.goto("./#new");
  await page.locator(".mobileTabs").getByText("Timeline", {exact: true}).tap();
  const rows = page.locator(".timeArea .variableRow");
  await expect(rows).toHaveCount(3);
  // In sight without scrolling the timeline, which a person wouldn't know to do.
  const area = (await page.locator(".timeArea").boundingBox())!;
  const button = (await page.getByRole("button", {name: "Add a row"}).boundingBox())!;
  expect(button.y + button.height).toBeLessThanOrEqual(area.y + area.height);
  await page.getByRole("button", {name: "Add a row"}).tap();
  await expect(rows).toHaveCount(4);
  expect(await page.locator(".timeArea").evaluate(e => e.scrollTop)).toBe(0);
  await page.screenshot({path: "test-results/mobile-add-row.png"});
  expect(errors).toEqual([]);
});

test("on a phone, the canvas's size shows for a few seconds after a tap, and the aspect ratio is always there", async ({page, context}) => {
  const errors = await offline(context);
  await page.goto("./#new");
  const info = page.locator("#canvasContainer .fps");
  await expect(info).toHaveCSS("opacity", "0");
  await page.locator("#canvas").tap();
  await expect(info).toHaveCSS("opacity", "1");
  await expect(info).toHaveCSS("opacity", "0", {timeout: 5000});

  const picker = page.locator(".playerButtons").getByLabel("Aspect ratio");
  await expect(picker).toBeInViewport();
  await picker.selectOption({label: "16:9"});
  await page.locator("#canvas").tap();
  await expect(info).toContainText(/\d+×\d+px/);
  await page.screenshot({path: "test-results/mobile-overlays.png"});
  expect(errors).toEqual([]);
});

test.describe("on the narrowest phone", () => {
  test.use({viewport: {width: 320, height: 568}});

  test("the play bar's buttons fit on one row, and full screen puts them beside the scrub bar", async ({page}) => {
    await page.addInitScript(() => localStorage.setItem("smoothstep.tour", "taken"));
    await page.goto("./#new");
    const play = page.getByRole("button", {name: "Play"});
    const full = page.getByRole("button", {name: "Full screen"});
    await expect(full).toBeVisible();
    expect((await full.boundingBox())!.y).toBeCloseTo((await play.boundingBox())!.y, 0);
    await full.tap();
    const exit = page.getByRole("button", {name: "Exit full screen"});
    await expect(exit).toBeVisible();
    const slider = (await page.locator("div.slider").boundingBox())!;
    const playBox = (await play.boundingBox())!;
    expect(slider.y).toBeLessThan(playBox.y + playBox.height);
    expect(slider.y + slider.height).toBeGreaterThan(playBox.y);
  });
});
