// Editing the Canvas2D layer's code: its helpers and properties coloured, popups that explain them,
// and pickers on colour strings and numbers that work with a finger.
import { devices, expect, test, type Page } from '@playwright/test';

import { addTab, editorCode, offline, OPEN_EDITOR, setCode } from './helpers';

test.use(devices['Pixel 7']);

const CODE = `function draw(ctx, {time, width}) {
  clear(ctx);
  ctx.fillStyle = "#bbeafe";
  drawList(ctx, [Disk({center: [0, 0], radius: 0.3})]);
  const mine = 2;
  ctx.fillText("Hi", 60, 110);
}`;

// The colour and screen position of the middle of `text`, after `line` on the line holding it.
async function find(page: Page, line: string, text: string) {
  return page.locator(OPEN_EDITOR).evaluate((root, {line, text}) => {
    for (const el of root.querySelectorAll(".cm-line")) {
      if (!el.textContent.includes(line)) continue;
      let target = el.textContent.indexOf(text, el.textContent.indexOf(line)) + Math.floor(text.length / 2);
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const length = node.textContent!.length;
        if (target >= length) {
          target -= length;
          continue;
        }
        const range = document.createRange();
        range.setStart(node, target);
        range.setEnd(node, target + 1);
        const r = range.getBoundingClientRect();
        return {colour: getComputedStyle(node.parentElement!).color, x: r.x + r.width / 2, y: r.y + r.height / 2};
      }
    }
    throw new Error(`no ${text} in the editor`);
  }, {line, text});
}

const colourOf = async (page: Page, line: string, text: string) => (await find(page, line, text)).colour;

test("the Canvas2D tab colours and explains its helpers, and has pickers for a finger", async ({page, context}) => {
  const errors = await offline(context);
  await page.goto("./#new");
  await addTab(page, "Add the Canvas2D layer");
  await expect(page.getByRole("tab", {name: /^Canvas2D/})).toHaveAttribute("aria-selected", "true");
  await setCode(page, CODE);
  // Wait for JavaScript support to load and colour the code.
  await expect.poll(() => colourOf(page, "clear(ctx)", "clear")).not.toBe(await colourOf(page, "const mine", "mine"));

  const plain = await colourOf(page, "const mine", "mine");
  const helper = await colourOf(page, "clear(ctx)", "clear");
  expect(await colourOf(page, "drawList", "Disk")).toBe(helper);
  expect(await colourOf(page, "function draw", "time")).toBe(helper);
  expect(await colourOf(page, "ctx.fillStyle", "ctx")).toBe(helper);
  const property = await colourOf(page, "ctx.fillStyle", "fillStyle");
  expect(property).not.toBe(plain);
  expect(property).not.toBe(helper);
  expect(await colourOf(page, "drawList", "radius")).toBe(property);

  const tap = async (line: string, text: string) => {
    const at = await find(page, line, text);
    await page.touchscreen.tap(at.x, at.y);
  };
  const popup = page.locator(".cm-tooltip.ss-popup");
  const closePopup = async () => {
    const gutter = (await page.locator(".ss-code-editor:not([hidden]) .cm-gutters").boundingBox())!;
    await page.touchscreen.tap(gutter.x + 4, gutter.y + 4);
    await expect(popup).toBeHidden();
  };

  await tap("drawList", "Disk");
  await expect(popup.locator(".ss-definition")).toContainText("radius = 1");
  await closePopup();
  await tap("ctx.fillText", "fillText");
  await expect(popup.locator("a")).toHaveAttribute("href", /developer\.mozilla\.org.*fillText$/);
  await closePopup();

  // Dragging across the colour disc writes a new colour in the same format.
  await tap("ctx.fillStyle", "bbeafe");
  const disc = page.locator(".ss-color-disc-cover");
  await expect(disc).toBeVisible();
  const box = (await disc.boundingBox())!;
  await page.touchscreen.tap(box.x + box.width * 0.9, box.y + box.height / 2);
  await expect.poll(async () => (await editorCode(page)).split("\n")[2]).toMatch(/ctx\.fillStyle = "#[\da-f]{6}";/);
  expect((await editorCode(page)).split("\n")[2]).not.toContain("#bbeafe");
  // The keyboard stays down while the picker's open.
  expect(await page.evaluate(() => document.activeElement?.closest(".cm-editor") ?? null)).toBeNull();
  await closePopup();

  await tap("ctx.fillText", "110");
  await expect(page.locator(".ss-float-picker")).toBeVisible();
  await closePopup();
  // Numbers in strings don't get one.
  await tap("ctx.fillText", "Hi");
  await expect(page.locator(".ss-picker")).toBeHidden();
  expect(errors).toEqual([]);
});
