// Saving, uploads, a browser restart, downloads, and importing into fresh browsers.
import { chromium, expect, test, type BrowserContext, type Page } from '@playwright/test';
import { strFromU8, unzipSync } from 'fflate';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PNG } from 'pngjs';

import {
  canvasCenter, dismissAlert, editorCode, fileMenu, MAGENTA, near, offline, setCode, solidPNG, TEXTURE_SHADER,
} from './helpers';

test.describe.configure({mode: "serial"});

// Made in beforeAll: the runner also loads this file to list tests, and only workers run afterAll.
let dir = "";
let zipPath = "";
let onePath = "";
let docId = "";

// The parts of the downloaded files these tests read.
interface ExportManifest {
  images: {id: string; file: string}[];
}
interface AnimationFile {
  format: string;
  images: Record<string, unknown>;
  document: Record<string, unknown>;
}

test.beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "smoothstep-e2e-"));
  zipPath = join(dir, "export.zip");
  onePath = join(dir, "one.smoothstep.json");
});
test.afterAll(() => rmSync(dir, {recursive: true, force: true}));

async function browser(name: string, baseURL: string): Promise<{context: BrowserContext; page: Page; errors: string[]}> {
  const context = await chromium.launchPersistentContext(join(dir, "profile-" + name), {
    headless: true, viewport: {width: 1440, height: 900}, acceptDownloads: true, baseURL,
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  const errors = await offline(context);
  const page = context.pages()[0] ?? await context.newPage();
  page.setDefaultTimeout(15_000);
  return {context, page, errors};
}

async function openDialog(page: Page) {
  await fileMenu(page, "Open");
  return page.getByRole("dialog", {name: "Open"});
}

// A file holding one animation opens it, adding it to the browser's animations unless it's there.
async function openFile(page: Page, path: string): Promise<string> {
  // Opening reloads the page, even when the animation is already open.
  const loaded = page.waitForEvent("load");
  await page.getByTestId("importInput").setInputFiles(path);
  await loaded;
  await expect(page.locator("#titleInput")).toHaveValue("Static test");
  expect(page.url()).toMatch(/#anim\/\w+$/);
  return page.url().split("/").pop()!;
}

async function savedCount(page: Page): Promise<number> {
  const modal = await openDialog(page);
  await expect(modal.locator("tbody tr").first()).toBeVisible();
  const rows = await modal.locator("tbody tr").count();
  await page.keyboard.press("Escape");
  await expect(modal).toBeHidden();
  return rows;
}

test("first visit: make and save an animation with an uploaded texture", async ({baseURL}) => {
  const {context, page, errors} = await browser("a", baseURL!);
  await page.goto("./");
  const splash = page.getByRole("dialog");
  await expect(splash).toContainText("saved in this browser");
  await expect(page.getByText(/Sign in|Log in/)).toHaveCount(0);
  await page.getByRole("button", {name: "Continue"}).click();

  await setCode(page, TEXTURE_SHADER);
  await page.keyboard.press("Shift+Enter");
  await page.getByRole("tab", {name: "Textures"}).click();
  await page.locator("div#textures .texture button").first().click();
  const picker = page.getByRole("dialog", {name: "iTexture0"});
  await picker.getByRole("button", {name: "Add image"}).click();
  // Wider than 4096px, so it should be shrunk to 4096 x 3072.
  await picker.locator(".dropzone input[type=file]").setInputFiles(
    {name: "magenta.png", mimeType: "image/png", buffer: solidPNG(5000, 3750, MAGENTA)});
  await picker.getByRole("button", {name: "Add", exact: true}).click();
  await page.getByText("Image added.").waitFor({timeout: 30_000});
  await dismissAlert(page);
  const resolution = await picker.locator("img[alt='magenta.png preview'] + .resolution").innerText();
  expect(resolution).toMatch(/4096\D+3072/);
  await picker.locator("img[alt='magenta.png preview']").click();
  await page.getByRole("button", {name: "Apply changes"}).click();

  await page.locator("#titleInput").fill("Static test");
  await page.locator("#titleInput").press("Tab");
  await fileMenu(page, "Save");
  await expect(page).toHaveURL(/#anim\/[a-f0-9]{12}$/);
  docId = page.url().split("/").pop()!;
  expect(near(await canvasCenter(page), MAGENTA)).toBe(true);
  expect(errors).toEqual([]);
  await context.close();
});

test("after a browser restart the animation and texture are still there", async ({baseURL}) => {
  const {context, page, errors} = await browser("a", baseURL!);
  await page.goto("./#anim/" + docId);
  await expect(page.locator("#titleInput")).toHaveValue("Static test");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("tab", {name: "Textures"}).click();
  expect(await page.locator("div#textures .texture img").first().getAttribute("src")).toMatch(/^blob:/);
  expect(near(await canvasCenter(page), MAGENTA)).toBe(true);

  const modal = await openDialog(page);
  await expect(modal.locator("tbody tr")).toHaveCount(1);
  let download = page.waitForEvent("download");
  await modal.getByRole("button", {name: "Download all files"}).click();
  await (await download).saveAs(zipPath);
  download = page.waitForEvent("download");
  await modal.locator("button[title='Download file']").first().click();
  await (await download).saveAs(onePath);

  await modal.getByText("Static test").click();
  await expect(page).toHaveURL(new RegExp("#anim/" + docId + "$"));
  await expect(page.locator("#titleInput")).toHaveValue("Static test");

  // A hash-only goto returns before the app's own reload, so load the page fresh.
  await page.goto("about:blank");
  await page.goto("./#example/534226b1d5ed");
  await expect(page.locator("#titleInput")).toHaveValue("Minimal Animation");
  await page.goto("./");
  await expect(page.getByRole("dialog")).toContainText("Static test");
  expect(errors).toEqual([]);
  await context.close();
});

test("the downloads hold the animation, thumbnail and shrunk image", () => {
  const files = unzipSync(readFileSync(zipPath));
  const manifest = JSON.parse(strFromU8(files["manifest.json"]!)) as ExportManifest;
  const image = manifest.images[0]!;
  expect(Object.keys(files).sort()).toEqual(
    ["manifest.json", `animations/${docId}.json`, `thumbnails/${docId}.png`, image.file].sort());
  const png = PNG.sync.read(Buffer.from(files[image.file]!));
  expect([png.width, png.height]).toEqual([4096, 3072]);
  const one = JSON.parse(readFileSync(onePath, "utf8")) as AnimationFile;
  expect(one.format).toBe("smoothstep-animation");
  expect(Object.keys(one.images)).toEqual([image.id]);
});

test("a fresh browser opens the zip of its one animation, then finds the single file already there", async ({baseURL}) => {
  const {context, page, errors} = await browser("b", baseURL!);
  await page.goto("./#new");
  expect(await openFile(page, zipPath)).toBe(docId);
  expect(await openFile(page, onePath)).toBe(docId);
  expect(near(await canvasCenter(page), MAGENTA)).toBe(true);
  expect(await savedCount(page)).toBe(1);
  expect(errors).toEqual([]);
  await context.close();
});

test("another fresh browser imports the single file, recognises bare JSON, and keeps edits", async ({baseURL}) => {
  const {context, page, errors} = await browser("c", baseURL!);
  await page.goto("./#new");
  expect(await openFile(page, onePath)).toBe(docId);
  expect(near(await canvasCenter(page), MAGENTA)).toBe(true);

  // The same document as bare JSON, keys in another order, is recognised.
  const one = JSON.parse(readFileSync(onePath, "utf8")) as AnimationFile;
  const barePath = join(dir, "bare.json");
  writeFileSync(barePath, JSON.stringify(Object.fromEntries(Object.entries(one.document).reverse())));
  expect(await openFile(page, barePath)).toBe(docId);
  expect(await savedCount(page)).toBe(1);

  // Edit and save the local copy, then import the older file twice: one extra copy, not two.
  await setCode(page, "// edited");
  await page.keyboard.press("ControlOrMeta+s");
  await expect(page.getByText("Animation saved.")).toBeVisible();
  const older = await openFile(page, onePath);
  expect(older).not.toBe(docId);
  expect(await openFile(page, onePath)).toBe(older);
  expect(await savedCount(page)).toBe(2);

  // File > New with unsaved changes: cancelling keeps the URL and code; accepting resets, even from #new.
  const before = page.url();
  await setCode(page, "// unsaved");
  page.once("dialog", dialog => void dialog.dismiss());
  await fileMenu(page, "New");
  await page.waitForTimeout(500);
  expect(page.url()).toBe(before);
  expect(await editorCode(page)).toBe("// unsaved");
  page.once("dialog", dialog => void dialog.accept());
  await fileMenu(page, "New");
  await expect(page).toHaveURL(/#new$/);
  // The URL changes before the reload, so wait for the new page's code.
  await expect.poll(() => editorCode(page)).toContain("Getting started");
  await setCode(page, "// unsaved again");
  page.once("dialog", dialog => void dialog.accept());
  await fileMenu(page, "New");
  await expect.poll(() => editorCode(page)).toContain("Getting started");
  expect(errors).toEqual([]);
  await context.close();
});
