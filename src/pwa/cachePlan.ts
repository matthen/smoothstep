// Which of the built files the service worker keeps, and when. Paths are relative to the app's
// directory, and each maps to a revision: the start of the SHA-256 of its bytes, in hex.

export interface CachePlan {
  // Changes whenever any file in the plan does, so the worker's own file changes with it.
  version: string;
  // Fetched when the worker installs: everything the app needs to start and run offline.
  precache: Record<string, string>;
  // Kept the first time they're used: built-in textures, the examples with their previews, and the
  // docs' screenshots.
  runtime: Record<string, string>;
}

export const WORKER_FILE = "sw.js";
export const REVISION_LENGTH = 16;

const RUNTIME_DIRS = ["examples/", "images/textures/", "docs/images/"];
// Files only search engines, social sites and old Windows tiles ask for.
const NOT_CACHED = new Set([WORKER_FILE, "robots.txt", "browserconfig.xml", "mstile-150x150.png", "share.png"]);

export function cachePolicy(path: string): "precache" | "runtime" | "none" {
  if (NOT_CACHED.has(path) || path.endsWith(".map") || path.split("/").some(part => part.startsWith("."))) {
    return "none";
  }
  // Browsers with service workers all take .woff2, so they never ask for a font's .woff fallback.
  return RUNTIME_DIRS.some(dir => path.startsWith(dir)) || path.endsWith(".woff") ? "runtime" : "precache";
}

// The plan for a build, from each file's revision. `hash` makes the version from them.
export function cachePlan(revisions: ReadonlyMap<string, string>, hash: (text: string) => string): CachePlan {
  const precache: Record<string, string> = {};
  const runtime: Record<string, string> = {};
  for (const path of [...revisions.keys()].sort()) {
    const policy = cachePolicy(path);
    if (policy !== "none") {
      (policy === "precache" ? precache : runtime)[path] = revisions.get(path)!;
    }
  }
  return {version: hash(JSON.stringify([precache, runtime])), precache, runtime};
}
