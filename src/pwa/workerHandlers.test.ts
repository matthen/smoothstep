// @vitest-environment node
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { REVISION_LENGTH, type CachePlan } from './cachePlan';
import { activate, install, respond, revisionOf, type WorkerContext } from './workerHandlers';
import { cacheKey, planKey } from './workerRoutes';

const SCOPE = "https://smoothstep.io/app/";
const revision = (text: string) => createHash('sha256').update(text).digest('hex').slice(0, REVISION_LENGTH);
// What the server answers for a file it doesn't have: its home page.
const HOME = "<!doctype html><title>Home</title>";

// A site: the files a version serves, each given by its contents.
type Site = Record<string, string>;

function planFor(precache: Site, runtime: Site = {}): CachePlan {
  const revisions = (files: Site) => Object.fromEntries(Object.entries(files).map(([path, text]) => [path, revision(text)]));
  return {version: revision(JSON.stringify([precache, runtime])), precache: revisions(precache), runtime: revisions(runtime)};
}

const urlOf = (request: RequestInfo | URL) => request instanceof Request ? request.url : request.toString();

// The Cache API, in memory. `full` makes every put fail, as when storage runs out.
class MemoryCache {
  entries = new Map<string, Response>();
  full = false;
  match(request: RequestInfo | URL, options?: CacheQueryOptions) {
    const url = urlOf(request);
    const strip = (key: string) => options?.ignoreSearch ? key.split("?")[0] : key;
    const found = [...this.entries].find(([key]) => strip(key) === strip(url));
    return Promise.resolve(found?.[1].clone());
  }
  put(request: RequestInfo | URL, response: Response) {
    if (this.full) {
      return Promise.reject(new DOMException("Quota exceeded", "QuotaExceededError"));
    }
    this.entries.set(urlOf(request), response.clone());
    return Promise.resolve();
  }
  keys() {
    return Promise.resolve([...this.entries.keys()].map(url => new Request(url)));
  }
  delete(request: RequestInfo | URL) {
    return Promise.resolve(this.entries.delete(urlOf(request)));
  }
  paths() {
    return [...this.entries.keys()].map(key => key.slice(SCOPE.length)).sort();
  }
}

// A worker for `plan`, on a server with `site`'s files that answers anything else with its home
// page, as with nginx's try_files. `fetched` lists what went to the network.
function setUp(plan: CachePlan, site: Site, cache = new MemoryCache()) {
  const fetched: string[] = [];
  const context: WorkerContext = {
    scope: SCOPE, plan, openCache: () => Promise.resolve(cache),
    fetch: input => {
      const url = typeof input === "string" ? input : input.url;
      fetched.push(url.slice(SCOPE.length));
      const path = url.slice(SCOPE.length).split("?")[0]!;
      const text = Object.hasOwn(site, path) ? site[path]! : HOME;
      return Promise.resolve(new Response(text, {headers: {"Content-Type": Object.hasOwn(site, path) ? "text/javascript" : "text/html"}}));
    },
  };
  return {context, cache, fetched, site};
}

// Only browsers make navigation requests, so this one's mode is set after.
function navigation(url: string): Request {
  return Object.defineProperty(new Request(url), "mode", {value: "navigate"});
}

async function get(context: WorkerContext, path: string, init?: RequestInit) {
  const request = init?.mode === "navigate" ? navigation(SCOPE + path) : new Request(SCOPE + path, init);
  const response = await respond(context, request);
  return response && {status: response.status, text: await response.text()};
}

const V1: Site = {"index.html": "<!doctype html>v1", "assets/main-a.js": "main v1", "assets/lazy-a.js": "lazy v1"};
const V2: Site = {"index.html": "<!doctype html>v2", "assets/main-a.js": "main v1", "assets/lazy-b.js": "lazy v2"};
const V3: Site = {"index.html": "<!doctype html>v3", "assets/main-a.js": "main v1", "assets/lazy-c.js": "lazy v3"};

describe("revisionOf", () => {
  it("matches the revisions the build gives files", async () => {
    expect(await revisionOf(new TextEncoder().encode("main v1"))).toBe(revision("main v1"));
  });
});

describe("install", () => {
  it("keeps each precached file under its revision", async () => {
    const {context, cache} = setUp(planFor(V1), V1);
    await install(context);
    expect(cache.paths()).toEqual(Object.keys(V1).map(path => path + "?__rev=" + revision(V1[path]!)).sort());
    expect(await get(context, "assets/lazy-a.js")).toEqual({status: 200, text: "lazy v1"});
  });

  it("fails, keeping nothing wrong, when the server sends something else for a file", async () => {
    // Mid-deploy, say: the chunk isn't there yet, so the server sends its home page.
    const site = {...V1};
    delete site["assets/lazy-a.js"];
    const {context, cache} = setUp(planFor(V1), site);
    await expect(install(context)).rejects.toThrow("assets/lazy-a.js");
    expect(await cache.match(cacheKey(SCOPE, "assets/lazy-a.js", revision("lazy v1")))).toBeUndefined();
  });

  it("fetches only the files that changed", async () => {
    const v1 = setUp(planFor(V1), V1);
    await install(v1.context);
    await activate(v1.context);
    const v2 = setUp(planFor(V2), V2, v1.cache);
    await install(v2.context);
    expect(v2.fetched.sort()).toEqual(["assets/lazy-b.js", "index.html"]);
  });
});

