// Dragging a picker on code that's built: the canvas follows the value without building it each move.
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

import { editorCode, expectCenter, FRAME_WAIT, offline, OPEN_EDITOR, setCode } from './helpers';

// The step the simulation has reached, shown over the canvas.
async function frameIndex(page: Page): Promise<number> {
  return Number(await page.locator("#canvasContainer .fps p").last().textContent());
}

// Counts the times the step shown goes back, as it does when the simulation starts again.
async function watchRestarts(page: Page): Promise<() => Promise<number>> {
  await page.locator("#canvasContainer .fps p").last().evaluate(el => {
    let last = Number(el.textContent);
    const counter = window as unknown as {restarts: number};
    counter.restarts = 0;
    new MutationObserver(() => {
      const step = Number(el.textContent);
      if (step < last) counter.restarts++;
      last = step;
    }).observe(el, {childList: true, characterData: true, subtree: true});
  });
  return () => page.evaluate(() => (window as unknown as {restarts: number}).restarts);
}

// Presses on the open float picker and drags it left, which raises the value, keeping the button down.
async function dragRuler(page: Page) {
  const box = (await page.locator(".ss-float-picker canvas").boundingBox())!;
  const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x - 60, y, {steps: 10});
}

// The value of the red literal written as `vec4(<red>, ...` in the code.
async function redIn(page: Page): Promise<number> {
  return Number(/vec4\(([\d.]+),/.exec(await editorCode(page))![1]);
}

// Builds `code`, long enough that looping, which also starts a simulation again, can't happen during a drag.
async function build(page: Page, code: string) {
  await page.locator(".durationInput").fill("60");
  await page.locator(".durationInput").press("Enter");
  await setCode(page, code);
  await page.keyboard.press("Shift+Enter");
  await expect(page.locator(".buildButton")).toBeHidden();
}

// Reading iPrevFrame makes it a simulation, which builds start again from step 0.
const SIMULATION = `void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec4 last = texelFetch(iPrevFrame, ivec2(fragCoord), 0);
  fragColor = vec4(0.2, 0.0, 0.0, 1.0) + 0.0 * last;
}`;

async function playUntilRunning(page: Page) {
  await page.getByRole("button", {name: "Play"}).click();
  await expect.poll(() => frameIndex(page), FRAME_WAIT).toBeGreaterThan(30);
}

// The animation's code, as File > Export writes it.
async function exportedCode(page: Page): Promise<string> {
  const download = page.waitForEvent("download");
  await page.getByRole("button", {name: "File", exact: true}).click();
  await page.getByRole("menuitem", {name: /^Export/}).click();
  return (JSON.parse(readFileSync(await (await download).path(), "utf8")) as {document: {code: string}}).document.code;
}

test("a picker drag changes a running simulation as it goes, and starts it again only when let go", async ({page, context}) => {
  const errors = await offline(context);
  await page.goto("./#new");
  await build(page, SIMULATION);
  await playUntilRunning(page);

  await page.locator(OPEN_EDITOR).getByText("0.2", {exact: true}).click();
  const restarts = await watchRestarts(page);
  await dragRuler(page);
  await expectCenter(page, [51, 0, 0], {not: true});
  // The simulation carried on with the new value, and the code doesn't need building.
  expect(await restarts()).toBe(0);
  await expect(page.locator(".buildButton")).toBeHidden();

  await page.mouse.up();
  await expect.poll(restarts, FRAME_WAIT).toBe(1);
  const red = await redIn(page);
  expect(red).toBeGreaterThan(0.2);
  await expect(page.locator(".buildButton")).toBeHidden();
  await expectCenter(page, [Math.min(red, 1) * 255, 0, 0]);

  // The animation's file has the value the picker was let go at.
  await page.keyboard.press("Escape");
  const code = await exportedCode(page);
  expect(code).toContain(`vec4(${red.toFixed(5)}, 0.0, 0.0, 1.0)`);
  expect(code).not.toContain("smoothstepPick");
  expect(errors).toEqual([]);
});

test("closing a picker mid-drag keeps the value it was dragged to, built and saved", async ({page, context}) => {
  const errors = await offline(context);
  await page.goto("./#new");
  await build(page, SIMULATION);
  await page.locator(OPEN_EDITOR).getByText("0.2", {exact: true}).click();
  await dragRuler(page);
  await page.keyboard.press("Escape");
  await expect(page.locator(".ss-float-picker")).toHaveCount(0);
  const red = await redIn(page);
  expect(red).toBeGreaterThan(0.2);
  await expect(page.locator(".buildButton")).toBeHidden();
  await expectCenter(page, [Math.min(red, 1) * 255, 0, 0]);
  await page.mouse.up();

  expect(await exportedCode(page)).toContain(`vec4(${red.toFixed(5)}, 0.0, 0.0, 1.0)`);
  await page.keyboard.press("ControlOrMeta+s");
  await expect(page).toHaveURL(/#anim\/[a-f0-9]+$/);
  await page.reload();
  await expect(page.locator(OPEN_EDITOR)).toContainText(`vec4(${red.toFixed(5)},`);
  expect(errors).toEqual([]);
});

test("a picker let go at the value it started from leaves the simulation running and the animation saved", async ({page, context}) => {
  const errors = await offline(context);
  await page.goto("./#new");
  await build(page, SIMULATION.replace("0.2,", "0.20000,"));
  await page.keyboard.press("ControlOrMeta+s");
  await expect(page).toHaveURL(/#anim\/[a-f0-9]+$/);
  await expect(page.locator(".saveButton")).toHaveAttribute("data-variant", "subtle");
  await playUntilRunning(page);

  await page.locator(OPEN_EDITOR).getByText("0.20000", {exact: true}).click();
  const restarts = await watchRestarts(page);
  const box = (await page.locator(".ss-float-picker canvas").boundingBox())!;
  const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x - 60, y, {steps: 5});
  await expect.poll(() => redIn(page)).toBeGreaterThan(0.2);
  await page.mouse.move(x, y, {steps: 5});
  await expect.poll(() => redIn(page)).toBe(0.2);
  await page.mouse.up();

  // Steps go on from where they were, without starting again.
  const step = await frameIndex(page);
  await expect.poll(() => frameIndex(page), FRAME_WAIT).toBeGreaterThan(step + 10);
  expect(await restarts()).toBe(0);
  await expect(page.locator(".saveButton")).toHaveAttribute("data-variant", "subtle");
  await expect(page.locator(".buildButton")).toBeHidden();
  await expectCenter(page, [51, 0, 0]);
  expect(errors).toEqual([]);
});

test("a picker dragged while paused shows each value at the same step, without moving the simulation on", async ({page, context}) => {
  const errors = await offline(context);
  await page.goto("./#new");
  // Each step adds 0.1 to the green, so a step taken shows.
  await build(page, `void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec4 last = texelFetch(iPrevFrame, ivec2(fragCoord), 0);
  fragColor = vec4(0.2, last.g + 0.1, 0.0, 1.0);
}`);
  await expectCenter(page, [51, 26, 0], {tolerance: 10});
  const step = await frameIndex(page);

  await page.locator(OPEN_EDITOR).getByText("0.2", {exact: true}).click();
  await dragRuler(page);
  const red = await redIn(page);
  expect(red).toBeGreaterThan(0.2);
  await expectCenter(page, [Math.min(red, 1) * 255, 26, 0], {tolerance: 10});
  expect(await frameIndex(page)).toBe(step);
  await page.mouse.up();
  await expect(page.locator(".buildButton")).toBeHidden();
  await expectCenter(page, [Math.min(red, 1) * 255, 26, 0], {tolerance: 10});
  expect(errors).toEqual([]);
});

test("a picker on a value that must be constant builds as it drags, without errors", async ({page, context}) => {
  const errors = await offline(context);
  await page.goto("./#new");
  await build(page, `void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  const float red = 0.2;
  vec4 last = texelFetch(iPrevFrame, ivec2(fragCoord), 0);
  fragColor = vec4(red, 0.0, 0.0, 1.0) + 0.0 * last;
}`);
  await playUntilRunning(page);
  await page.locator(OPEN_EDITOR).getByText("0.2", {exact: true}).click();
  const restarts = await watchRestarts(page);
  await dragRuler(page);
  await expectCenter(page, [51, 0, 0], {not: true});
  // Each build starts the simulation again, as a drag through the uniform wouldn't.
  await expect.poll(restarts, FRAME_WAIT).toBeGreaterThan(0);
  await page.mouse.up();
  await expect(page.locator(".buildButton")).toBeHidden();
  await expect(page.locator(".ss-line-error")).toHaveCount(0);
  expect(errors).toEqual([]);
});
