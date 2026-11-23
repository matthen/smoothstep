// What the service worker does on install, on activate and for each request, with the cache and
// the network passed in so it can be tested.
import { REVISION_LENGTH, type CachePlan } from './cachePlan';
import { findTarget, parseRange, planKey, planKeys } from './workerRoutes';

export interface WorkerContext {
  scope: string;
  plan: CachePlan;
  openCache: () => Promise<Pick<Cache, "match" | "put" | "keys" | "delete">>;
  fetch: (input: string | Request, init?: RequestInit) => Promise<Response>;
}

// Fetches every precached file this version doesn't have yet, and fails if any isn't the file the
// build made, so the last version stays. Files that haven't changed are kept from the last version.
export async function install({scope, plan, openCache, fetch}: WorkerContext): Promise<void> {
  const cache = await openCache();
  const have = new Set((await cache.keys()).map(request => request.url));
  await Promise.all(Object.keys(plan.precache).map(async path => {
    const target = findTarget(scope + path, scope, plan, false);
    if (target?.kind !== "precache" || have.has(target.key)) {
      return;
    }
    const response = await fetch(target.url, {cache: "reload"});
    const checked = response.ok ? await verified(response, target.revision) : null;
    if (!checked) {
      throw new Error("Couldn't fetch " + path);
    }
    await cache.put(target.key, checked);
  }));
}

// Drops files that neither this version nor the one before uses: pages still open from the last
// version may yet load one of its chunks.
export async function activate({scope, plan, openCache}: WorkerContext): Promise<void> {
  const cache = await openCache();
  const previous = await cache.match(planKey(scope)).then(r => r?.json() as Promise<CachePlan> | undefined);
  const keep = new Set([...planKeys(scope, plan), ...(previous ? planKeys(scope, previous) : [])]);
  const keys = await cache.keys();
  await Promise.all(keys.filter(request => !keep.has(request.url) && request.url !== planKey(scope))
    .map(request => cache.delete(request)));
  await cache.put(planKey(scope), new Response(JSON.stringify(plan)));
}

// The response to a GET request, or null to leave it to the browser.
export function respond(context: WorkerContext, request: Request): Promise<Response> | null {
  if (request.method !== "GET") {
    return null;
  }
  const {scope, plan, openCache, fetch} = context;
  const target = findTarget(request.url, scope, plan, request.mode === "navigate");
  if (!target || (target.kind === "unknown" && request.mode === "navigate")) {
    return null;
  }
  return (async () => {
    const cache = await openCache();
    if (target.kind === "unknown") {
      // Most likely a chunk of the last version, for a page still open from it. A server may answer
      // for a deleted file with its home page, so the cached copy comes first.
      const old = await cache.match(request.url.split(/[?#]/)[0]!, {ignoreSearch: true});
      return old ?? fetch(request);
    }
    let response = await cache.match(target.key);
    if (!response) {
      // A runtime file used for the first time, or a precached one the browser cleared. With no
      // network this fails, as it would without the worker. Kept only if it's this revision.
      const fetched = await fetch(target.url, {cache: "no-cache"});
      const checked = fetched.status === 200 ? await verified(fetched.clone(), target.revision) : null;
      if (!checked) {
        return fetched;
      }
      response = checked;
      // Out of storage, say: the page still gets the file.
      await cache.put(target.key, response.clone()).catch((error: unknown) => console.warn(error));
    }
    const range = request.headers.get("Range");
    return range && response.status === 200 ? partial(response, range) : response;
  })();
}

// The first characters of the SHA-256 of the file's bytes, as the build's plan gives each file.
export async function revisionOf(body: BufferSource): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", body));
  return Array.from(digest, byte => byte.toString(16).padStart(2, "0")).join("").slice(0, REVISION_LENGTH);
}

// A copy of the response if its body is the file the plan names, or null. The copy has no redirect,
// since browsers won't show a page from a response that followed one.
async function verified(response: Response, revision: string): Promise<Response | null> {
  const body = await response.arrayBuffer();
  if (await revisionOf(body) !== revision) {
    return null;
  }
  const {status, statusText, headers} = response;
  return new Response(body, {status, statusText, headers});
}

// Answers a Range request, as video elements send, from the whole file. Several ranges get it all.
async function partial(response: Response, header: string): Promise<Response> {
  if (header.includes(",")) {
    return response;
  }
  const body = await response.arrayBuffer();
  const range = parseRange(header, body.byteLength);
  if (!range) {
    return new Response(null, {status: 416, headers: {"Content-Range": `bytes */${body.byteLength}`}});
  }
  const [start, end] = range;
  const headers = new Headers(response.headers);
  headers.set("Content-Range", `bytes ${start}-${end - 1}/${body.byteLength}`);
  headers.set("Content-Length", String(end - start));
  return new Response(body.slice(start, end), {status: 206, statusText: "Partial Content", headers});
}
