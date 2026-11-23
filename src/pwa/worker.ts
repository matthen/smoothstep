// The service worker, which lets the app load and run with no network. It's built into sw.js beside
// index.html with the build's cache plan, and only handles requests under its own directory.
import type { CachePlan } from './cachePlan';
import { cacheName, findTarget, parseRange, planKey, planKeys, scopeOf } from './workerRoutes';

declare const CACHE_PLAN: CachePlan;

// The parts of the service worker scope this uses, which the DOM types don't include.
interface ExtendableEvent extends Event {
  waitUntil(promise: Promise<unknown>): void;
}
interface FetchEvent extends ExtendableEvent {
  request: Request;
  respondWith(response: Promise<Response>): void;
}
interface WorkerScope {
  location: Location;
  clients: {claim(): Promise<void>};
  skipWaiting(): Promise<void>;
  addEventListener(type: "install" | "activate", listener: (event: ExtendableEvent) => void): void;
  addEventListener(type: "fetch", listener: (event: FetchEvent) => void): void;
  addEventListener(type: "message", listener: (event: MessageEvent) => void): void;
}

const worker = self as unknown as WorkerScope;
const plan = CACHE_PLAN;
const scope = scopeOf(worker.location.href);
const openCache = () => caches.open(cacheName(scope));

// Fetches every precached file this version doesn't have yet. Files that haven't changed are kept
// from the last version. The new version waits until the app asks it to take over.
worker.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await openCache();
    const have = new Set((await cache.keys()).map(request => request.url));
    await Promise.all(Object.entries(plan.precache).map(async ([path]) => {
      const target = findTarget(scope + path, scope, plan, false);
      if (target?.kind !== "precache" || have.has(target.key)) {
        return;
      }
      const response = await fetch(target.url, {cache: "reload"});
      if (!response.ok) {
        throw new Error("Couldn't fetch " + path);
      }
      await cache.put(target.key, await unredirected(response));
    }));
  })());
});

// Drops files that neither this version nor the one before uses: pages still open from the last
// version may yet load one of its chunks.
worker.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const cache = await openCache();
    const previous = await cache.match(planKey(scope)).then(r => r?.json() as Promise<CachePlan> | undefined);
    const keep = new Set([...planKeys(scope, plan), ...(previous ? planKeys(scope, previous) : [])]);
    const keys = await cache.keys();
    await Promise.all(keys.filter(request => !keep.has(request.url) && request.url !== planKey(scope))
      .map(request => cache.delete(request)));
    await cache.put(planKey(scope), new Response(JSON.stringify(plan)));
    await worker.clients.claim();
  })());
});

worker.addEventListener("message", event => {
  if ((event.data as {type?: unknown} | null)?.type === "skipWaiting") {
    void worker.skipWaiting();
  }
});

worker.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") {
    return;
  }
  const target = findTarget(request.url, scope, plan, request.mode === "navigate");
  if (!target || (target.kind === "unknown" && request.mode === "navigate")) {
    return;
  }
  event.respondWith((async () => {
    const cache = await openCache();
    if (target.kind === "unknown") {
      // Another version's file, say: the network, or failing that any copy in the cache.
      try {
        return await fetch(request);
      } catch (error) {
        const old = await cache.match(request.url.split(/[?#]/)[0]!, {ignoreSearch: true});
        if (old) {
          return old;
        }
        throw error;
      }
    }
    let response = await cache.match(target.key);
    if (!response) {
      // A runtime file used for the first time, or a precached one the browser cleared. With no
      // network this fails, as it would without the worker. Revalidated, so the copy kept is this revision.
      response = await unredirected(await fetch(target.url, {cache: "no-cache"}));
      if (response.status === 200) {
        await cache.put(target.key, response.clone());
      }
    }
    const range = request.headers.get("Range");
    return range && response.status === 200 ? partial(response, range) : response;
  })());
});

// Browsers won't show a page from a response that followed a redirect, so a server that redirects,
// say, index.html to its directory gets a copy without the redirect.
async function unredirected(response: Response): Promise<Response> {
  if (!response.redirected) {
    return response;
  }
  const {status, statusText, headers} = response;
  return new Response(await response.blob(), {status, statusText, headers});
}

// Answers a Range request, as video elements send, from the whole file.
async function partial(response: Response, header: string): Promise<Response> {
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
