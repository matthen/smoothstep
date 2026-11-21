// The animation being edited, kept outside React so the crash screen can still offer it.
import type { AnimationDocument } from '../lib/document';

let current: {id: string | null; json: AnimationDocument} | null = null;

export function setCrashDocument(value: {id: string | null; json: AnimationDocument}) {
  current = value;
}

export function crashDocument() {
  return current;
}

const RELOADED_KEY = "smoothstep.reloadedForUpdate";
let missedUpdate = false;

// True once part of the app failed to load, which usually means a new version was published while
// this page was open, so its old files are gone.
export function hasMissedUpdate() {
  return missedUpdate;
}

// Reloads to get the new version when part of the app fails to load. Offline, or if a reload in
// the last minute didn't fix it, the error goes on to the crash screen instead, which keeps the
// app's state and offers downloads. The page asks first if there are unsaved changes.
export function reloadOnMissedUpdate() {
  window.addEventListener("vite:preloadError", () => {
    missedUpdate = true;
    if (!navigator.onLine) {
      return;
    }
    try {
      const last = Number(window.sessionStorage.getItem(RELOADED_KEY) ?? 0);
      if (Date.now() - last > 60_000) {
        window.sessionStorage.setItem(RELOADED_KEY, String(Date.now()));
        window.location.reload();
      }
    } catch {
      // No session storage: leave it to the crash screen.
    }
  });
}
