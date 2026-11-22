// Sharing without a server: share links, files opened from a URL or gist, the embedded player,
// player files, and the timeline's #define names.
import { expect, test, type Page } from '@playwright/test';
import { PNG } from 'pngjs';

import { canvasCenter, dismissAlert, editorCode, fileMenu, MAGENTA, near, offline, setCode, skipTour, solidPNG, TEXTURE_SHADER } from './helpers';

const FILE_URL = "https://example.com/anims/magenta.smoothstep.json";

function emptyDocument(title: string, code: string) {
  return {
    title, code, duration: 4, aspectRatio: [1, 1],
    textures: Array.from({length: 8}, (_, i) => ({id: "iTexture" + i, url: "special/black.png", isUserUploaded: false})),
    variables: Array.from({length: 16}, () => ({transitions: []})),
  };
}

// An animation file whose iTexture0 is the user's own magenta image, embedded in the file.
function animationFile() {
  const document = emptyDocument("Magenta file", TEXTURE_SHADER);
  document.textures[0] = {id: "iTexture0", url: "0a1b2c3d4e5f", isUserUploaded: true};
  return {
    format: "smoothstep-animation", version: 1, id: "0a1b2c3d4e5f", title: "Magenta file",
    document,
    images: {"0a1b2c3d4e5f": {filename: "magenta.png", width: 8, height: 8,
      data: "data:image/png;base64," + solidPNG(8, 8, MAGENTA).toString("base64")}},
  };
}

async function serve(page: Page, url: string, body: unknown, status = 200) {
  await page.context().route(url, route => route.fulfill({
    status, contentType: "application/json", headers: {"Access-Control-Allow-Origin": "*"},
    body: JSON.stringify(body),
  }));
}

async function centerOf(page: Page, selector: string): Promise<[number, number, number]> {
  await page.waitForTimeout(800);
  const png = PNG.sync.read(await page.locator(selector).screenshot());
  const i = (Math.floor(png.height / 2) * png.width + Math.floor(png.width / 2)) * 4;
  return [png.data[i]!, png.data[i + 1]!, png.data[i + 2]!];
}

async function shareDialog(page: Page) {
  await page.getByRole("button", {name: "Share"}).click();
  return page.getByRole("dialog", {name: "Share"});
}

test.beforeEach(async ({context}) => {
  // No tour offer over the header's buttons.
  await skipTour(context);
});

