// A video in a texture slot shows its frame at the animation's time, in the preview, in the
// Canvas2D layer, in a render and in a player file, starting again from its first frame when it ends.
import { expect, test, type Page } from '@playwright/test';
import { unzipSync } from 'fflate';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

import { formatDuration } from '../src/lib/media';
import { addTab, canvasCenter, dismissAlert, expectCenter, near, offline, PIXEL_WAIT, setCode, skipTour } from './helpers';

// 2 seconds of 64×48 video at 10fps: red, then green, blue and white, half a second each.
const COLOURS = fileURLToPath(new URL("fixtures/colours.webm", import.meta.url));
// 0.4 seconds of 32×24 video at 30fps, each frame a different colour, with WebM's times in whole
// milliseconds: frame 2 starts at 0.067s, just after 2/30s.
const FRAMES = fileURLToPath(new URL("fixtures/frames30.webm", import.meta.url));
const FRAME_COLOURS = [
  [255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 0], [0, 255, 255], [255, 0, 255],
  [255, 255, 255], [0, 0, 0], [128, 128, 128], [255, 128, 0], [0, 128, 255], [128, 0, 255],
];
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
  "  ctx.drawImage(textures[0], 0, 0, width, height);\n}";
// The shader shows the video on the left, and the layer on the right.
const LEFT_SHADER = `void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / iResolution.xy;
  fragColor = uv.x < 0.5 ? texture(iTexture0, uv) : vec4(0., 0., 0., 1.);
}
`;
const DRAWS_RIGHT = "function draw(ctx, {width, height, textures}) {\n  clear(ctx);\n" +
  "  ctx.drawImage(textures[0], width / 2, 0, width / 2, height);\n}";

test.beforeEach(async ({context}) => {
  await skipTour(context);
});

async function start(page: Page, code: string, duration = DURATION) {
  await page.goto("./");
  await page.getByRole("button", {name: "Continue"}).click();
  await setCode(page, code);
  await page.keyboard.press("Shift+Enter");
  await page.locator(".durationInput").fill(String(duration));
  await page.locator(".durationInput").press("Enter");
}

// Each fixture's length in seconds.
const LENGTHS: Record<string, number> = {[COLOURS]: 2, [FRAMES]: 0.4};

async function addVideo(page: Page, path = COLOURS, size = "64 × 48") {
  const name = path.split("/").pop()!;
  await page.getByRole("tab", {name: "Textures"}).click();
  await page.locator("div#textures .texture button").first().click();
  const picker = page.getByRole("dialog", {name: "iTexture0"});
  await picker.getByRole("button", {name: "Add image or video"}).click();
  await picker.locator(".dropzone input[type=file]").setInputFiles(path);
  await picker.getByRole("button", {name: "Add", exact: true}).click();
  await page.getByText("Video added.").waitFor({timeout: 30_000});
  await dismissAlert(page);
  // The new video's tile gives its size and its length.
  const tile = picker.locator(".picker").filter({has: page.getByRole("img", {name: name + " preview"})});
  const length = formatDuration(LENGTHS[path])!;
  await expect(tile).toContainText(size);
  await expect(tile.locator(".videoLength")).toHaveText(length);
  await picker.getByRole("img", {name: name + " preview"}).click();
  await page.getByRole("button", {name: "Apply changes"}).click();
  await expect(page.locator("div#textures video[aria-label='iTexture0 preview']")).toBeVisible();
  await expect(page.locator("div#textures .texture").first().locator(".videoLength")).toHaveText(length);
}

async function addLayer(page: Page, code: string) {
  await addTab(page, "Add the Canvas2D layer");
  await setCode(page, code);
  await page.keyboard.press("Shift+Enter");
}

// Moves the playhead with the digit keys, each a tenth of the animation's length.
async function seek(page: Page, time: number) {
  await page.locator("#canvas").click();
  await page.keyboard.press(String(Math.round(time / DURATION * 10)));
  await expect(page.getByRole("slider", {name: "Time"})).toHaveAttribute("aria-valuenow", String(time));
}

