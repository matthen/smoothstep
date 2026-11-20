// The pickers that open on values in the code, dragged with a finger on a phone.
import { devices, expect, test, type CDPSession, type Page } from '@playwright/test';

import { canvasCenter, editorCode, near, offline, setCode } from './helpers';

test.use(devices['Pixel 7']);

const CODE = `float a = 0.5;
vec2 p = vec2(0.2, 0.3);
vec3 c = vec3(0.9, 0.4, 0.1);
vec3 d = vec3(0.0, 1.0, 2.0);
void mainImage(out vec4 fragColor, in vec2 fragCoord) { fragColor = vec4(c, 1.0); }
`;

// The screen position of the middle of `text` in the editor, which can span highlighted tokens.
async function textCenter(page: Page, text: string) {
  return page.locator(".cm-content").evaluate((root, text) => {
    for (const line of root.querySelectorAll(".cm-line")) {
      let target = line.textContent!.indexOf(text);
      if (target < 0) continue;
      target += Math.floor(text.length / 2);
      const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
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
        return {x: r.x + r.width / 2, y: r.y + r.height / 2};
      }
    }
    throw new Error(`no ${text} in the editor`);
  }, text);
}

async function touchDrag(cdp: CDPSession, from: {x: number, y: number}, dx: number, dy: number) {
  await cdp.send("Input.dispatchTouchEvent", {type: "touchStart", touchPoints: [from]});
  for (let i = 1; i <= 10; i++) {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove", touchPoints: [{x: from.x + dx * i / 10, y: from.y + dy * i / 10}],
    });
  }
  await cdp.send("Input.dispatchTouchEvent", {type: "touchEnd", touchPoints: []});
}

const center = async (page: Page, selector: string) => {
  const box = (await page.locator(selector).first().boundingBox())!;
  return {x: box.x + box.width / 2, y: box.y + box.height / 2};
};

test("on a phone, each picker opens without the keyboard and follows a finger", async ({page, context}) => {
  const errors = await offline(context);
  await page.goto("./#new");
  await setCode(page, CODE);
  await page.locator(".buildButton").tap();
  await expect(page.locator(".buildButton")).toBeHidden();
  const cdp = await context.newCDPSession(page);
  const picker = page.locator(".ss-picker");
  const line = async (n: number) => (await editorCode(page)).split("\n")[n];

  const open = async (text: string) => {
    // Tapping outside the code closes the last picker.
    if (await picker.isVisible()) {
      const gutter = (await page.locator(".cm-gutters").boundingBox())!;
      await page.touchscreen.tap(gutter.x + 4, gutter.y + 4);
      await expect(picker).toBeHidden();
    }
    const at = await textCenter(page, text);
    await page.touchscreen.tap(at.x, at.y);
    await expect(picker).toBeVisible();
    // The editor gives up focus, so the on-screen keyboard doesn't cover the picker.
    expect(await page.evaluate(() => document.activeElement?.closest(".cm-editor") ?? null)).toBeNull();
  };
  const box = async (selector: string) => (await page.locator(selector).boundingBox())!;

  // The ruler moves with the finger, so dragging left raises the value. A touch drag either slides
  // or zooms: unzoomed, the 256px ruler spans 2, so 60px adds 0.47, and the wobble mustn't zoom.
  const value = async () => Number(/^float a = ([\d.]+);$/.exec((await line(0))!)![1]);
  await open("0.5");
  const ruler = await center(page, ".ss-float-picker canvas");
  await touchDrag(cdp, ruler, -60, 6);
  await expect(picker).toBeVisible();
  expect(await value()).toBeCloseTo(0.969, 2);
  // An upward drag zooms out without moving the value.
  await touchDrag(cdp, ruler, 5, -40);
  expect(await value()).toBeCloseTo(0.969, 2);

  await open("vec2(0.2");
  await touchDrag(cdp, await center(page, ".ss-vec2-picker canvas"), -40, -40);
  await expect(picker).toBeVisible();
  expect(await line(1)).toMatch(/^vec2 p = vec2\(-0\.\d+, 0\.\d+\);$/);

  // The code was built, so the canvas follows the colour as it's dragged.
  expect(near(await canvasCenter(page), [230, 102, 26])).toBe(true);
  await open("vec3(0.9");
  const disc = await box(".ss-color-disc-cover");
  await touchDrag(cdp, {x: disc.x + disc.width * 0.8, y: disc.y + disc.height / 2}, -100, 0);
  await expect(picker).toBeVisible();
  expect(await line(2)).not.toBe("vec3 c = vec3(0.9, 0.4, 0.1);");
  expect(near(await canvasCenter(page), [230, 102, 26])).toBe(false);

  // Drag the tip of the arrow, drawn at (x, -y) * 50 from the middle of the 200px view.
  await open("vec3(0.0");
  const view = await box(".ss-direction-picker canvas");
  await touchDrag(cdp, {x: view.x + 100, y: view.y + 50}, 30, 0);
  await expect(picker).toBeVisible();
  expect(await line(3)).toMatch(/^vec3 d = vec3\(0\.[1-9]\d*, 1\.0+, 2\.0+\);$/);
  expect(errors).toEqual([]);
});
