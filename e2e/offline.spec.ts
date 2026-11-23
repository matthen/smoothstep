// The service worker: after one visit the app loads and works with no network, textures and examples
// keep once used, and a new version waits for the user to reload into it.
import { expect, test, type Page } from '@playwright/test';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';

import { addTab, canvasCenter, dismissAlert, docsPanel, MAGENTA, near, offline, OPEN_EDITOR, setCode, skipTour } from './helpers';

test.use({serviceWorkers: "allow"});

test.beforeEach(async ({context}) => {
  await skipTour(context);
});

// Resolves once the worker has installed everything and controls the page.
async function waitForWorker(page: Page) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise(resolve => navigator.serviceWorker.addEventListener("controllerchange", resolve, {once: true}));
    }
  });
}

const MAGENTA_HALF = "function draw(ctx, {width, height}) {\n  clear(ctx);\n" +
  "  ctx.fillStyle = \"rgb(220, 20, 200)\";\n  ctx.fillRect(0, 0, width, height);\n}";
const BLUE_IMAGE = "void mainImage(out vec4 fragColor, in vec2 fragCoord) {\n  fragColor = vec4(0., 0., 1., 1.);\n}";

test("after one visit, the app loads and works with no network", async ({page, context}) => {
  const errors = await offline(context);
  await page.goto("./#new");
  await waitForWorker(page);
  await context.setOffline(true);

  await page.goto("./index.html?from=home#new");
  await expect(page.locator(OPEN_EDITOR)).toBeVisible();
  await setCode(page, BLUE_IMAGE);
  await page.keyboard.press("Shift+Enter");
  await expect(async () => expect(near(await canvasCenter(page), [0, 0, 255])).toBe(true)).toPass();

  // The Docs tab and the Canvas2D layer's editor load parts of the app only when first used.
  await page.getByRole("button", {name: "Help"}).click();
  await page.getByRole("menuitem", {name: "Documentation"}).click();
  await expect(docsPanel(page)).toContainText("smoothstep.io documentation");

  await addTab(page, "Add the Canvas2D layer");
  await setCode(page, 'import planck from "planck";\n' + MAGENTA_HALF);
  await page.keyboard.press("Shift+Enter");
  await expect(async () => expect(near(await canvasCenter(page), MAGENTA)).toBe(true)).toPass({timeout: 15_000});

  await page.keyboard.press("ControlOrMeta+s");
  await expect(page).toHaveURL(/#anim\/[a-f0-9]+$/);
  const link = page.url();

  // Render, which loads the exporter only when first used.
  await page.locator(".durationInput").fill("1");
  await page.getByRole("button", {name: "Render"}).click();
  const modal = page.getByRole("dialog", {name: /Render/});
  await modal.locator("input[type=number]").first().fill("64");
  await modal.locator("select").selectOption("gif");
  const download = page.waitForEvent("download", {timeout: 90_000});
  await modal.getByRole("button", {name: "Render"}).click();
  expect((await download).suggestedFilename()).toMatch(/\.gif$/);
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // The embedded player and the docs site load offline too.
  const other = await context.newPage();
  await other.goto(link.replace("/sub/#", "/sub/embed.html#"));
  await expect(other.locator("canvas")).toBeVisible();
  await other.goto("./docs/");
  await expect(other.getByRole("heading", {name: "smoothstep.io documentation"})).toBeVisible();
  await other.goto("./docs/canvas2d.html");
  await expect(other.getByRole("heading", {level: 1})).toBeVisible();
  expect(errors).toEqual([]);
});

test("textures and examples work offline once used, and others fail as they would without the worker", async ({page, context}) => {
  const errors = await offline(context);
  // "Using textures" shows photos/cats2.jpg.
  await page.goto("./#example/b2482911f435");
  await expect(page.locator("#titleInput")).toHaveValue("Using textures");
  await waitForWorker(page);
  // Opened again now the worker controls the page, which keeps the example and its texture.
  await page.reload();
  await expect(page.locator("#titleInput")).toHaveValue("Using textures");
  const online = await canvasCenter(page);
  expect(near(online, [0, 0, 0], 20)).toBe(false);

  // Previews play in video elements, which ask for parts of the file.
  const part = () => page.evaluate(async () => {
    const response = await fetch("examples/b2482911f435.mp4", {headers: {Range: "bytes=10-109"}});
    return {status: response.status, length: (await response.arrayBuffer()).byteLength};
  });
  expect(await part()).toEqual({status: 206, length: 100});

  await context.setOffline(true);
  await page.reload();
  await expect(page.locator("#titleInput")).toHaveValue("Using textures");
  expect(await part()).toEqual({status: 206, length: 100});
  await expect(async () => expect(near(await canvasCenter(page), online, 30)).toBe(true)).toPass();

  // A texture never used: the slot stays black, as with no network and no worker.
  await page.getByRole("tab", {name: "Textures"}).click();
  await page.locator("#textures .texture button").first().click();
  const picker = page.getByRole("dialog");
  await picker.getByAltText("photos/nickypainting.jpg preview").click();
  await picker.getByRole("button", {name: "Apply changes"}).click();
  await expect(async () => expect(near(await canvasCenter(page), [0, 0, 0], 20)).toBe(true)).toPass();

  // An example never opened says it couldn't load.
  await page.goto("./#example/d692b3fe2561");
  expect(await dismissAlert(page)).toMatch(/Couldn't download that example. You may be offline/);
  // The app logs the error it showed.
  expect(errors.filter(error => !error.includes("Couldn't download that example"))).toEqual([]);
});

const TYPES: Record<string, string> = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".webmanifest": "application/manifest+json", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml",
  ".woff2": "font/woff2", ".mp4": "video/mp4", ".ico": "image/x-icon",
};

// A copy of the build at /app/ on a server of its own, so a test can publish a new version.
async function serveCopy() {
  const root = mkdtempSync(join(tmpdir(), "smoothstep-"));
  cpSync("dist", join(root, "app"), {recursive: true});
  const server = createServer((request, response) => {
    let path = join(root, decodeURIComponent(new URL(request.url!, "http://x").pathname));
    if (path.endsWith("/")) {
      path += "index.html";
    }
    try {
      const body = readFileSync(path);
      response.writeHead(200, {"Content-Type": TYPES[extname(path)] ?? "application/octet-stream", "Cache-Control": "no-cache"});
      response.end(body);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise<void>(resolve => server.listen(0, "localhost", resolve));
  return {
    url: `http://localhost:${(server.address() as AddressInfo).port}/app/`,
    // A new version, as after a deploy: the worker's file changes.
    publish: () => writeFileSync(join(root, "app/sw.js"), readFileSync(join(root, "app/sw.js"), "utf8") + "\n// v2\n"),
    close: () => {
      server.close();
      rmSync(root, {recursive: true, force: true});
    },
  };
}

test("a new version waits for Reload, which asks before losing unsaved changes", async ({page, context}) => {
  const errors = await offline(context);
  const site = await serveCopy();
  try {
    await page.goto(site.url + "#new");
    await waitForWorker(page);
    const notice = page.locator(".mantine-Notification-root").filter({hasText: "A new version of smoothstep.io is ready"});

    site.publish();
    await page.evaluate(async () => (await navigator.serviceWorker.ready).update());
    await expect(notice).toBeVisible();
    // It never reloads by itself.
    await page.locator("#titleInput").fill("Work in progress");
    await page.waitForTimeout(1000);
    await expect(page.locator("#titleInput")).toHaveValue("Work in progress");

    // Unsaved changes: Reload asks, and staying keeps the page and the notice.
    page.once("dialog", dialog => {
      expect(dialog.message()).toContain("unsaved changes");
      void dialog.dismiss();
    });
    await notice.getByRole("button", {name: "Reload"}).click();
    await page.waitForTimeout(500);
    await expect(page.locator("#titleInput")).toHaveValue("Work in progress");
    await expect(notice).toBeVisible();

    page.once("dialog", dialog => void dialog.accept());
    const before = await page.evaluate(() => navigator.serviceWorker.controller?.scriptURL);
    await Promise.all([page.waitForEvent("load"), notice.getByRole("button", {name: "Reload"}).click()]);
    await expect(page.locator(OPEN_EDITOR)).toBeVisible();
    await expect(notice).toHaveCount(0);
    // The new version controls the page and has nothing newer waiting.
    expect(await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready;
      return {waiting: registration.waiting !== null, script: navigator.serviceWorker.controller?.scriptURL};
    })).toEqual({waiting: false, script: before});
    expect(await page.evaluate(() => fetch("sw.js").then(r => r.text()))).toContain("// v2");
    expect(errors).toEqual([]);
  } finally {
    site.close();
  }
});

test("the worker only handles the app's own directory", async ({page, context}) => {
  const site = await serveCopy();
  try {
    await page.goto(site.url + "#new");
    await waitForWorker(page);
    const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
    expect(scope).toBe(site.url);
    await context.setOffline(true);
    // The site's root isn't the app's, so with no network it fails as usual.
    await expect(page.goto(new URL("/", site.url).href)).rejects.toThrow();
  } finally {
    site.close();
  }
});

test("files opened with the installed app are imported as File → Import imports them", async ({page, context}) => {
  const errors = await offline(context);
  const text = readFileSync("public/examples/534226b1d5ed.json", "utf8");
  // Chromium's launchQueue, holding a file as when the installed app opens one.
  await context.addInitScript(text => {
    const file = new File([text], "Minimal.smoothstep.json", {type: "application/json"});
    Object.defineProperty(window, "launchQueue", {value: {setConsumer: (consumer: (params: unknown) => void) => {
      if (window.location.hash === "") {
        consumer({files: [{getFile: () => Promise.resolve(file)}]});
      }
    }}});
  }, text);
  await page.goto("./");
  await expect(page).toHaveURL(/#anim\/[a-f0-9]+$/);
  await expect(page.locator("#titleInput")).toHaveValue("Minimal Animation");
  expect(errors).toEqual([]);
});