describe("activate", () => {
  it("keeps this version's files and the last version's, and drops older ones", async () => {
    const v1 = setUp(planFor(V1), V1);
    await install(v1.context);
    await activate(v1.context);

    const v2 = setUp(planFor(V2), V2, v1.cache);
    await install(v2.context);
    await activate(v2.context);
    const paths = () => v1.cache.paths().map(path => path.split("?")[0]);
    expect(paths()).toEqual(["__cache-plan.json", "assets/lazy-a.js", "assets/lazy-b.js", "assets/main-a.js", "index.html", "index.html"]);
    expect(await v1.cache.match(planKey(SCOPE)).then(r => r?.json())).toEqual(planFor(V2));

    const v3 = setUp(planFor(V3), V3, v1.cache);
    await install(v3.context);
    await activate(v3.context);
    expect(paths()).toEqual(["__cache-plan.json", "assets/lazy-b.js", "assets/lazy-c.js", "assets/main-a.js", "index.html", "index.html"]);
  });

  it("leaves a newer version's files alone while that version is still installing", async () => {
    const v1 = setUp(planFor(V1), V1);
    await install(v1.context);
    await activate(v1.context);
    const v2 = setUp(planFor(V2), V2, v1.cache);
    await install(v2.context);
    // v3 installs while v2 is still waiting, then v2 activates.
    const v3 = setUp(planFor(V3), V3, v1.cache);
    await install(v3.context);
    await activate({...v2.context, newerInstalling: () => true});
    const paths = v1.cache.paths().map(path => path.split("?")[0]);
    expect(paths).toContain("assets/lazy-c.js");
  });
});

describe("respond", () => {
  it("answers this version's files from the cache, with no network", async () => {
    const {context, fetched} = setUp(planFor(V1), V1);
    await install(context);
    fetched.length = 0;
    expect(await get(context, "", {mode: "navigate"})).toEqual({status: 200, text: "<!doctype html>v1"});
    expect(await get(context, "assets/main-a.js?x=1")).toEqual({status: 200, text: "main v1"});
    expect(fetched).toEqual([]);
  });

  it("gives a page still on the last version its chunks, though the server has dropped them", async () => {
    const v1 = setUp(planFor(V1), V1);
    await install(v1.context);
    await activate(v1.context);
    const v2 = setUp(planFor(V2), V2, v1.cache);
    await install(v2.context);
    await activate(v2.context);
    expect(await get(v2.context, "assets/lazy-a.js")).toEqual({status: 200, text: "lazy v1"});
    expect(v2.fetched).not.toContain("assets/lazy-a.js");
  });

  it("asks the network for other files in its directory", async () => {
    const {context} = setUp(planFor(V1), {...V1, "notes.txt": "hello"});
    expect(await get(context, "notes.txt")).toEqual({status: 200, text: "hello"});
  });

  it("leaves other sites, other methods and unknown pages to the browser", () => {
    const {context} = setUp(planFor(V1), V1);
    expect(respond(context, new Request("https://example.com/a.js"))).toBeNull();
    expect(respond(context, new Request(SCOPE + "assets/main-a.js", {method: "POST"}))).toBeNull();
    expect(respond(context, navigation(SCOPE + "other.html"))).toBeNull();
  });

  it("keeps a runtime file once used, if it's the file the build made", async () => {
    const runtime = {"examples/a.json": "{\"a\":1}", "examples/b.json": "{\"b\":1}"};
    const site: Site = {...V1, "examples/a.json": runtime["examples/a.json"]};
    const {context, cache, fetched} = setUp(planFor(V1, runtime), site);
    expect(await get(context, "examples/a.json")).toEqual({status: 200, text: "{\"a\":1}"});
    // Missing on the server, so it sends its home page: passed on, but not kept.
    expect(await get(context, "examples/b.json")).toEqual({status: 200, text: HOME});
    expect(cache.paths().map(path => path.split("?")[0])).toEqual(["examples/a.json"]);
    fetched.length = 0;
    expect(await get(context, "examples/a.json")).toEqual({status: 200, text: "{\"a\":1}"});
    expect(fetched).toEqual([]);
  });

  it("still gives the file when the cache is full", async () => {
    const cache = new MemoryCache();
    cache.full = true;
    const {context} = setUp(planFor(V1), V1, cache);
    expect(await get(context, "assets/main-a.js")).toEqual({status: 200, text: "main v1"});
  });

  it("answers one range with its bytes, and several with the whole file", async () => {
    const {context} = setUp(planFor(V1), V1);
    await install(context);
    const range = (header: string) => get(context, "assets/main-a.js", {headers: {Range: header}});
    expect(await range("bytes=0-3")).toEqual({status: 206, text: "main"});
    expect(await range("bytes=0-1, 3-4")).toEqual({status: 200, text: "main v1"});
    expect(await range("bytes=100-")).toEqual({status: 416, text: ""});
  });
});
