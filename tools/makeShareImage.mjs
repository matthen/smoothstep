// Makes public/share.png, the 1200×630 picture link previews show for smoothstep.io: frames
// from a few bundled examples, drawn by the app's own exporter, above the logo and tagline.
//
//   npm run dev                                   # in another terminal
//   E2E_GPU=1 node tools/makeShareImage.mjs
//
// E2E_GPU=1 draws on the machine's GPU, as the e2e tests do; without it, Chromium draws in
// software, which is slower. Keep the logo and tagline in the middle, since some apps crop the
// picture to a square.
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.env.SMOOTHSTEP_DEV_URL ?? "http://localhost:5173/";
const ROOT = join(import.meta.dirname, "..");
const TILE = 200;
// Example id and the second to show it at, left to right.
const FRAMES = [
  ["19bb8790cb0d", 6],  // Domain warping
  ["5c81f0d3a7e2", 11],  // Ink in water
  ["d692b3fe2561", 4],  // Kaleidoscope
  ["2ed11c16d844", 9],  // Menger sponge dissection
  ["bd2cdbfe233d", 3],  // Truchet tiles
];

const browser = await chromium.launch({
  args: process.env.E2E_GPU ?
    ["--use-angle=vulkan", "--enable-features=Vulkan", "--enable-gpu", "--ignore-gpu-blocklist"] :
    ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage();
await page.goto(BASE);
const frames = [];
for (const [id, seconds] of FRAMES) {
  frames.push(await renderFrame(id, seconds));
  console.log(id, "drawn");
}
await page.setViewportSize({width: 1200, height: 630});
await page.setContent(html(frames));
await page.evaluate(() => document.fonts.ready);
const out = join(ROOT, "public", "share.png");
writeFileSync(out, await page.screenshot());
console.log(out, (readFileSync(out).length / 1024).toFixed(0) + " KB");
await browser.close();

// The example's frame at the given second, as a PNG data URL, 2× the tile size for a sharp crop.
async function renderFrame(id, seconds) {
  const bytes = await page.evaluate(async ({id, seconds, width}) => {
    const {exportVideo} = await import("/src/export/exportVideo.ts");
    const {parseDocument} = await import("/src/lib/document.ts");
    const doc = parseDocument(await (await fetch("/examples/" + id + ".json")).json());
    doc.duration = seconds;
    const file = await exportVideo(doc, {width, fps: 24, type: "png"}, () => {}, new AbortController().signal);
    // The PNG export is a zip of frames; keep the last one.
    const {unzipSync} = await import("/node_modules/.vite/deps/fflate.js");
    const zip = unzipSync(new Uint8Array(await file.blob.arrayBuffer()));
    return Array.from(zip[Object.keys(zip).sort().at(-1)]);
  }, {id, seconds, width: 2 * TILE});
  return "data:image/png;base64," + Buffer.from(bytes).toString("base64");
}

function fontFace(family, weight, file) {
  const data = readFileSync(join(ROOT, "node_modules", file)).toString("base64");
  return `@font-face { font-family: "${family}"; font-weight: ${weight}; ` +
    `src: url(data:font/woff2;base64,${data}) format("woff2"); }`;
}

function html(frames) {
  const logo = readFileSync(join(ROOT, "public", "images", "logo.svg"), "utf8");
  return `<!DOCTYPE html><html><head><style>
    ${fontFace("Monda", 700, "@fontsource/monda/files/monda-latin-700-normal.woff2")}
    ${fontFace("Monda", 400, "@fontsource/monda/files/monda-latin-400-normal.woff2")}
    ${fontFace("Inter", "100 900", "@fontsource-variable/inter/files/inter-latin-wght-normal.woff2")}
    html, body { margin: 0; width: 1200px; height: 630px; overflow: hidden; }
    body {
      background: radial-gradient(ellipse at 50% 40%, #2e303e, #282a36 70%);
      display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 56px;
    }
    .tiles { display: flex; gap: 22px; }
    .tiles img {
      width: ${TILE}px; height: ${TILE}px; object-fit: cover; border-radius: 20px;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
    }
    .brand { display: flex; flex-direction: column; align-items: center; gap: 10px; }
    .name { display: flex; align-items: center; gap: 26px; }
    .name svg { width: 70px; height: 70px; }
    .word { font-family: Monda; font-weight: 700; font-size: 84px; line-height: 1; color: #f8f8f2; }
    .word i { font-style: normal; font-weight: 400; font-size: 46px; color: #999db2; }
    .tagline { font-family: Inter; font-weight: 300; font-size: 34px; color: #c9cad6; letter-spacing: 0.01em; }
  </style></head><body>
    <div class="tiles">${frames.map(src => `<img src="${src}">`).join("")}</div>
    <div class="brand">
      <div class="name">${logo}<span class="word">smoothstep<i>.io</i></span></div>
      <div class="tagline">Animation editor</div>
    </div>
  </body></html>`;
}
