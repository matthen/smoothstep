// The timeline on a desktop: fitting the animation to the panel, zooming, and editing transitions.
import { expect, test, type Page } from '@playwright/test';

import { offline, transitionTimes } from './helpers';

const scale = async (page: Page) => Number(await page.locator(".timeArea").getAttribute("data-px-per-second"));

// The screen position of a time in a row of the timeline.
async function at(page: Page, row: number, seconds: number) {
  const box = (await page.locator(".timeArea .variableRow").nth(row).boundingBox())!;
  return {x: box.x + seconds * await scale(page), y: box.y + 15};
}

async function scrubberTime(page: Page): Promise<number> {
  const left = await page.locator(".timeArea .scrubber").evaluate(e => parseFloat((e as HTMLElement).style.left));
  return (left + 1) / await scale(page);
}

test("the timeline fits the animation to its width, and zooms in and back out", async ({page, context}) => {
  const errors = await offline(context);
  await page.goto("./#new");
  const grid = page.locator(".gridContainer");
  const fits = () => grid.evaluate(e => e.scrollWidth <= e.clientWidth);

  // A 12 second animation fills the panel, with a little room after its end.
  expect(await fits()).toBe(true);
  const area = (await page.locator(".timeArea").boundingBox())!;
  const gridBox = (await grid.boundingBox())!;
  expect(area.x + area.width).toBeGreaterThan(gridBox.x + gridBox.width - 4);
  const end = (await page.locator(".timeArea .durationSlider").boundingBox())!;
  expect(end.x).toBeGreaterThan(area.x + area.width * 0.9);
  const fitted = await scale(page);

  // Longer and shorter animations fit too.
  await page.locator(".durationInput").fill("60");
  await page.locator(".durationInput").press("Enter");
  await expect.poll(() => scale(page)).toBeLessThan(fitted / 4);
  expect(await fits()).toBe(true);
  await expect(page.locator(".header .tick.major").first()).toHaveText("0:00");
  await page.locator(".durationInput").fill("12");
  await page.locator(".durationInput").press("Enter");
  await expect.poll(() => scale(page)).toBe(fitted);

  // Ctrl and the wheel zooms in around the pointer, which stays over the same time.
  const pointer = await at(page, 0, 6);
  await page.mouse.move(pointer.x, pointer.y);
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -100);
  await page.mouse.wheel(0, -100);
  await page.keyboard.up("Control");
  await expect.poll(() => scale(page)).toBeGreaterThan(fitted * 2);
  expect(await fits()).toBe(false);
  const zoomed = await at(page, 0, 6);
  expect(Math.abs(zoomed.x - pointer.x)).toBeLessThan(3);
  // Zoomed in, the ruler labels tenths of a second.
  await expect(page.locator(".header .tick.major").nth(1)).toHaveText(/^\d+\.\d$/);

  // The buttons zoom out and back to the fit.
  const before = await scale(page);
  await page.getByRole("button", {name: "Zoom out"}).click();
  await expect.poll(() => scale(page)).toBeCloseTo(before / 2, 5);
  await page.getByRole("button", {name: "Zoom in"}).click();
  await expect.poll(() => scale(page)).toBeCloseTo(before, 5);
  await page.getByRole("button", {name: "Fit to width"}).click();
  await expect.poll(() => scale(page)).toBe(fitted);
  expect(await fits()).toBe(true);
  await expect(page.getByRole("button", {name: "Fit to width"})).toBeDisabled();
  await expect(page.getByRole("button", {name: "Zoom out"})).toBeDisabled();
  expect(errors).toEqual([]);
});

test("the ruler seeks, and dragging the end changes the length", async ({page, context}) => {
  const errors = await offline(context);
  await page.goto("./#new");
  const ruler = (await page.locator(".header").boundingBox())!;
  const fitted = await scale(page);
  await page.mouse.click(ruler.x + 3 * fitted, ruler.y + 12);
  await expect.poll(() => scrubberTime(page)).toBeCloseTo(3, 1);

  // Dragging in the ruler scrubs.
  await page.mouse.move(ruler.x + 2 * fitted, ruler.y + 12);
  await page.mouse.down();
  await page.mouse.move(ruler.x + 5 * fitted, ruler.y + 12, {steps: 4});
  await page.mouse.up();
  await expect.poll(() => scrubberTime(page)).toBeCloseTo(5, 1);

  // The end's tab in the ruler drags the length, then the timeline fits it again.
  const handle = (await page.locator(".header .durationHandle").boundingBox())!;
  await expect(page.locator(".header .durationHandle")).toHaveText("12s");
  await page.mouse.move(handle.x + 1, handle.y + 5);
  await page.mouse.down();
  await page.mouse.move(handle.x + 1 - 2 * fitted, handle.y + 5, {steps: 4});
  await page.mouse.up();
  await expect(page.locator(".durationInput")).toHaveValue("10 s");
  await expect.poll(() => scale(page)).toBeGreaterThan(fitted);
  expect(errors).toEqual([]);
});