// Renders PNG frames at `fps`, and returns the colour in the middle of each.
async function renderFrames(page: Page, fps = 4): Promise<number[][]> {
  await page.getByRole("button", {name: "Render"}).click();
  const modal = page.getByRole("dialog", {name: /Render/});
  await modal.locator("input[type=number]").first().fill("64");
  await modal.locator("input[type=number]").nth(1).fill(String(fps));
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

// The colours a quarter of the way across the canvas and three quarters of the way.
async function leftAndRight(page: Page, selector: string): Promise<number[][]> {
  const png = PNG.sync.read(await page.locator(selector).screenshot());
  const y = Math.floor(png.height / 2);
  return [Math.floor(png.width / 4), Math.floor(png.width * 3 / 4)].map(x => {
    const i = (y * png.width + x) * 4;
    return [png.data[i]!, png.data[i + 1]!, png.data[i + 2]!];
  });
}

// Waits until the shader's half and the layer's half show the same frame of the video.
async function expectSameFrame(page: Page, selector: string) {
  await expect.poll(async () => {
    const [left, right] = await leftAndRight(page, selector);
    return near(left!, right!, 20) && FRAME_COLOURS.some(colour => near(left!, colour));
  }, PIXEL_WAIT).toBe(true);
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

test("a sample video can be chosen for a slot, and plays as a texture, starting again when it ends", async ({page, context}) => {
  const errors = await offline(context);
  await start(page, LEFT_SHADER.replace("uv.x < 0.5", "true"));
  await page.getByRole("tab", {name: "Textures"}).click();
  await page.locator("div#textures .texture button").first().click();
  const picker = page.getByRole("dialog", {name: "iTexture0"});
  await picker.getByRole("region", {name: "Videos"}).getByAltText("videos/train.mp4 preview").click();
  await page.getByRole("button", {name: "Apply changes"}).click();
  const thumbnail = page.locator("div#textures video[aria-label='iTexture0 preview']");
  await expect(thumbnail).toBeVisible();

  // Twice the video's length, so a tenth of the way in and six tenths are one video length apart.
  const length = await thumbnail.evaluate(async (video: HTMLVideoElement) => {
    while (!Number.isFinite(video.duration)) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    return video.duration;
  });
  await page.locator(".durationInput").fill(String(2 * length));
  await page.locator(".durationInput").press("Enter");
  const colourAt = async (tenths: number) => {
    await page.locator("#canvas").click();
    await page.keyboard.press(String(tenths));
    return canvasCenter(page);
  };
  await expect.poll(async () => near(await colourAt(1), [0, 0, 0]), PIXEL_WAIT).toBe(false);
  const first = await colourAt(1);
  await expect.poll(async () => near(await colourAt(3), first), PIXEL_WAIT).toBe(false);
  await expect.poll(async () => near(await colourAt(6), first, 20), PIXEL_WAIT).toBe(true);
  expect(errors).toEqual([]);
});

test("a render at a video's own frame rate shows each of its frames once", async ({page, context}) => {
  const errors = await offline(context);
  await start(page, LEFT_SHADER.replace("uv.x < 0.5", "true"), 0.4);
  await addVideo(page, FRAMES, "32 × 24");
  const frames = await renderFrames(page, 30);
  expect(frames).toHaveLength(FRAME_COLOURS.length);
  frames.forEach((colour, i) => {
    expect(near(colour, FRAME_COLOURS[i]!), `frame ${i} is ${colour.join(",")}`).toBe(true);
  });
  expect(errors).toEqual([]);
});

test("the Canvas2D layer draws a video texture's frame at each step's time", async ({page, context}) => {
  const errors = await offline(context);
  await start(page, BLACK_SHADER);
  await addVideo(page);
  await addLayer(page, DRAWS_TEXTURE);
  await expectCenter(page, RED);
  expectFrames(await renderFrames(page));

  // Opened paused, the layer waits for the video to load rather than drawing without it.
  await page.keyboard.press("ControlOrMeta+s");
  await expect(page).toHaveURL(/#anim\/[a-f0-9]+$/);
  await page.reload();
  await expectCenter(page, RED);
  expect(errors).toEqual([]);
});

test("after pausing, the Canvas2D layer and the shaders show the same frame of a video", async ({page, context}) => {
  const errors = await offline(context);
  await start(page, LEFT_SHADER);
  await addVideo(page, FRAMES, "32 × 24");
  await addLayer(page, DRAWS_RIGHT);
  await expectSameFrame(page, "#canvas");
  for (const wait of [700, 1100]) {
    await page.getByRole("button", {name: "Play"}).click();
    await page.waitForTimeout(wait);
    await page.getByRole("button", {name: "Pause"}).click();
    await expectSameFrame(page, "#canvas");
  }
  expect(errors).toEqual([]);
});

test("a player file plays a video texture, in the shaders and the Canvas2D layer", async ({page, context}) => {
  const errors = await offline(context);
  await start(page, LEFT_SHADER);
  await addVideo(page, FRAMES, "32 × 24");
  await addLayer(page, DRAWS_RIGHT);
  await page.getByRole("button", {name: "Share", exact: true}).click();
  const modal = page.getByRole("dialog", {name: "Share"});
  const download = page.waitForEvent("download");
  await modal.getByRole("button", {name: "Download player file"}).click();
  const path = test.info().outputPath("player.html");
  await (await download).saveAs(path);
  await page.keyboard.press("Escape");

  const player = await context.newPage();
  await player.goto("file://" + path);
  await expect(player.locator("canvas")).toBeVisible();
  await player.waitForTimeout(1000);
  await player.locator("canvas").click();
  await expect(player.getByText("Paused")).toBeVisible();
  await expectSameFrame(player, "canvas");
  await player.close();
  expect(errors).toEqual([]);
});
