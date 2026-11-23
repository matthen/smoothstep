// The Canvas2D layer: JavaScript drawing over the image and read by shaders as iCanvas2D, kept when
// saved and shared, errors on their lines, and code that never finishes stopped without freezing the page.
import { expect, test, type Page } from '@playwright/test';
import { PNG } from 'pngjs';

import { addTab, MAGENTA, near, offline, OPEN_EDITOR, setCode, skipTour } from './helpers';

const BLUE: [number, number, number] = [0, 0, 255];

const BLUE_IMAGE = "void mainImage(out vec4 fragColor, in vec2 fragCoord) {\n  fragColor = vec4(0., 0., 1., 1.);\n}";
// Shows the Canvas2D layer's drawing over blue, read as a texture.
const READS_CANVAS = "void mainImage(out vec4 fragColor, in vec2 fragCoord) {\n" +
  "  vec4 drawn = texture(iCanvas2D, fragCoord / iResolution.xy);\n" +
  "  fragColor = vec4(drawn.rgb + (1. - drawn.a) * vec3(0., 0., 1.), 1.);\n}";
// Magenta over the top half of the canvas only, so which way up it is shows.
const TOP_HALF = "function draw(ctx, {width, height}) {\n  clear(ctx);\n" +
  "  ctx.fillStyle = \"rgb(220, 20, 200)\";\n  ctx.fillRect(0, 0, width, height / 2);\n}";

function tabs(page: Page) {
  return page.getByRole("tablist", {name: "Code, in the order it draws"}).getByRole("tab");
}

async function openTab(page: Page, name: string) {
  // A tab's name also holds its remove button's.
  const tab = page.getByRole("tab", {name: new RegExp("^" + name)});
  await tab.click();
  await expect(tab).toHaveAttribute("aria-selected", "true");
}

// The colours a quarter of the way down the canvas and three quarters down.
async function topAndBottom(page: Page, selector = "#canvas"): Promise<[number, number, number][]> {
  await page.waitForTimeout(800);
  const png = PNG.sync.read(await page.locator(selector).screenshot());
  return [0.25, 0.75].map(y => {
    const i = (Math.floor(png.height * y) * png.width + Math.floor(png.width / 2)) * 4;
    return [png.data[i]!, png.data[i + 1]!, png.data[i + 2]!];
  });
}

async function expectTopMagenta(page: Page, selector?: string) {
  await expect(async () => {
    const [top, bottom] = await topAndBottom(page, selector);
    expect(near(top!, MAGENTA)).toBe(true);
    expect(near(bottom!, BLUE)).toBe(true);
  }).toPass({timeout: 15_000});
}

async function start(page: Page) {
  await page.goto("./");
  await page.getByRole("button", {name: "Continue"}).click();
  await setCode(page, BLUE_IMAGE);
  await addTab(page, "Add the Canvas2D layer");
  await expect(tabs(page)).toHaveText(["Canvas2D.js", "Image.glsl"]);
  await expect(page.getByRole("tab", {name: "Canvas2D.js"})).toHaveAttribute("aria-selected", "true");
  // Its editor has focus, so Shift+Enter builds straight away.
  await expect(page.locator(".ss-code-editor:not([hidden]) .cm-content")).toBeFocused();
}

test.beforeEach(async ({context}) => {
  await skipTour(context);
});

