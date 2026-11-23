import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { cachePlan, cachePolicy } from './cachePlan';

const hash = (text: string) => createHash('sha256').update(text).digest('hex').slice(0, 8);

const BUILD = new Map([
  ["index.html", "a"], ["embed.html", "b"], ["sw.js", "c"], ["site.webmanifest", "d"],
  ["assets/main-Bnw4Lrse.js", "e"], ["assets/javascript-D3PAb3ne.js", "f"], ["assets/ReferencePanel-CkEojZNM.js", "g"],
  ["assets/main-Czi7ms34.css", "h"], ["docs/index.html", "i"], ["docs/docs.css", "j"], ["docs/images/screenshot.png", "k"],
  ["fonts/inter-latin-wght-normal.woff2", "l"], ["assets/monda-latin-700-normal-x.woff", "u"],
  ["libs/planck.js", "m"], ["images/logo.svg", "n"],
  ["android-chrome-192x192.png", "o"], ["images/textures/photos/cats1.jpg", "p"], ["examples/19bb8790cb0d.json", "q"],
  ["examples/19bb8790cb0d.mp4", "r"], ["robots.txt", "s"], ["images/textures/.DS_Store", "t"],
]);

describe("cachePlan", () => {
  const plan = cachePlan(BUILD, hash);

  it("precaches the pages, every chunk, the docs site, fonts, libraries and icons", () => {
    expect(Object.keys(plan.precache).sort()).toEqual([
      "android-chrome-192x192.png", "assets/ReferencePanel-CkEojZNM.js", "assets/javascript-D3PAb3ne.js",
      "assets/main-Bnw4Lrse.js", "assets/main-Czi7ms34.css", "docs/docs.css", "docs/index.html", "embed.html", "fonts/inter-latin-wght-normal.woff2", "images/logo.svg", "index.html",
      "libs/planck.js", "site.webmanifest",
    ]);
  });

  it("keeps textures, examples, the docs' screenshots and .woff fonts only once they're used", () => {
    expect(Object.keys(plan.runtime).sort()).toEqual([
      "assets/monda-latin-700-normal-x.woff", "docs/images/screenshot.png", "examples/19bb8790cb0d.json",
      "examples/19bb8790cb0d.mp4", "images/textures/photos/cats1.jpg",
    ]);
  });

  it("leaves out the worker itself and files the app never asks for", () => {
    for (const path of ["sw.js", "robots.txt", "images/textures/.DS_Store"]) {
      expect(cachePolicy(path)).toBe("none");
    }
  });

  it("keeps each file's revision", () => {
    expect(plan.precache["index.html"]).toBe("a");
    expect(plan.runtime["examples/19bb8790cb0d.mp4"]).toBe("r");
  });

  it("has a new version when any cached file changes, and the same one otherwise", () => {
    expect(cachePlan(new Map(BUILD), hash).version).toBe(plan.version);
    expect(cachePlan(new Map([...BUILD, ["docs/index.html", "changed"]]), hash).version).not.toBe(plan.version);
    expect(cachePlan(new Map([...BUILD, ["examples/19bb8790cb0d.png", "new"]]), hash).version).not.toBe(plan.version);
    expect(cachePlan(new Map([...BUILD, ["robots.txt", "changed"]]), hash).version).toBe(plan.version);
  });
});
