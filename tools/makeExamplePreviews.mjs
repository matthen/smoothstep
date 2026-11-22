// Renders a short looping preview video for each bundled example, with the app's own exporter.
//
//   npm run dev                                   # in another terminal
//   node tools/makeExamplePreviews.mjs [--posters] [id ...]
//
// Writes public/examples/<id>.mp4: a few seconds at 240px, small enough to play in the example
// gallery. With --posters, it writes the <id>.png thumbnail instead: a frame from a few seconds
// in, at the same size. With no ids, it does every example in public/examples.
//
// Examples in START begin their preview later, because they take a while to get going. Those
// need ffmpeg, to cut the start off the video.
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = process.env.SMOOTHSTEP_DEV_URL ?? "http://localhost:5173/";
const SECONDS = 6;
const POSTER_SECONDS = 4;
// Seconds to skip, by example id.
const START = {
  "26d46785c1f6": 40,  // The cellular automaton starts from an empty screen.
  "5c81f0d3a7e2": 7,  // The ink takes a few seconds to swirl.
  "db5ea9765f9f": 4,  // The snowflake starts from one hexagon.
  "be71615e6614": 5,  // The camera moves in to the cut after a few seconds.
};
const posters = process.argv.includes("--posters");
const args = process.argv.slice(2).filter(a => a !== "--posters");
const dir = join(import.meta.dirname, "..", "public", "examples");
const ids = args.length ? args :
  readdirSync(dir).filter(f => f.endsWith(".json")).map(f => f.replace(".json", ""));

const browser = await chromium.launch({args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"]});
const page = await browser.newPage();
await page.goto(BASE);
for (const id of ids) {
  const start = START[id] ?? 0;
  let bytes = await page.evaluate(async ({id, seconds, posters}) => {
    const {exportVideo} = await import("/src/export/exportVideo.ts");
    const {parseDocument} = await import("/src/lib/document.ts");
    const doc = parseDocument(await (await fetch("/examples/" + id + ".json")).json());
    doc.duration = Math.min(doc.duration, seconds);
    const options = {width: 240, fps: 24, type: posters ? "png" : "mp4"};
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
  }, {id, seconds: start + (posters ? POSTER_SECONDS : SECONDS), posters});
  if (start && !posters) {
    bytes = trimStart(Buffer.from(bytes), start);
  }
  writeFileSync(join(dir, id + (posters ? ".png" : ".mp4")), Buffer.from(bytes));
  console.log(id, (bytes.length / 1024).toFixed(0) + " KB");
}
await browser.close();

function trimStart(video, seconds) {
  const temp = mkdtempSync(join(tmpdir(), "smoothstep-preview-"));
  try {
    writeFileSync(join(temp, "in.mp4"), video);
    execFileSync("ffmpeg", [
      "-loglevel", "error", "-ss", String(seconds), "-i", join(temp, "in.mp4"),
      "-an", "-c:v", "libx264", "-crf", "28", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
      join(temp, "out.mp4"),
    ]);
    return readFileSync(join(temp, "out.mp4"));
  } finally {
    rmSync(temp, {recursive: true, force: true});
  }
}
