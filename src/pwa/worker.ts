// The service worker, which lets the app load and run with no network. It's built into sw.js beside
// index.html with the build's cache plan, and only handles requests under its own directory.
import type { CachePlan } from './cachePlan';
import { activate, install, respond, type WorkerContext } from './workerHandlers';
import { cacheName, scopeOf } from './workerRoutes';

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
const scope = scopeOf(worker.location.href);
const context: WorkerContext = {
  scope, plan: CACHE_PLAN, openCache: () => caches.open(cacheName(scope)), fetch: (input, init) => fetch(input, init),
};

// The new version waits until the app asks it to take over.
worker.addEventListener("install", event => event.waitUntil(install(context)));

worker.addEventListener("activate", event => {
  event.waitUntil(activate(context).then(() => worker.clients.claim()));
});

worker.addEventListener("message", event => {
  if ((event.data as {type?: unknown} | null)?.type === "skipWaiting") {
    void worker.skipWaiting();
  }
});

worker.addEventListener("fetch", event => {
  const response = respond(context, event.request);
  if (response) {
    event.respondWith(response);
  }
});
