// Renders a short looping preview video for each bundled example, with the app's own exporter.
//
//   npm run dev                                   # in another terminal
//   node tools/makeExamplePreviews.mjs [--posters] [id ...]
//
// Writes public/examples/<id>.mp4: the first few seconds at 240px, small enough to autoplay in
// the example gallery. With --posters, it writes the <id>.png thumbnail instead: a 128px frame
// from about 4 seconds in. With no ids, it does every example in public/examples.
import { chromium } from '@playwright/test';
import { readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.env.SMOOTHSTEP_DEV_URL ?? "http://localhost:5173/";
const SECONDS = 6;
const POSTER_SECONDS = 4;
const posters = process.argv.includes("--posters");
const args = process.argv.slice(2).filter(a => a !== "--posters");
const dir = join(import.meta.dirname, "..", "public", "examples");
const ids = args.length ? args :
  readdirSync(dir).filter(f => f.endsWith(".json")).map(f => f.replace(".json", ""));

const browser = await chromium.launch({args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"]});
const page = await browser.newPage();
await page.goto(BASE);
for (const id of ids) {
  const bytes = await page.evaluate(async ({id, seconds, posters}) => {
    const {exportVideo} = await import("/src/export/exportVideo.ts");
    const {parseDocument} = await import("/src/lib/document.ts");
    const doc = parseDocument(await (await fetch("/examples/" + id + ".json")).json());
    doc.duration = Math.min(doc.duration, seconds);
    const options = posters ? {width: 128, fps: 24, type: "png"} : {width: 240, fps: 24, type: "mp4"};
    const file = await exportVideo(doc, options, () => {}, new AbortController().signal);
    const data = new Uint8Array(await file.blob.arrayBuffer());
    if (!posters) {
      return Array.from(data);
    }
    // The PNG export is a zip of frames; keep the last one.
    const {unzipSync} = await import("/node_modules/.vite/deps/fflate.js");
    const frames = unzipSync(data);
    const last = Object.keys(frames).sort().at(-1);
    return Array.from(frames[last]);
  }, {id, seconds: posters ? POSTER_SECONDS : SECONDS, posters});
  writeFileSync(join(dir, id + (posters ? ".png" : ".mp4")), Buffer.from(bytes));
  console.log(id, (bytes.length / 1024).toFixed(0) + " KB");
}
await browser.close();
