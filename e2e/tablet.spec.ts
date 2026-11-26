// A tablet in landscape: the desktop layout, with an on-screen keyboard covering the bottom of the page.
import { expect, test, type Page } from '@playwright/test';

import { blankTimeline, offline, OPEN_EDITOR } from './helpers';

const VISIBLE_HEIGHT = 420;

test.use({viewport: {width: 1180, height: 820}, hasTouch: true});

interface Viewport {height?: number; offsetTop?: number; scale?: number}
type Faked = {viewport(fake: Viewport | null): void};

// Browsers in tests have no on-screen keyboard, so this changes the visual viewport as one would.
async function fakeViewport(page: Page) {
  await page.addInitScript(() => {
    let fake: Viewport | null = null;
    for (const key of ["height", "offsetTop", "scale"] as const) {
      const real = Object.getOwnPropertyDescriptor(VisualViewport.prototype, key)!;
      Object.defineProperty(VisualViewport.prototype, key, {
        get(this: VisualViewport) { return fake?.[key] ?? (real.get!.call(this) as number); },
      });
    }
    (window as unknown as Faked).viewport = next => {
      fake = next;
      window.visualViewport!.dispatchEvent(new Event("resize"));
    };
  });
}

const setViewport = (page: Page, fake: Viewport | null) =>
  page.evaluate(f => (window as unknown as Faked).viewport(f), fake);
const keyboard = (page: Page, offsetTop = 0) => setViewport(page, {height: VISIBLE_HEIGHT, offsetTop});

async function box(page: Page, selector: string) {
  return (await page.locator(selector).boundingBox())!;
}

test("with the keyboard up, the code or the bottom panel fills the space above it", async ({page, context}) => {
  const errors = await offline(context);
  await fakeViewport(page);
  await page.goto("./#new");
  await page.locator(OPEN_EDITOR).click();
  await keyboard(page);
  // Typing code: the editor takes the room, and the bottom panel makes way.
  await expect(page.locator(".bottomPanel")).toBeHidden();
  const editor = await box(page, ".editorPane");
  expect(editor.y + editor.height).toBeLessThanOrEqual(VISIBLE_HEIGHT);
  expect(editor.y + editor.height).toBeGreaterThan(VISIBLE_HEIGHT - 20);
  await setViewport(page, null);
  await expect(page.locator(".bottomPanel")).toBeVisible();

  // Typing a transition's time: the panel takes the room, and the code and canvas make way. iOS also
  // scrolls the page to show the field, so the app follows the part in sight.
  await page.goto("./#example/f9ad362373e4");
  const canvas = await box(page, "#canvas");
  await page.locator(".timeArea .transition").first().click();
  await page.locator("#startTimeInput").focus();
  await keyboard(page, 300);
  await expect(page.locator(".editorPane")).toBeHidden();
  const panel = await box(page, ".bottomPanel");
  expect(panel.y + panel.height).toBeLessThanOrEqual(300 + VISIBLE_HEIGHT);
  const start = await box(page, "#startTimeInput");
  expect(start.y).toBeGreaterThan(300);
  expect(start.y + start.height).toBeLessThan(300 + VISIBLE_HEIGHT);
  await setViewport(page, null);
  await expect(page.locator(".editorPane")).toBeVisible();
  expect(await box(page, "#canvas")).toEqual(canvas);
  expect(errors).toEqual([]);
});

test("in browsers that shrink the page for the keyboard, the code keeps its room and its cursor", async ({page, context}) => {
  const errors = await offline(context);
  await page.goto("./#new");
  const tapped = page.locator(".cm-line", {hasText: "fragColor = vec4(col"});
  await tapped.tap();
  await page.setViewportSize({width: 1180, height: VISIBLE_HEIGHT});
  await expect(page.locator(".bottomPanel")).toBeHidden();
  const editor = await box(page, ".editorPane");
  expect(editor.y + editor.height).toBeLessThanOrEqual(VISIBLE_HEIGHT);
  expect(editor.y + editor.height).toBeGreaterThan(VISIBLE_HEIGHT - 20);
  // The cursor is on the tapped line, still in sight.
  const cursor = page.locator(".cm-cursor-primary");
  await expect(cursor).toBeInViewport();
  const line = (await tapped.boundingBox())!;
  const caret = (await cursor.boundingBox())!;
  expect(caret.y + caret.height / 2).toBeGreaterThan(line.y);
  expect(caret.y + caret.height / 2).toBeLessThan(line.y + line.height);
  await page.setViewportSize({width: 1180, height: 820});
  await expect(page.locator(".bottomPanel")).toBeVisible();
  expect(errors).toEqual([]);
});

