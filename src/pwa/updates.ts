// Registers the service worker that keeps the app working offline, and notices when a new version
// of the app has installed in the background and is waiting to take over.
import { WORKER_FILE } from './cachePlan';

// The parts of the browser's service worker objects this uses, so tests can fake them.
interface WorkerLike {
  state: string;
  postMessage(message: unknown): void;
  addEventListener(type: "statechange", listener: () => void): void;
}
interface RegistrationLike {
  waiting: WorkerLike | null;
  installing: WorkerLike | null;
  update(): Promise<unknown>;
  addEventListener(type: "updatefound", listener: () => void): void;
}
export interface ContainerLike {
  controller: unknown;
  register(url: string, options: RegistrationOptions): Promise<RegistrationLike>;
  addEventListener(type: "controllerchange", listener: () => void): void;
}

const CHECK_EVERY = 60 * 60 * 1000;

export class Updates {
  private waiting: WorkerLike | null = null;
  private listeners = new Set<() => void>();
  private reloading = false;
  private reloaded = false;

  constructor(private container: ContainerLike, private reloadPage: () => void) {
    // Only a change this page asked for reloads it; the first install also changes the controller.
    container.addEventListener("controllerchange", () => {
      if (this.reloading) {
        this.reload();
      }
    });
  }

  // Registers the worker beside the page, so it handles only the app's directory.
  async register(baseURL: string): Promise<void> {
    const registration = await this.container.register(new URL(WORKER_FILE, baseURL).href, {updateViaCache: "none"});
    // A page that was open before the worker installed has no controller, and nothing to update.
    const hadController = () => this.container.controller !== null;
    const watch = (worker: WorkerLike | null) => {
      if (!worker) {
        return;
      }
      const check = () => {
        if (worker.state === "installed" && hadController()) {
          this.setWaiting(worker);
        }
      };
      worker.addEventListener("statechange", check);
      check();
    };
    watch(registration.waiting);
    watch(registration.installing);
    registration.addEventListener("updatefound", () => watch(registration.installing));
    // Tabs left open for days still hear about new versions.
    setInterval(() => void registration.update().catch(() => {}), CHECK_EVERY);
  }

  get ready(): boolean {
    return this.waiting !== null;
  }

  // Calls `listener` when a new version is waiting, at once if one is. Returns a function to stop.
  onReady(listener: () => void): () => void {
    this.listeners.add(listener);
    if (this.ready) {
      listener();
    }
    return () => this.listeners.delete(listener);
  }

  // Lets the waiting version take over, and reloads into it.
  apply() {
    this.reloading = true;
    if (this.waiting?.state !== "installed") {
      // Another tab already switched to it.
      this.reload();
      return;
    }
    this.waiting.postMessage({type: "skipWaiting"});
    // In case the switch never comes, say if the new version failed.
    setTimeout(() => this.reload(), 5000);
  }

  private reload() {
    if (!this.reloaded) {
      this.reloaded = true;
      this.reloadPage();
    }
  }

  private setWaiting(worker: WorkerLike) {
    if (this.waiting === worker) {
      return;
    }
    this.waiting = worker;
    this.listeners.forEach(listener => listener());
  }
}

let updates: Updates | null = null;

// Starts the worker in production builds, where the browser supports it, once the page has loaded so
// its downloads don't slow the first visit. The dev server has no worker, so changes always show.
export function startServiceWorker() {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator) || !window.isSecureContext) {
    return;
  }
  const current = new Updates(navigator.serviceWorker, () => window.location.reload());
  updates = current;
  const register = () => current.register(document.baseURI).catch((error: unknown) => console.warn("No offline support:", error));
  if (document.readyState === "complete") {
    void register();
  } else {
    window.addEventListener("load", () => void register(), {once: true});
  }
}

export function appUpdates(): Updates | null {
  return updates;
}

// How long after loading a page counts as just opened, if nobody has clicked, tapped or typed.
export const FRESH_FOR = 3_000;
const AUTO_KEY = "smoothstep.autoUpdated";

// True while nothing could be lost by reloading: the page has just opened, nobody has used it yet,
// and this tab didn't already reload for an update in the last minute (so a failed update can't loop).
export function canUpdateAtOnce(sinceLoad: number, used: boolean, unsaved: boolean, lastAuto: number | null, now: number): boolean {
  return sinceLoad < FRESH_FOR && !used && !unsaved && (lastAuto === null || now - lastAuto > 60_000);
}

let used = false;
if (typeof window !== "undefined") {
  const markUsed = () => { used = true; };
  for (const type of ["pointerdown", "keydown", "wheel"]) {
    window.addEventListener(type, markUsed, {capture: true, once: true});
  }
}

// Applies a waiting update straight away if the page is fresh, and says whether it did.
export function updateIfFresh(unsaved: boolean): boolean {
  let lastAuto: number | null = null;
  try {
    const stored = window.sessionStorage.getItem(AUTO_KEY);
    lastAuto = stored === null ? null : Number(stored);
  } catch {
    // No storage: treat it as never auto-updated.
  }
  if (!updates || !canUpdateAtOnce(performance.now(), used, unsaved, lastAuto, Date.now())) {
    return false;
  }
  try {
    window.sessionStorage.setItem(AUTO_KEY, String(Date.now()));
  } catch {
    return false;
  }
  updates.apply();
  return true;
}
