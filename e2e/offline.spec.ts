// The service worker: after one visit the app loads and works with no network, textures and examples
// keep once used, and a new version waits for the user to reload into it.
import { expect, test, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';

import { addTab, canvasCenter, dismissAlert, docsPanel, expectCenter, MAGENTA, near, offline, OPEN_EDITOR, setCode, skipTour } from './helpers';

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
  await expectCenter(page, [0, 0, 255]);

  // The Docs tab and the Canvas2D layer's editor load parts of the app only when first used.
  await page.getByRole("button", {name: "Help"}).click();
  await page.getByRole("menuitem", {name: "Documentation"}).click();
  await expect(docsPanel(page)).toContainText("smoothstep.io documentation");

  await addTab(page, "Add the Canvas2D layer");
  await setCode(page, 'import planck from "planck";\n' + MAGENTA_HALF);
  await page.keyboard.press("Shift+Enter");
  await expectCenter(page, MAGENTA);

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
  await expectCenter(page, online, {tolerance: 30});

  // A texture never used: the slot stays black, as with no network and no worker.
  await page.getByRole("tab", {name: "Textures"}).click();
  await page.locator("#textures .texture button").first().click();
  const picker = page.getByRole("dialog");
  await picker.getByAltText("photos/nickypainting.jpg preview").click();
  await picker.getByRole("button", {name: "Apply changes"}).click();
  await expectCenter(page, [0, 0, 0], {tolerance: 20});

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

// The cache plan built into sw.js, as in src/pwa/cachePlan.ts.
interface Plan {
  version: string;
  precache: Record<string, string>;
  runtime: Record<string, string>;
}
const revision = (data: string | Buffer) => createHash("sha256").update(data).digest("hex").slice(0, 16);
// What the live server sends for a file it doesn't have: the site's home page.
const HOME_PAGE = "<!doctype html><title>Home</title>";

// A copy of the build at /app/ on a server of its own, so a test can publish a new version.
async function serveCopy() {
  const root = mkdtempSync(join(tmpdir(), "smoothstep-"));
  const app = join(root, "app");
  cpSync("dist", app, {recursive: true});
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
      response.writeHead(200, {"Content-Type": "text/html", "Cache-Control": "no-cache"}).end(HOME_PAGE);
    }
  });
  await new Promise<void>(resolve => server.listen(0, "localhost", resolve));
  let versions = 1;
  return {
    url: `http://localhost:${(server.address() as AddressInfo).port}/app/`,
    // A new version, as after a deploy: `change` edits the files in `app` and their plan. Returns its version.
    publish: (change?: (plan: Plan, app: string) => void) => {
      const [first, ...rest] = readFileSync(join(app, "sw.js"), "utf8").split("\n");
      const plan = JSON.parse(first!.replace(/^const CACHE_PLAN = /, "").replace(/;$/, "")) as Plan;
      change?.(plan, app);
      plan.version = revision(JSON.stringify([plan.precache, plan.runtime]) + ++versions);
      writeFileSync(join(app, "sw.js"), [`const CACHE_PLAN = ${JSON.stringify(plan)};`, ...rest].join("\n"));
      return plan.version;
    },
    close: () => {
      server.close();
      rmSync(root, {recursive: true, force: true});
    },
  };
}

// The chunk that Help → Keyboard shortcuts loads when first used.
const REFERENCE_CHUNK = "assets/" + readdirSync("dist/assets").find(name => /^ReferencePanel-.*\.js$/.test(name))!;

// Changes a precached file's contents, giving it a new revision.
function rewrite(plan: Plan, app: string, path: string, text: string) {
  writeFileSync(join(app, path), text);
  plan.precache[path] = revision(text);
}

// The files in the worker's cache, as paths in the app with their revisions.
function cachedFiles(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const name = (await caches.keys()).find(key => key.startsWith("smoothstep "))!;
    const scope = name.slice("smoothstep ".length);
    return (await (await caches.open(name)).keys()).map(request => request.url.slice(scope.length)).sort();
  });
}

// The version the worker controlling the page last activated with.
function activeVersion(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const name = (await caches.keys()).find(key => key.startsWith("smoothstep "))!;
    const plan = await (await caches.open(name)).match(name.slice("smoothstep ".length) + "__cache-plan.json");
    return ((await plan!.json()) as {version: string}).version;
  });
}

// Checks for a new version, and resolves with how its install ends: "installed" or "redundant".
function installUpdate(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    const found = new Promise<ServiceWorker>(resolve =>
      registration.addEventListener("updatefound", () => resolve(registration.installing!), {once: true}));
    await registration.update();
    const worker = await found;
    return new Promise<string>(resolve => {
      const check = () => {
        if (worker.state === "installed" || worker.state === "redundant") {
          resolve(worker.state);
        }
      };
      worker.addEventListener("statechange", check);
      check();
    });
  });
}

test("a new version waits for Reload, which asks before losing unsaved changes", async ({page, context}) => {
  const errors = await offline(context);
  const site = await serveCopy();
  try {
    await page.goto(site.url + "#new");
    await waitForWorker(page);
    const notice = page.locator(".mantine-Notification-root").filter({hasText: "A new version of smoothstep.io is ready"});

    const v2 = site.publish();
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
    expect(await activeVersion(page)).not.toBe(v2);
    await Promise.all([page.waitForEvent("load"), notice.getByRole("button", {name: "Reload"}).click()]);
    await expect(page.locator(OPEN_EDITOR)).toBeVisible();
    await expect(notice).toHaveCount(0);
    // The new version controls the page and has nothing newer waiting.
    expect(await activeVersion(page)).toBe(v2);
    expect(await page.evaluate(async () => (await navigator.serviceWorker.ready).waiting)).toBeNull();
    expect(errors).toEqual([]);
  } finally {
    site.close();
  }
});

