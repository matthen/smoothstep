import { describe, expect, it } from 'vitest';

import type { CachePlan } from './cachePlan';
import { cacheKey, cacheName, findTarget, parseRange, planKeys, scopeOf } from './workerRoutes';

const PLAN: CachePlan = {
  version: "v1",
  precache: {"index.html": "r1", "embed.html": "r2", "assets/main-abc.js": "r3", "docs/index.html": "r4", "docs/canvas2d.html": "r5"},
  runtime: {"images/textures/photos/cats1.jpg": "r6", "examples/19bb8790cb0d.json": "r7"},
};
const SCOPE = "https://smoothstep.io/app/";

describe("scopeOf", () => {
  it("is the worker file's directory, wherever the app is served", () => {
    expect(scopeOf("https://smoothstep.io/app/sw.js")).toBe("https://smoothstep.io/app/");
    expect(scopeOf("https://smoothstep.io/sw.js")).toBe("https://smoothstep.io/");
    expect(scopeOf("http://localhost:4173/sub/sw.js")).toBe("http://localhost:4173/sub/");
  });

  it("gives copies at different paths their own caches", () => {
    expect(cacheName("https://example.com/a/")).not.toBe(cacheName("https://example.com/b/"));
  });
});

describe("findTarget", () => {
  const find = (url: string, navigation = false) => findTarget(url, SCOPE, PLAN, navigation);

  it("serves the app's page for its directory, index.html, and any query or hash", () => {
    const page = {kind: "precache", url: SCOPE + "index.html", key: cacheKey(SCOPE, "index.html", "r1"), revision: "r1"};
    expect(find(SCOPE, true)).toEqual(page);
    expect(find(SCOPE + "index.html", true)).toEqual(page);
    expect(find(SCOPE + "#example/19bb8790cb0d", true)).toEqual(page);
    expect(find(SCOPE + "index.html?utm=x#anim/abc", true)).toEqual(page);
  });

  it("serves the docs site's pages, including its directory", () => {
    expect(find(SCOPE + "docs/", true)).toMatchObject({kind: "precache", url: SCOPE + "docs/index.html"});
    expect(find(SCOPE + "docs/canvas2d.html#fonts", true)).toMatchObject({kind: "precache", url: SCOPE + "docs/canvas2d.html"});
  });

  it("finds precached and runtime files", () => {
    expect(find(SCOPE + "assets/main-abc.js")).toMatchObject({kind: "precache"});
    expect(find(SCOPE + "images/textures/photos/cats1.jpg")).toMatchObject({kind: "runtime"});
    expect(find(SCOPE + "examples/19bb8790cb0d.json")).toMatchObject({kind: "runtime"});
  });

  it("leaves other sites, and the rest of this one, to the network", () => {
    expect(find("https://api.github.com/gists/abc")).toBeNull();
    expect(find("https://gist.githubusercontent.com/u/abc/raw/a.smoothstep.json")).toBeNull();
    expect(find("https://smoothstep.io/", true)).toBeNull();
    expect(find("https://smoothstep.io/index.html", true)).toBeNull();
    expect(find("https://smoothstep.io/application/", true)).toBeNull();
    expect(find("https://smoothstep.io/apps/sw.js")).toBeNull();
  });

  it("marks other files in the app's directory as unknown, such as an old version's chunk", () => {
    expect(find(SCOPE + "assets/main-old.js")).toEqual({kind: "unknown"});
    expect(find(SCOPE + "%E0%A4%A", true)).toEqual({kind: "unknown"});
    expect(find(SCOPE + "constructor")).toEqual({kind: "unknown"});
    expect(find(SCOPE + "__proto__")).toEqual({kind: "unknown"});
  });

  it("gives a changed file a new key", () => {
    const changed = {...PLAN, precache: {...PLAN.precache, "index.html": "r9"}};
    expect(findTarget(SCOPE, SCOPE, changed, true)).not.toEqual(find(SCOPE, true));
  });
});

describe("planKeys", () => {
  it("lists a key for every file, precached or not", () => {
    const keys = planKeys(SCOPE, PLAN);
    expect(keys).toHaveLength(7);
    expect(keys).toContain(find(SCOPE + "examples/19bb8790cb0d.json").key);
  });

  function find(url: string) {
    return findTarget(url, SCOPE, PLAN, false) as {key: string};
  }
});

describe("parseRange", () => {
  it("reads the ranges video elements ask for", () => {
    expect(parseRange("bytes=0-", 1000)).toEqual([0, 1000]);
    expect(parseRange("bytes=100-199", 1000)).toEqual([100, 200]);
    expect(parseRange("bytes=900-5000", 1000)).toEqual([900, 1000]);
    expect(parseRange("bytes=-100", 1000)).toEqual([900, 1000]);
  });

  it("refuses ranges it can't give", () => {
    expect(parseRange("bytes=1000-", 1000)).toBeNull();
    expect(parseRange("bytes=-", 1000)).toBeNull();
    expect(parseRange("bytes=0-1,5-9", 1000)).toBeNull();
    expect(parseRange("items=0-1", 1000)).toBeNull();
  });
});