test("a share link carries the animation", async ({page, context}) => {
  const errors = await offline(context);
  await page.goto("./#example/534226b1d5ed");
  await expect(page.locator("#titleInput")).toHaveValue("Minimal Animation");
  // An unchanged example shares its own short link.
  let modal = await shareDialog(page);
  await expect(modal.getByLabel("Link", {exact: true})).toHaveValue(/\/sub\/#example\/534226b1d5ed$/);
  await page.keyboard.press("Escape");

  const code = "void mainImage(out vec4 fragColor, in vec2 fragCoord) {\n  fragColor = vec4(0.86, 0.08, 0.78, 1.);\n}";
  await setCode(page, code);
  await page.keyboard.press("Shift+Enter");
  modal = await shareDialog(page);
  const link = await modal.getByLabel("Link", {exact: true}).inputValue();
  expect(link).toMatch(/\/sub\/#share\/[\w-]+$/);
  await expect(modal.getByLabel("Code for a web page")).toHaveValue(/<iframe src="http:\/\/localhost:\d+\/sub\/embed\.html#share\//);
  await modal.getByRole("button", {name: "Show QR code"}).click();
  await expect(modal.getByAltText("QR code of the link")).toBeVisible();

  const other = await context.newPage();
  await other.goto(link);
  await expect(other.locator("#titleInput")).toHaveValue("Minimal Animation");
  expect(await editorCode(other)).toBe(code);
  expect(near(await canvasCenter(other), MAGENTA)).toBe(true);
  expect(errors).toEqual([]);
});

test("opens an animation file from a URL with its images, and keeps them once saved", async ({page, context}) => {
  const errors = await offline(context);
  await serve(page, FILE_URL, animationFile());
  await page.goto("./#url/" + FILE_URL);
  await expect(page.locator("#titleInput")).toHaveValue("Magenta file");
  expect(near(await canvasCenter(page), MAGENTA)).toBe(true);
  // Not saved yet, so the image isn't among the user's images.
  const modal = await shareDialog(page);
  await expect(modal.getByLabel("Link", {exact: true})).toHaveValue(/#url\/https:\/\/example\.com\//);
  await expect(modal.getByText("can't carry the images")).toHaveCount(0);

  // The player file plays the animation with its image, opened straight from the download.
  const download = page.waitForEvent("download");
  await modal.getByRole("button", {name: "Download player file"}).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("Magenta file.html");
  const path = test.info().outputPath("player.html");
  await file.saveAs(path);
  await page.keyboard.press("Escape");
  const player = await context.newPage();
  await player.goto("file://" + path);
  await expect(player).toHaveTitle("Magenta file");
  expect(near(await centerOf(player, "canvas"), MAGENTA)).toBe(true);
  await player.close();

  await page.getByRole("button", {name: "Save"}).click();
  await expect(page).toHaveURL(/#anim\/[a-f0-9]+$/);
  await page.reload();
  await expect(page.locator("#titleInput")).toHaveValue("Magenta file");
  expect(near(await canvasCenter(page), MAGENTA)).toBe(true);
  // Edited and saved, it now shares a link that leaves the image out.
  const saved = await shareDialog(page);
  await expect(saved.getByLabel("Link", {exact: true})).toHaveValue(/#share\//);
  await expect(saved.getByText("iTexture0 will be empty")).toBeVisible();
  expect(errors).toEqual([]);
});

test("opens a gist from Open from link", async ({page, context}) => {
  await offline(context);
  await serve(page, "https://api.github.com/gists/abc123", {files: {
    "magenta.smoothstep.json": {filename: "magenta.smoothstep.json", content: JSON.stringify(animationFile())},
  }});
  await page.goto("./#new");
  await fileMenu(page, "Open from link");
  const modal = page.getByRole("dialog", {name: "Open from link"});
  await modal.getByLabel("Link", {exact: true}).fill("not a link");
  await modal.getByRole("button", {name: "Open"}).click();
  await expect(modal).toContainText("That isn't a link to an animation.");
  await modal.getByLabel("Link", {exact: true}).fill("https://gist.github.com/someone/abc123");
  await modal.getByRole("button", {name: "Open"}).click();
  await expect(page).toHaveURL(/#gist\/abc123$/);
  await expect(page.locator("#titleInput")).toHaveValue("Magenta file");
  expect(near(await canvasCenter(page), MAGENTA)).toBe(true);
});

test("says why a link didn't open", async ({page, context}) => {
  await offline(context);
  await serve(page, "https://example.com/missing.json", {}, 404);
  await page.goto("./#url/https://example.com/missing.json");
  expect(await dismissAlert(page)).toContain("Couldn't find an animation file at https://example.com/missing.json.");
  // A hash-only goto returns before the app's own reload, so load the page fresh.
  await page.goto("about:blank");
  await page.goto("./#url/https://blocked.example/a.json");
  expect(await dismissAlert(page)).toContain("the site may not let other websites read its files");
});

test("the embedded player plays a shared animation", async ({page, context}) => {
  const errors = await offline(context);
  await serve(page, FILE_URL, animationFile());
  await page.goto("./embed.html#url/" + FILE_URL);
  await expect(page).toHaveTitle("Magenta file - smoothstep.io");
  expect(near(await centerOf(page, "canvas"), MAGENTA)).toBe(true);
  await expect(page.getByRole("link", {name: "Open in smoothstep.io"})).toHaveAttribute(
    "href", /\/sub\/#url\/https:\/\/example\.com\//);
  await page.locator("canvas").click();
  await expect(page.getByText("Paused")).toBeVisible();

  await page.goto("about:blank");
  await page.goto("./embed.html#example/0000");
  // vite preview answers a missing file with index.html, where a static host would say 404.
  await expect(page.getByText(/There's no example with that link|That isn't a smoothstep.io animation file/)).toBeVisible();
  expect(errors).toEqual([]);
});

test("timeline rows take their #define names", async ({page, context}) => {
  await offline(context);
  await page.goto("./#new");
  await setCode(page, "#define radius iFloat1\n" + TEXTURE_SHADER);
  await expect(page.locator(".rowLabel").nth(0)).toHaveText("iFloat0");
  await expect(page.locator(".rowLabel").nth(1)).toHaveText("radius");
});

test("Copy still copies the link where the clipboard API is blocked", async ({page, context}) => {
  const errors = await offline(context);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  // As on a page served over plain http from another computer.
  await context.addInitScript(() => {
    navigator.clipboard.writeText = () => Promise.reject(new DOMException("Blocked", "NotAllowedError"));
  });
  await page.goto("./#example/534226b1d5ed");
  await expect(page.locator("#titleInput")).toHaveValue("Minimal Animation");
  const modal = await shareDialog(page);
  const link = await modal.getByLabel("Link", {exact: true}).inputValue();
  await modal.getByRole("button", {name: "Copy"}).first().click();
  await expect(page.getByText("Copied")).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(link);
  await expect(modal).toBeVisible();
  expect(errors).toEqual([]);
});

test("Share makes a link to an animation file put online", async ({page, context}) => {
  const errors = await offline(context);
  await page.goto("./#example/534226b1d5ed");
  await expect(page.locator("#titleInput")).toHaveValue("Minimal Animation");
  const modal = await shareDialog(page);
  const download = page.waitForEvent("download");
  await modal.getByRole("button", {name: "Download animation file"}).click();
  expect((await download).suggestedFilename()).toMatch(/\.smoothstep\.json$/);

  const address = modal.getByLabel("Address of the gist or file");
  await address.fill("not a link");
  await expect(modal.getByText("That isn't the address of a gist or a file.")).toBeVisible();
  await address.fill("https://gist.github.com/someone/abc123");
  await expect(modal.getByLabel("Link to the file")).toHaveValue(/\/sub\/#gist\/abc123$/);
  await address.fill("https://github.com/o/r/blob/main/a.smoothstep.json");
  await expect(modal.getByLabel("Link to the file")).toHaveValue(
    /\/sub\/#url\/https:\/\/raw\.githubusercontent\.com\/o\/r\/main\/a\.smoothstep\.json$/);
  await address.fill("gist.github.com/someone/abc123");
  await expect(modal.getByLabel("Link to the file")).toHaveValue(/\/sub\/#gist\/abc123$/);
  await address.fill("http://example.com/a.json");
  await expect(modal.getByText(/Use the file's https address/)).toBeVisible();

  // Closed and opened again, the dialog starts with an empty address.
  await page.keyboard.press("Escape");
  await expect(modal).toBeHidden();
  await shareDialog(page);
  await expect(address).toHaveValue("");
  expect(errors).toEqual([]);
});