test("an update that changes a chunk keeps the last version's copy, and drops older ones", async ({page, context}) => {
  const errors = await offline(context);
  const site = await serveCopy();
  const notice = page.locator(".mantine-Notification-root").filter({hasText: "A new version of smoothstep.io is ready"});
  const update = async (text: string) => {
    site.publish((plan, app) => rewrite(plan, app, REFERENCE_CHUNK, readFileSync(join("dist", REFERENCE_CHUNK), "utf8") + text));
    expect(await installUpdate(page)).toBe("installed");
    await expect(notice).toBeVisible();
    await Promise.all([page.waitForEvent("load"), notice.getByRole("button", {name: "Reload"}).click()]);
    await expect(page.locator(OPEN_EDITOR)).toBeVisible();
  };
  const copies = async () => (await cachedFiles(page)).filter(path => path.startsWith(REFERENCE_CHUNK + "?"));
  const original = REFERENCE_CHUNK + "?__rev=" + revision(readFileSync(join("dist", REFERENCE_CHUNK)));
  try {
    await page.goto(site.url + "#new");
    await waitForWorker(page);
    expect(await copies()).toEqual([original]);

    await update("\n// v2\n");
    const second = REFERENCE_CHUNK + "?__rev=" + revision(readFileSync(join("dist", REFERENCE_CHUNK), "utf8") + "\n// v2\n");
    expect(await copies()).toEqual([original, second].sort());

    await update("\n// v3\n");
    const third = REFERENCE_CHUNK + "?__rev=" + revision(readFileSync(join("dist", REFERENCE_CHUNK), "utf8") + "\n// v3\n");
    expect(await copies()).toEqual([second, third].sort());
    // The changed chunk still works.
    await page.getByRole("button", {name: "Help"}).click();
    await page.getByRole("menuitem", {name: "Keyboard shortcuts"}).click();
    await expect(docsPanel(page).getByRole("row", {name: /build the code/})).toContainText("Shift + Enter");
    expect(errors).toEqual([]);
  } finally {
    site.close();
  }
});

test("a page still on the last version loads its chunks after the next takes over, though the server has dropped them", async ({page, context}) => {
  const errors = await offline(context);
  const site = await serveCopy();
  let loads = 0;
  page.on("load", () => loads++);
  try {
    await page.goto(site.url + "#new");
    await waitForWorker(page);
    // The next version renamed the chunk, so the server answers for the old name with its home page.
    const v2 = site.publish((plan, app) => {
      rmSync(join(app, REFERENCE_CHUNK));
      plan.precache = Object.fromEntries(Object.entries(plan.precache).filter(([path]) => path !== REFERENCE_CHUNK));
      rewrite(plan, app, REFERENCE_CHUNK.replace("ReferencePanel-", "ReferencePanel-new"), "export {};");
    });
    expect(await installUpdate(page)).toBe("installed");
    // Another tab reloads into it, and this one is left on the last version.
    await page.evaluate(async () => {
      const next = (await navigator.serviceWorker.ready).waiting!;
      const activated = new Promise(resolve => next.addEventListener("statechange", () => next.state === "activated" && resolve(null)));
      next.postMessage({type: "skipWaiting"});
      await activated;
    });
    expect(await activeVersion(page)).toBe(v2);

    // Out of the way of the Help menu.
    await page.locator(".mantine-Notification-closeButton").click();
    await page.getByRole("button", {name: "Help"}).click();
    await page.getByRole("menuitem", {name: "Keyboard shortcuts"}).click();
    await expect(docsPanel(page).getByRole("row", {name: /build the code/})).toContainText("Shift + Enter");
    expect(loads).toBe(1);
    expect(errors).toEqual([]);
  } finally {
    site.close();
  }
});

test("a new version that can't download every file it needs doesn't install", async ({page, context}) => {
  const errors = await offline(context);
  const site = await serveCopy();
  try {
    await page.goto(site.url + "#new");
    await waitForWorker(page);
    const before = await activeVersion(page);
    // Mid-deploy, say: the plan names a chunk that isn't on the server yet.
    site.publish(plan => {
      plan.precache["assets/coming-soon.js"] = revision("export {};");
    });
    expect(await installUpdate(page)).toBe("redundant");
    expect((await cachedFiles(page)).filter(path => path.startsWith("assets/coming-soon.js"))).toEqual([]);
    expect(await activeVersion(page)).toBe(before);
    await expect(page.getByText("A new version of smoothstep.io is ready")).toHaveCount(0);
    expect(errors.filter(error => !error.includes("Couldn't fetch"))).toEqual([]);
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
  // Chromium's launchQueue, holding a file as when the installed app opens one. Like Chromium, it
  // gives the file again after every reload.
  await context.addInitScript(text => {
    const file = new File([text], "Minimal.smoothstep.json", {type: "application/json", lastModified: 1});
    Object.defineProperty(window, "launchQueue", {value: {setConsumer: (consumer: (params: unknown) => void) => {
      consumer({files: [{getFile: () => Promise.resolve(file)}]});
    }}});
  }, text);
  let loads = 0;
  page.on("load", () => loads++);
  await page.goto("./");
  await expect(page).toHaveURL(/#anim\/[a-f0-9]+$/);
  await expect(page.locator("#titleInput")).toHaveValue("Minimal Animation");
  // Opened with one reload, and no more.
  await page.waitForTimeout(2000);
  expect(loads).toBe(2);
  await expect(page.locator("#titleInput")).toHaveValue("Minimal Animation");
  expect(errors).toEqual([]);
});
