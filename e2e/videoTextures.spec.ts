// A video in a texture slot shows its frame at the animation's time, in the preview, in the
// Canvas2D layer and in a render, starting again from its first frame when it ends.
import { expect, test, type Page } from '@playwright/test';
import { unzipSync } from 'fflate';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

import { addTab, dismissAlert, expectCenter, near, offline, setCode, skipTour } from './helpers';

// 2 seconds of 64×48 video at 10fps: red, then green, blue and white, half a second each.
const VIDEO = fileURLToPath(new URL("fixtures/colours.webm", import.meta.url));
const RED = [255, 0, 0];
const GREEN = [0, 255, 0];
const BLUE = [0, 0, 255];
const WHITE = [255, 255, 255];
// Times in the middle of each colour, the last after the video has started again.
const COLOURS_AT: [number, number[]][] = [[0.25, RED], [0.75, GREEN], [1.25, BLUE], [1.75, WHITE], [2.25, RED]];
const DURATION = 2.5;

// Shows the texture, or magenta if textureSize doesn't give the video's size.
const VIDEO_SHADER = `void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  fragColor = textureSize(iTexture0, 0) == ivec2(64, 48)
    ? texture(iTexture0, fragCoord / iResolution.xy) : vec4(1., 0., 1., 1.);
}
`;
const BLACK_SHADER = "void mainImage(out vec4 fragColor, in vec2 fragCoord) {\n  fragColor = vec4(0., 0., 0., 1.);\n}";
const DRAWS_TEXTURE = "function draw(ctx, {width, height, textures}) {\n  clear(ctx);\n" +
  "  if (textures[0]) {\n    ctx.drawImage(textures[0], 0, 0, width, height);\n  }\n}";

test.beforeEach(async ({context}) => {
  await skipTour(context);
});

async function start(page: Page, code: string) {
  await page.goto("./");
  await page.getByRole("button", {name: "Continue"}).click();
  await setCode(page, code);
  await page.keyboard.press("Shift+Enter");
  await page.locator(".durationInput").fill(String(DURATION));
  await page.locator(".durationInput").press("Enter");
}

async function addVideo(page: Page) {
  await page.getByRole("tab", {name: "Textures"}).click();
  await page.locator("div#textures .texture button").first().click();
  const picker = page.getByRole("dialog", {name: "iTexture0"});
  await picker.getByRole("button", {name: "Add image or video"}).click();
  await picker.locator(".dropzone input[type=file]").setInputFiles(VIDEO);
  await picker.getByRole("button", {name: "Add", exact: true}).click();
  await page.getByText("Video added.").waitFor({timeout: 30_000});
  await dismissAlert(page);
  await expect(picker.getByText("64 × 48, video")).toBeVisible();
  await picker.getByRole("img", {name: "colours.webm preview"}).click();
  await page.getByRole("button", {name: "Apply changes"}).click();
  await expect(page.locator("div#textures video[aria-label='iTexture0 preview']")).toBeVisible();
}

// Moves the playhead with the digit keys, each a tenth of the animation's length.
async function seek(page: Page, time: number) {
  await page.locator("#canvas").click();
  await page.keyboard.press(String(Math.round(time / DURATION * 10)));
  await expect(page.getByRole("slider", {name: "Time"})).toHaveAttribute("aria-valuenow", String(time));
}

// Renders PNG frames at 4 a second, and returns the colour in the middle of each.
async function renderFrames(page: Page): Promise<number[][]> {
  await page.getByRole("button", {name: "Render"}).click();
  const modal = page.getByRole("dialog", {name: /Render/});
  await modal.locator("input[type=number]").first().fill("64");
  await modal.locator("input[type=number]").nth(1).fill("4");
  await modal.locator("select").selectOption("png");
  const download = page.waitForEvent("download", {timeout: 90_000});
  await modal.getByRole("button", {name: "Render"}).click();
  const file = await download;
  const path = test.info().outputPath(file.suggestedFilename());
  await file.saveAs(path);
  const frames = unzipSync(readFileSync(path));
  return Object.keys(frames).sort().map(name => {
    const png = PNG.sync.read(Buffer.from(frames[name]!));
    const i = (Math.floor(png.height / 2) * png.width + Math.floor(png.width / 2)) * 4;
    return [png.data[i]!, png.data[i + 1]!, png.data[i + 2]!];
  });
}

// Frame k of a render at 4 a second is at k / 4 seconds.
function expectFrames(frames: number[][]) {
  expect(frames).toHaveLength(DURATION * 4);
  for (const [time, colour] of COLOURS_AT) {
    expect(near(frames[time * 4]!, colour), `frame at ${time}s is ${frames[time * 4]!.join(",")}`).toBe(true);
  }
}

test("a video texture shows its frame at the animation's time, scrubbed and rendered", async ({page, context}) => {
  const errors = await offline(context);
  await start(page, VIDEO_SHADER);
  await addVideo(page);
  for (const [time, colour] of COLOURS_AT) {
    await seek(page, time);
    await expectCenter(page, colour);
  }
  expectFrames(await renderFrames(page));
  expect(errors).toEqual([]);
});

test("the Canvas2D layer draws a video texture's frame at each step's time", async ({page, context}) => {
  const errors = await offline(context);
  await start(page, BLACK_SHADER);
  await addVideo(page);
  await addTab(page, "Add the Canvas2D layer");
  await setCode(page, DRAWS_TEXTURE);
  await page.keyboard.press("Shift+Enter");
  await expectCenter(page, RED);
  // A build starts the layer again at the playhead's time.
  await seek(page, 1.25);
  await page.getByRole("tab", {name: /^Canvas2D\.js/}).click();
  await page.locator(".ss-code-editor:not([hidden]) .cm-content").click();
  await page.keyboard.press("Shift+Enter");
  await expectCenter(page, BLUE);
  expectFrames(await renderFrames(page));
  expect(errors).toEqual([]);
});