test("transitions are dragged out, drawn with their curve, moved, resized and deleted", async ({page, context}) => {
  const errors = await offline(context);
  await page.goto("./#new");
  const h4 = page.locator(".properties h4");
  await expect(page.locator(".properties .hint").first()).toHaveText("Click or drag in a row to add a transition.");

  // Drag along a row to add a transition.
  const from = await at(page, 1, 2.05);
  const to = await at(page, 1, 5.05);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, {steps: 5});
  await expect(h4).toHaveText(/iFloat1\s*2\.0 — 5\.0s/);
  await page.mouse.up();
  const transition = page.locator(".timeArea .transition.selected");
  await expect(transition).toHaveCount(1);

  // Its curve is flat until its values differ, then rises across it.
  const curve = page.locator(".timeArea .variableRow").nth(1).locator("svg.curves path.selected");
  const flat = await curve.getAttribute("d");
  await page.locator("#endValueInput").fill("1");
  await expect(curve).not.toHaveAttribute("d", flat!);
  await expect(page.locator(".labels .rowHead").nth(1)).toHaveClass(/animated/);
  await page.locator("#typeInput").selectOption("step");
  await expect(curve).toHaveAttribute("d", /H.*V.*H/);
  // The eased types draw curves of their own.
  const shapes = new Set<string>();
  for (const label of ["ease in", "ease out", "overshoot"]) {
    await page.locator("#typeInput").selectOption({label});
    await expect(curve).not.toHaveAttribute("d", /H.*V.*H/);
    shapes.add((await curve.getAttribute("d"))!);
  }
  expect(shapes.size).toBe(3);
  await page.locator("#typeInput").selectOption("smoothstep");

  // Drag its middle to move it, and its right edge to resize it.
  const box = (await transition.boundingBox())!;
  const fitted = await scale(page);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + fitted, box.y + box.height / 2, {steps: 4});
  await page.mouse.up();
  await expect.poll(() => transitionTimes(page)).toBe("3 — 6");
  const moved = (await transition.boundingBox())!;
  await page.mouse.move(moved.x + moved.width - 1, moved.y + moved.height / 2);
  await page.mouse.down();
  await page.mouse.move(moved.x + moved.width - 1 + fitted, moved.y + moved.height / 2, {steps: 4});
  await page.mouse.up();
  await expect.poll(() => transitionTimes(page)).toBe("3 — 7");

  // A zoomed-in timeline edits at its own scale.
  await page.getByRole("button", {name: "Zoom in"}).click();
  await page.getByRole("button", {name: "Zoom in"}).click();
  const zoomed = (await transition.boundingBox())!;
  expect(zoomed.width).toBeGreaterThan(moved.width * 3);
  const zoomedScale = await scale(page);
  await page.locator(".gridContainer").evaluate((e, left) => { e.scrollLeft = left; }, 2.5 * zoomedScale);
  const zoomedBox = (await transition.boundingBox())!;
  await page.mouse.move(zoomedBox.x + 1, zoomedBox.y + zoomedBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(zoomedBox.x + 1 + 0.5 * zoomedScale, zoomedBox.y + zoomedBox.height / 2, {steps: 4});
  await page.mouse.up();
  await expect.poll(() => transitionTimes(page)).toBe("3.5 — 7");

  await page.locator(".appHeader").click({position: {x: 4, y: 4}});
  await expect(page.locator(".timeArea .transition")).toHaveCount(1);
  await page.locator(".timeArea .transition").click();
  await page.keyboard.press("Delete");
  await expect(page.locator(".timeArea .transition")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("a transition's start and end times can be typed, to a hundredth of a second", async ({page, context}) => {
  const errors = await offline(context);
  await page.goto("./#example/f9ad362373e4");
  // sphereRadius's first transition runs from 2.5s to 4.5s, with another from 6.4s.
  await page.locator(".timeArea .variableRow").nth(1).locator(".transition").first().click();
  const start = page.locator("#startTimeInput");
  const end = page.locator("#endTimeInput");
  await expect(start).toHaveValue("2.5 s");
  await expect(end).toHaveValue("4.5 s");
  await start.fill("2.35");
  await end.fill("4.62");
  await end.blur();
  await expect.poll(() => transitionTimes(page)).toBe("2.35 — 4.62");
  // An end past the next transition's start isn't taken.
  await end.fill("7");
  await expect(end).toHaveAttribute("aria-invalid", "true");
  await end.blur();
  await expect(end).toHaveValue("4.62 s");
  expect(errors).toEqual([]);
});

test("the number boxes step with their arrows", async ({page, context}) => {
  const errors = await offline(context);
  await page.goto("./#example/f9ad362373e4");
  await page.locator(".timeArea .variableRow").nth(1).locator(".transition").first().click();
  const value = page.locator("#endValueInput");
  await value.focus();
  await page.keyboard.press("ArrowUp");
  await expect(value).toHaveValue("1.4");
  await page.locator("#startTimeInput").focus();
  await page.keyboard.press("ArrowDown");
  await expect.poll(() => transitionTimes(page)).toBe("2.4 — 4.5");
  const duration = page.locator(".durationInput");
  await duration.focus();
  await page.keyboard.press("ArrowUp");
  await expect(duration).toHaveValue("10 s");
  expect(errors).toEqual([]);
});