test("⊕ has a menu while it can add more than one thing, adds the last one directly, then goes", async ({page, context}) => {
  const errors = await offline(context);
  await start(page);
  const plus = page.getByRole("tablist", {name: "Code, in the order it draws"}).getByRole("button", {name: /^Add /});
  await expect(plus).toHaveAccessibleName("Add a buffer or shared GLSL code");
  await addTab(page, "Add shared GLSL code");
  await expect(tabs(page)).toHaveText(["Canvas2D.js", "shared.glsl", "Image.glsl"]);

  // Only buffers are left to add, so ⊕ adds one with no menu.
  await expect(plus).toHaveAccessibleName("Add a buffer");
  await plus.click();
  await expect(page.getByRole("menu")).toBeHidden();
  await expect(tabs(page)).toHaveText(["Canvas2D.js", "shared.glsl", "iBuffer0.glsl", "Image.glsl"]);
  // The shaders are a chain of arrows; the Canvas2D.js tab, being JavaScript, sits apart behind a divider.
  const row = () => page.getByRole("tablist", {name: "Code, in the order it draws"}).evaluate(list => [...list.children].map(child =>
    child.getAttribute("role") === "tab" ? child.textContent : child.classList.contains("shaderDivider") ? "|" :
      child.classList.contains("shaderThen") ? ">" : "+"));
  expect(await row()).toEqual(["Canvas2D.js", "|", "shared.glsl", "|", "iBuffer0.glsl", ">", "+", ">", "Image.glsl"]);
  // The name says the language, with the extension set apart, so the code tabs need no icons.
  await expect(page.getByRole("tab", {name: "Canvas2D.js"}).locator(".shaderExtension")).toHaveText(".js");
  await expect(tabs(page).locator("svg.shaderKind")).toHaveCount(0);

  // With every buffer there, there's nothing left to add.
  for (let i = 1; i < 4; i++) {
    await plus.click();
  }
  await expect(plus).toHaveCount(0);
  expect(await row()).toEqual(
    ["Canvas2D.js", "|", "shared.glsl", "|", "iBuffer0.glsl", ">", "iBuffer1.glsl", ">", "iBuffer2.glsl", ">", "iBuffer3.glsl", ">", "Image.glsl"]);

  // Removing the starters asks nothing, and brings back the menu, with its three items in order.
  await page.getByLabel("Remove iBuffer3.glsl").click();
  await page.getByLabel("Remove shared.glsl").click();
  await page.getByLabel("Remove Canvas2D.js").click();
  await expect(tabs(page)).toHaveText(["iBuffer0.glsl", "iBuffer1.glsl", "iBuffer2.glsl", "Image.glsl"]);
  await expect(plus).toHaveAccessibleName("Add a buffer, the Canvas2D layer or shared GLSL code");
  await plus.click();
  await expect(page.getByRole("menuitem")).toHaveText([/^Add a buffer/, /^Add the Canvas2D layer/, /^Add shared GLSL code/]);
  expect(errors).toEqual([]);
});

