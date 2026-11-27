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

test("a picker drag changes a running simulation as it goes, and starts it again only when let go", async ({page, context}) => {
  const errors = await offline(context);
  await page.goto("./#new");
  // Reading iPrevFrame makes it a simulation, which builds start again from step 0.
  await setCode(page, `void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec4 last = texelFetch(iPrevFrame, ivec2(fragCoord), 0);
  fragColor = vec4(0.2, 0.0, 0.0, 1.0) + 0.0 * last;
}`);
  await page.keyboard.press("Shift+Enter");
  await expect(page.locator(".buildButton")).toBeHidden();
  await page.getByRole("button", {name: "Play"}).click();
  await expect.poll(() => frameIndex(page), FRAME_WAIT).toBeGreaterThan(30);

  await page.locator(OPEN_EDITOR).getByText("0.2", {exact: true}).click();
  const restarts = await watchRestarts(page);
  await dragRuler(page);
  await expectCenter(page, [51, 0, 0], {not: true});
  // The simulation carried on with the new value, and the code doesn't need building.
  expect(await restarts()).toBe(0);
  await expect(page.locator(".buildButton")).toBeHidden();

  await page.mouse.up();
  await expect.poll(restarts, FRAME_WAIT).toBe(1);
  const red = Number(/vec4\(([\d.]+), 0\.0, 0\.0, 1\.0\)/.exec(await editorCode(page))![1]);
  expect(red).toBeGreaterThan(0.4);
  await expect(page.locator(".buildButton")).toBeHidden();
  await expectCenter(page, [Math.min(red, 1) * 255, 0, 0]);

  // The animation's file has the value the picker was let go at.
  await page.keyboard.press("Escape");
  const download = page.waitForEvent("download");
  await page.getByRole("button", {name: "File", exact: true}).click();
  await page.getByRole("menuitem", {name: /^Export/}).click();
  const file = JSON.parse(readFileSync(await (await download).path(), "utf8")) as {document: {code: string}};
  expect(file.document.code).toContain(`vec4(${red.toFixed(5)}, 0.0, 0.0, 1.0)`);
  expect(file.document.code).not.toContain("smoothstepPick");
  expect(errors).toEqual([]);
});

test("a picker on a value that must be constant still updates the canvas as it drags, without errors", async ({page, context}) => {
  const errors = await offline(context);
  await page.goto("./#new");
  await setCode(page, `void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  const float red = 0.2;
  fragColor = vec4(red, 0.0, 0.0, 1.0);
}`);
  await page.keyboard.press("Shift+Enter");
  await expect(page.locator(".buildButton")).toBeHidden();
  await page.locator(OPEN_EDITOR).getByText("0.2", {exact: true}).click();
  await dragRuler(page);
  await expectCenter(page, [51, 0, 0], {not: true});
  await page.mouse.up();
  await expect(page.locator(".buildButton")).toBeHidden();
  await expect(page.locator(".ss-line-error")).toHaveCount(0);
  expect(errors).toEqual([]);
});
