// How the service worker answers a request: the pure parts, kept apart from the worker so they can
// be tested.
import type { CachePlan } from './cachePlan';

// The directory the worker's file is in, which is the only part of the site it handles.
export function scopeOf(workerURL: string): string {
  return new URL("./", workerURL).href;
}

// One cache per scope, so copies of the app at different paths on one site keep apart.
export function cacheName(scope: string): string {
  return "smoothstep " + scope;
}

// A file's key in the cache: its URL with its revision, so a changed file is a new entry.
export function cacheKey(scope: string, path: string, revision: string): string {
  return scope + path + "?__rev=" + revision;
}

// Where the plan the worker last activated with is kept, so its files outlast one update.
export function planKey(scope: string): string {
  return scope + "__cache-plan.json";
}

// Every key the plan's files can have in the cache.
export function planKeys(scope: string, plan: CachePlan): string[] {
  return [plan.precache, plan.runtime].flatMap(files =>
    Object.entries(files).map(([path, revision]) => cacheKey(scope, path, revision)));
}

export type Target =
  | {kind: "precache" | "runtime"; url: string; key: string}
  // In the scope but not one of this version's files, such as an older version's chunk.
  | {kind: "unknown"};

// What a GET request is for, or null if the worker should leave it to the network: it's on another
// site, or outside the app's directory. Pages are found without their query, and a directory gives
// its index.html.
export function findTarget(requestURL: string, scope: string, plan: CachePlan, navigation: boolean): Target | null {
  const url = new URL(requestURL);
  url.search = "";
  url.hash = "";
  if (!url.href.startsWith(scope)) {
    return null;
  }
  let path: string;
  try {
    path = decodeURIComponent(url.href.slice(scope.length));
  } catch {
    return {kind: "unknown"};
  }
  if (navigation && (path === "" || path.endsWith("/"))) {
    path += "index.html";
  }
  for (const kind of ["precache", "runtime"] as const) {
    const revision = plan[kind][path];
    if (revision !== undefined) {
      return {kind, url: scope + path, key: cacheKey(scope, path, revision)};
    }
  }
  return {kind: "unknown"};
}

// The bytes a Range header asks for, as [start, end) in a file of `size` bytes, or null if it asks
// for something this can't give.
export function parseRange(header: string, size: number): [number, number] | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (match[1] === "" && match[2] === "")) {
    return null;
  }
  if (match[1] === "") {
    // The last n bytes.
    const length = Math.min(Number(match[2]), size);
    return length > 0 ? [size - length, size] : null;
  }
  const start = Number(match[1]);
  const end = match[2] === "" ? size : Math.min(Number(match[2]) + 1, size);
  return start < end ? [start, end] : null;
}
