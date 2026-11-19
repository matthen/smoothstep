import { expect, type BrowserContext, type Page } from '@playwright/test';
import { PNG } from 'pngjs';

export const MAGENTA: [number, number, number] = [220, 20, 200];

export const TEXTURE_SHADER = `void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / iResolution.xy;
  fragColor = texture(iTexture0, uv);
}
`;

// Blocks every request that isn't to this machine, so tests prove the app works offline, and
// collects page errors (a failed Google Fonts request is expected offline).
export async function offline(context: BrowserContext): Promise<string[]> {
  await context.route(/^https?:\/\/(?!localhost)/, route => route.abort());
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

export async function setCode(page: Page, code: string) {
  await page.locator(".cm-content").click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.insertText(code);
}

export async function editorCode(page: Page): Promise<string> {
  return page.locator(".cm-content").evaluate(el =>
    Array.from(el.querySelectorAll(".cm-line"), line => line.textContent).join("\n"));
}

export async function fileMenu(page: Page, item: string) {
  await page.getByText("File", {exact: true}).click();
  await page.locator(".dropdown-menu.show").getByText(item, {exact: true}).click();
}

export async function dismissAlert(page: Page): Promise<string> {
  const alert = page.locator(".modal.show").last();
  const text = await alert.innerText();
  await alert.getByRole("button", {name: "Ok"}).click();
  await expect(alert).toBeHidden();
  return text;
}

export async function canvasCenter(page: Page): Promise<[number, number, number]> {
  await page.waitForTimeout(800);
  const png = PNG.sync.read(await page.locator("#canvas").screenshot());
  const i = (Math.floor(png.height / 2) * png.width + Math.floor(png.width / 2)) * 4;
  return [png.data[i]!, png.data[i + 1]!, png.data[i + 2]!];
}

export function near(color: number[], target: number[], tolerance = 40): boolean {
  return color.every((c, i) => Math.abs(c - target[i]!) <= tolerance);
}
