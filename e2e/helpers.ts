import { expect, type BrowserContext, type Page } from '@playwright/test';
import { PNG } from 'pngjs';

export const MAGENTA: [number, number, number] = [220, 20, 200];

export const TEXTURE_SHADER = `void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / iResolution.xy;
  fragColor = texture(iTexture0, uv);
}
`;

// Blocks every request that isn't to this machine, so tests prove the app works offline, and
// collects page errors. Also turns off the one-time tips, which would otherwise pop up over the flows
// being tested, unless `tips` is set, and the Docs tab a new animation opens with, unless `docs` is set.
export async function offline(context: BrowserContext, {tips = false, docs = false} = {}): Promise<string[]> {
  await context.route(/^https?:\/\/(?!localhost)/, route => route.abort());
  // about:blank has no storage, so skip it there.
  await context.addInitScript(({tips, docs}) => {
    if (!window.location.protocol.startsWith("http")) {
      return;
    }
    if (!tips) {
      window.localStorage.setItem("smoothstep.tips", "off");
    }
    if (!docs) {
      window.localStorage.setItem("smoothstep.docsTab", "closed");
    }
  }, {tips, docs});
  const errors: string[] = [];
  const watch = (page: Page) => {
    page.on("pageerror", error => errors.push(String(error)));
    page.on("console", message => {
      if (message.type() === "error" && !message.text().includes("Failed to load resource")) {
        errors.push("console: " + message.text());
      }
    });
  };
  context.pages().forEach(watch);
  context.on("page", watch);
  return errors;
}

// Marks the tour as taken, so its offer doesn't cover the page.
export async function skipTour(context: BrowserContext) {
  // about:blank has no storage, so skip it there.
  await context.addInitScript(() => {
    if (window.location.protocol.startsWith("http")) {
      window.localStorage.setItem("smoothstep.tour", "taken");
    }
  });
}

export function solidPNG(width: number, height: number, [r, g, b]: [number, number, number]): Buffer {
  const png = new PNG({width, height});
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = r;
    png.data[i + 1] = g;
    png.data[i + 2] = b;
    png.data[i + 3] = 255;
  }
  return PNG.sync.write(png);
}

// The open tab's editor; the other tabs keep theirs, hidden.
export const OPEN_EDITOR = ".ss-code-editor:not([hidden]) .cm-content";

export async function setCode(page: Page, code: string) {
  await page.locator(OPEN_EDITOR).click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.insertText(code);
}

// Adds a buffer, the Canvas2D layer or shared GLSL code from the ⊕ above the code: from its menu, or
// straight away when it's the only thing ⊕ can add.
export async function addTab(page: Page, item: "Add a buffer" | "Add the Canvas2D layer" | "Add shared GLSL code") {
  const row = page.getByRole("tablist", {name: "Code, in the order it draws"});
  const menu = row.getByRole("button", {name: /^Add .* or /});
  const direct = row.getByRole("button", {name: item, exact: true});
  await menu.or(direct).waitFor();
  if (await direct.isVisible()) {
    await direct.click();
  } else {
    await menu.click();
    await page.getByRole("menuitem", {name: item}).click();
  }
}

// The Docs tab at the end of the code's tabs, and the docs it shows in place of the code.
export function docsTab(page: Page) {
  return page.getByRole("tablist", {name: "Code, in the order it draws"}).getByRole("tab", {name: /^Docs/});
}

export function docsPanel(page: Page) {
  return page.getByRole("region", {name: "Docs"});
}

export async function editorCode(page: Page): Promise<string> {
  return page.locator(OPEN_EDITOR).evaluate(el =>
    Array.from(el.querySelectorAll(".cm-line"), line => line.textContent).join("\n"));
}

export async function fileMenu(page: Page, item: string) {
  await page.getByRole("button", {name: "File", exact: true}).click();
  await page.getByRole("menu").getByText(item, {exact: true}).click();
}

export async function dismissAlert(page: Page): Promise<string> {
  // Other dialogs may stay open underneath the alert.
  const alert = page.getByRole("dialog").filter({has: page.getByRole("button", {name: "Ok"})}).last();
  const text = await alert.innerText();
  await alert.getByRole("button", {name: "Ok"}).click();
  await expect(page.getByRole("button", {name: "Ok"})).toHaveCount(0);
  return text;
}

// The colour in the middle of the canvas, or of `selector`.
export async function canvasCenter(page: Page, selector = "#canvas"): Promise<[number, number, number]> {
  await page.waitForTimeout(800);
  const png = PNG.sync.read(await page.locator(selector).screenshot());
  const i = (Math.floor(png.height / 2) * png.width + Math.floor(png.width / 2)) * 4;
  return [png.data[i]!, png.data[i + 1]!, png.data[i + 2]!];
}

export function near(color: number[], target: number[], tolerance = 40): boolean {
  return color.every((c, i) => Math.abs(c - target[i]!) <= tolerance);
}

// How long checks of the canvas's pixels wait: CI's software WebGL can take seconds to draw.
export const PIXEL_WAIT = {timeout: 30_000};
// How long checks wait for the page to show a change while software WebGL is busy, as during a render:
// the page gets no new frames until the GPU process finishes its work, which can take seconds.
export const FRAME_WAIT = {timeout: 30_000};

// Waits until the middle of the canvas, or of `selector`, is near `color`; with `not`, until it isn't.
export async function expectCenter(page: Page, color: number[], {tolerance = 40, selector = "#canvas", not = false} = {}) {
  await expect.poll(async () => near(await canvasCenter(page, selector), color, tolerance), PIXEL_WAIT).toBe(!not);
}

// The selected transition's start and end times, from their boxes, like "1 — 4.1".
export async function transitionTimes(page: Page): Promise<string> {
  const time = async (id: string) => (await page.locator(id).inputValue()).replace(/ s$/, "");
  return `${await time("#startTimeInput")} — ${await time("#endTimeInput")}`;
}

// Makes a new animation 12 seconds long with nothing on its timeline, in place of iFloat0's phase.
// The timeline must be in sight.
export async function blankTimeline(page: Page) {
  await page.locator(".timeArea .variableRow").first().locator(".transition").click();
  await page.keyboard.press("Delete");
  await expect(page.locator(".timeArea .transition")).toHaveCount(0);
  await page.locator(".durationInput").fill("12");
  await page.locator(".durationInput").press("Enter");
  await expect(page.locator(".durationInput")).toHaveValue("12 s");
}
