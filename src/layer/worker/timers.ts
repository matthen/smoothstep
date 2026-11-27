// The timers a Canvas2D layer's code gets. They run only while steps are being drawn, or soon after:
// a timer that comes due while the animation is paused waits for the next step, so a loop of them
// doesn't keep the worker busy. The worker gets makeTimers as source text, so it must not use
// anything from outside its own body.
import type { Natives } from './lockdown';

type Callback = (...args: unknown[]) => void;

export function makeTimers({natives, now}: {
  natives: Pick<Natives, "apply" | "deleteProperty" | "remove" | "setTimeout" | "setInterval" | "clearTimeout">;
  now(): number;
}) {
  // Called as plain functions, as a browser's timers refuse another `this`.
  const {apply, deleteProperty, remove, setTimeout: nativeSetTimeout, setInterval: nativeSetInterval} = natives;
  const nativeClear = natives.clearTimeout;
  const IDLE_MS = 1000;
  let lastActive = -Infinity;
  let drawing = false;
  let nextTimer = 1;
  // Kept in objects with no prototype, so the code can't patch how they're stored.
  const timers = Object.create(null) as Record<number, ReturnType<typeof nativeSetTimeout> | undefined>;
  const parked = Object.create(null) as Record<number, (() => void) | undefined>;
  const awake = () => drawing || now() - lastActive < IDLE_MS;
  const call = (callback: unknown, args: unknown[]) => {
    if (typeof callback === "function") {
      apply(callback as Callback, undefined, args);
    }
  };
  const clear = (id: unknown) => {
    if (typeof id === "number") {
      nativeClear(timers[id]);
      deleteProperty(timers, id);
      deleteProperty(parked, id);
    }
  };
  const setTimeout = (callback: unknown, ms?: number, ...args: unknown[]) => {
    const id = nextTimer++;
    timers[id] = nativeSetTimeout(() => {
      deleteProperty(timers, id);
      if (awake()) {
        call(callback, args);
      } else {
        parked[id] = () => call(callback, args);
      }
    }, ms);
    return id;
  };
  const setInterval = (callback: unknown, ms?: number, ...args: unknown[]) => {
    const id = nextTimer++;
    const start = () => {
      timers[id] = nativeSetInterval(() => {
        if (awake()) {
          call(callback, args);
        } else {
          nativeClear(timers[id]);
          deleteProperty(timers, id);
          parked[id] = () => {
            start();
            call(callback, args);
          };
        }
      }, ms);
    };
    start();
    return id;
  };
  return {
    // Puts these timers in place of the worker's own.
    install(global: Record<string, unknown>) {
      ["setTimeout", "setInterval", "clearTimeout", "clearInterval"].forEach(name => remove(name));
      Object.assign(global, {setTimeout, setInterval, clearTimeout: clear, clearInterval: clear});
    },
    // Drawing has started: runs the parked timers in turn, skipping any that an earlier one cleared.
    wake() {
      drawing = true;
      for (const id in parked) {
        const resume = parked[id];
        if (resume) {
          deleteProperty(parked, id);
          resume();
        }
      }
    },
    // Drawing has stopped, so timers soon wait for the next step.
    sleep() {
      drawing = false;
      lastActive = now();
    },
  };
}