test("a Canvas2D layer draws over the image, shaders read it, and it's kept when saved and shared", async ({page, context}) => {
  const errors = await offline(context);
  await start(page);
  await setCode(page, TOP_HALF);
  await page.getByRole("button", {name: "Build"}).click();
  await expectTopMagenta(page);

  // Off, the drawing only shows where a shader reads it.
  await page.getByLabel("Draw over the image").uncheck();
  await expect(async () => {
    const [top] = await topAndBottom(page);
    expect(near(top!, BLUE)).toBe(true);
  }).toPass();
  await openTab(page, "Image.glsl");
  await setCode(page, READS_CANVAS);
  await page.keyboard.press("Shift+Enter");
  await expectTopMagenta(page);

  await page.keyboard.press("ControlOrMeta+s");
  await expect(page).toHaveURL(/#anim\/[a-f0-9]+$/);
  await page.reload();
  await expect(tabs(page)).toHaveText(["Canvas2D.js", "Image.glsl"]);
  await expectTopMagenta(page);
  await openTab(page, "Canvas2D.js");
  await expect(page.getByLabel("Draw over the image")).not.toBeChecked();
  await expect(page.locator(OPEN_EDITOR)).toContainText("ctx.fillRect(0, 0, width, height / 2);");

  await page.getByRole("button", {name: "Share", exact: true}).click();
  const modal = page.getByRole("dialog", {name: "Share"});
  const link = await modal.getByLabel("Link", {exact: true}).inputValue();
  const download = page.waitForEvent("download");
  await modal.getByRole("button", {name: "Download player file"}).click();
  const path = test.info().outputPath("player.html");
  await (await download).saveAs(path);
  await page.keyboard.press("Escape");
  // The player file runs the layer offline, with what it needs inside it.
  const player = await context.newPage();
  await player.goto("file://" + path);
  await expectTopMagenta(player, "canvas");
  await player.close();
  const other = await context.newPage();
  await other.goto(link);
  await expect(tabs(other)).toHaveText(["Canvas2D.js", "Image.glsl"]);
  await expectTopMagenta(other);

  // The embedded player runs the layer too.
  await other.goto(link.replace("/sub/#", "/sub/embed.html#"));
  await expectTopMagenta(other, "canvas");
  expect(errors).toEqual([]);
});

test("Canvas2D code can't reach the network, and libraries come from import lines", async ({page, context}) => {
  const errors = await offline(context);
  await start(page);
  // Magenta only if planck loaded and the request was refused.
  await setCode(page, [
    'import planck from "planck";',
    "",
    "async function setup() {",
    "  try {",
    "    await fetch(\"http://localhost:4173/sub/index.html\");",
    "    return {blocked: false};",
    "  } catch {",
    "    return {blocked: true};",
    "  }",
    "}",
    "",
    "function draw(ctx, {width, height, data}) {",
    "  const world = new planck.World({gravity: planck.Vec2(0, -10)});",
    "  clear(ctx);",
    "  ctx.fillStyle = data.blocked && world.getGravity().y === -10 ? \"rgb(220, 20, 200)\" : \"rgb(0, 255, 0)\";",
    "  ctx.fillRect(0, 0, width, height / 2);",
    "}",
  ].join("\n"));
  await page.getByRole("button", {name: "Build"}).click();
  await expectTopMagenta(page);
  await expect(page.locator(".ss-line-error")).toHaveCount(0);
  // The fetch is refused before it's sent, so only the sandbox's own errors reach the console.
  expect(errors.filter(e => !e.includes("Content Security Policy") && !e.includes("Failed to fetch"))).toEqual([]);
});

test("errors show under their lines, and the Canvas2D.js tab is marked", async ({page, context}) => {
  const errors = await offline(context);
  await start(page);
  const errorAfter = async () => {
    const error = page.locator(".ss-line-error").first();
    await expect(error).toBeVisible();
    return error.evaluate(el => el.previousElementSibling?.textContent);
  };

  // An error thrown in draw.
  await setCode(page, "// Draws nothing.\nfunction draw(ctx) {\n  clear(ctx);\n  notAFunction();\n}");
  await page.getByRole("button", {name: "Build"}).click();
  expect(await errorAfter()).toBe("  notAFunction();");
  await expect(page.getByRole("tab", {name: "Canvas2D.js"})).toHaveAttribute("data-error", "true");
  await expect(page.locator(".ss-line-error")).toContainText("notAFunction");

  // A syntax error.
  await setCode(page, "function draw(ctx) {\n  const x = ;\n}");
  await page.getByRole("button", {name: "Build"}).click();
  await expect(page.locator(".ss-line-error")).toHaveCount(1);
  expect(await errorAfter()).toBe("  const x = ;");

  // A library that isn't built in.
  await setCode(page, "// Physics.\nimport box2d from \"box2d\";\nfunction draw(ctx) {}");
  await page.getByRole("button", {name: "Build"}).click();
  expect(await errorAfter()).toBe("import box2d from \"box2d\";");
  await expect(page.locator(".ss-line-error")).toContainText("planck");

  // Fixed, the error goes and the tab is no longer marked.
  await setCode(page, TOP_HALF);
  await page.getByRole("button", {name: "Build"}).click();
  await expectTopMagenta(page);
  await expect(page.locator(".ss-line-error")).toHaveCount(0);
  await expect(page.getByRole("tab", {name: "Canvas2D.js"})).not.toHaveAttribute("data-error");
  expect(errors).toEqual([]);
});

test("code that never finishes is stopped without freezing the page", async ({page, context}) => {
  const errors = await offline(context);
  await start(page);
  await setCode(page, "function draw(ctx, {frame}) {\n  if (frame > 10) {\n    while (true) {}\n  }\n}");
  await page.getByRole("button", {name: "Build"}).click();
  await page.getByRole("button", {name: "Play"}).click();
  // The page keeps drawing frames while the Canvas2D code is stuck.
  const frames = await page.evaluate(() => new Promise<number>(resolve => {
    let count = 0;
    const end = performance.now() + 500;
    const tick = () => {
      count++;
      if (performance.now() < end) {
        requestAnimationFrame(tick);
      } else {
        resolve(count);
      }
    };
    requestAnimationFrame(tick);
  }));
  expect(frames).toBeGreaterThan(5);
  await expect(page.locator(".ss-line-error")).toContainText("took too long", {timeout: 10_000});
  await expect(page.getByRole("tab", {name: "Canvas2D.js"})).toHaveAttribute("data-error", "true");

  // Building again runs it again.
  await setCode(page, TOP_HALF);
  await page.getByRole("button", {name: "Build"}).click();
  await expectTopMagenta(page);
  await expect(page.locator(".ss-line-error")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("the Canvas2D layer examples open and run without errors", async ({page, context}) => {
  const errors = await offline(context);
  for (const id of ["9087790c091c", "7852e2820a47", "96abdd1ee3d3", "65ca463c0318"]) {
    await page.goto("about:blank");
    await page.goto("./#example/" + id);
    await expect(tabs(page).filter({hasText: /^Canvas2D/})).toHaveCount(1);
    await page.getByRole("button", {name: "Play"}).click();
    await page.waitForTimeout(1500);
    await expect(page.locator(".ss-line-error")).toHaveCount(0);
    await expect(page.getByRole("tab", {name: /^Canvas2D/})).not.toHaveAttribute("data-error");
  }
  expect(errors).toEqual([]);
});
