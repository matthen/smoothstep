// Installing the app, in browsers that offer it, and opening animation files with the installed app.
import { useSyncExternalStore } from 'react';

// Chromium's install offer, which isn't in the DOM types.
interface InstallPromptEvent extends Event {
  prompt(): Promise<unknown>;
}

let offer: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const changed = () => listeners.forEach(listener => listener());

// Whether the app is running installed, in a window of its own.
function runningInstalled(): boolean {
  return ["standalone", "window-controls-overlay"]
    .some(mode => window.matchMedia(`(display-mode: ${mode})`).matches);
}

// Keeps the browser's install offer for Help → Install as an app, rather than letting it show a banner.
// Runs before the app renders, since the offer can come early.
export function listenForInstallOffer(target: Window = window) {
  target.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    offer = event as InstallPromptEvent;
    changed();
  });
  target.addEventListener("appinstalled", () => {
    offer = null;
    changed();
  });
}

function canInstall(): boolean {
  return offer !== null && !runningInstalled();
}

export function useCanInstall(): boolean {
  return useSyncExternalStore(listener => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }, canInstall);
}

// Asks the browser to install the app. Each offer can be used once; the browser may make another.
export async function install() {
  const current = offer;
  offer = null;
  changed();
  await current?.prompt();
}

interface LaunchParams {
  files?: readonly {getFile(): Promise<File>}[];
}
interface LaunchQueue {
  setConsumer(consumer: (params: LaunchParams) => void): void;
}

const LAUNCH_KEY = "smoothstep.launchedWith";

// Calls `open` with the files the installed app was opened with, in browsers that can open files
// with apps (Chromium's launchQueue). Chromium gives them again after each reload, so a window
// opens them only once.
export function onLaunchFiles(open: (files: File[]) => void) {
  const queue = (window as {launchQueue?: LaunchQueue}).launchQueue;
  queue?.setConsumer(params => {
    if (params.files?.length) {
      void Promise.all(params.files.map(handle => handle.getFile())).then(files => {
        const launch = JSON.stringify(files.map(file => [file.name, file.size, file.lastModified]));
        try {
          if (sessionStorage.getItem(LAUNCH_KEY) === launch) {
            return;
          }
          sessionStorage.setItem(LAUNCH_KEY, launch);
        } catch {
          // No storage: App checks too that the file isn't already open.
        }
        open(files);
      }, (error: unknown) => console.error(error));
    }
  });
}