test("a tap shows a transition's open start and asks for its end, and hold and drag adds one", async ({page, context}) => {
  const errors = await offline(context);
  await page.goto("./#new");
  await blankTimeline(page);
  const row = (await page.locator(".timeArea .variableRow").first().boundingBox())!;
  const y = row.y + row.height / 2;
  const at = (fraction: number) => row.x + row.width * fraction;

  await page.touchscreen.tap(at(0.2), y);
  await expect(page.locator(".transitionStart")).toBeVisible();
  await expect(page.getByRole("status").filter({hasText: "Tap again to set the end time."})).toBeVisible();
  await page.touchscreen.tap(at(0.4), y);
  await expect(page.locator(".timeArea .transition")).toHaveCount(1);
  await expect(page.locator(".transitionStart")).toHaveCount(0);

  // The new transition is selected, and a tap in a row deselects it. Then a finger held still shows the
  // start and drags out the end.
  await page.touchscreen.tap(at(0.9), y);
  await expect(page.locator(".timeArea .transition.selected")).toHaveCount(0);
  const cdp = await context.newCDPSession(page);
  const touch = (type: "touchStart" | "touchMove" | "touchEnd", x: number) => cdp.send("Input.dispatchTouchEvent", {
    type, touchPoints: type === "touchEnd" ? [] : [{x, y}],
  });
  await touch("touchStart", at(0.6));
  await expect(page.getByRole("status").filter({hasText: "Drag to set the end time."})).toBeVisible();
  for (const fraction of [0.65, 0.7, 0.75, 0.8]) {
    await touch("touchMove", at(fraction));
  }
  await expect(page.locator(".timeArea .transition.hover")).toBeVisible();
  const dragged = await box(page, ".timeArea .transition.hover");
  expect(dragged.width).toBeGreaterThan(row.width * 0.15);
  await touch("touchEnd", at(0.8));
  await expect(page.locator(".timeArea .transition")).toHaveCount(2);

  // The timeline fits, so it has nowhere to scroll and a quick sideways swipe draws one as it goes.
  await page.touchscreen.tap(at(0.9), y);
  await expect(page.locator(".timeArea .transition.selected")).toHaveCount(0);
  await touch("touchStart", at(0.42));
  for (const fraction of [0.45, 0.5, 0.56]) {
    await touch("touchMove", at(fraction));
  }
  await expect(page.locator(".timeArea .transition.hover")).toBeVisible();
  await touch("touchEnd", at(0.56));
  await expect(page.locator(".timeArea .transition")).toHaveCount(3);
  expect(errors).toEqual([]);
});

test("the layout stays put for the title, and for a pinch zoom", async ({page, context}) => {
  const errors = await offline(context);
  await fakeViewport(page);
  await page.goto("./#new");
  const panel = await box(page, ".bottomPanel");
  await page.locator("#titleInput").focus();
  await keyboard(page);
  await expect(page.locator(".app")).not.toHaveAttribute("data-keyboard");
  expect(await box(page, ".bottomPanel")).toEqual(panel);

  // Zoomed in, the visible part shrinks without a keyboard.
  await page.locator(OPEN_EDITOR).click();
  await setViewport(page, {height: 820 / 2, scale: 2});
  await expect(page.locator(".app")).not.toHaveAttribute("data-keyboard");
  await expect(page.locator(".bottomPanel")).toBeVisible();
  expect(errors).toEqual([]);
});
