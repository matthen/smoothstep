// The Canvas2D layer's worker runtime, run in a context of its own with a clock the tests move on.
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

import type { ToWorker } from './runtime';
import { workerSource } from './workerSource';

interface Timer {
  at: number;
  every: number | null;
  callback: () => void;
}

// Starts a worker running `code`, with the worker's own globals, a port and a fake clock.
function startWorker(code: string) {
  let now = 0;
  let nextTimer = 1;
  const timers = new Map<number, Timer>();
  const sent: {type: string}[] = [];
  const listeners: ((event: Event) => void)[] = [];

  class Event {
    stopped = false;
    stopImmediatePropagation() {
      this.stopped = true;
    }
  }
  class MessageEvent extends Event {
    #data: unknown;
    constructor(data: unknown) {
      super();
      this.#data = data;
    }
    get data() {
      return this.#data;
    }
  }
  class MessagePort {
    handler: ((event: MessageEvent) => void) | null = null;
    set onmessage(handler: (event: MessageEvent) => void) {
      this.handler = handler;
    }
    postMessage(message: {type: string}) {
      sent.push(message);
    }
  }
  const context = vm.createContext({
    Event, MessageEvent, MessagePort,
    performance: {now: () => now},
    setTimeout: (callback: () => void, ms = 0) => {
      timers.set(nextTimer, {at: now + ms, every: null, callback});
      return nextTimer++;
    },
    setInterval: (callback: () => void, ms = 0) => {
      timers.set(nextTimer, {at: now + ms, every: ms, callback});
      return nextTimer++;
    },
    clearTimeout: (id: number) => timers.delete(id),
    addEventListener: (type: string, listener: (event: Event) => void) => {
      if (type === "message") {
        listeners.push(listener);
      }
    },
    OffscreenCanvas: class {
      constructor(public width: number, public height: number) {}
      getContext() {
        return {save() {}, restore() {}, setTransform() {}};
      }
    },
    createImageBitmap: () => Promise.resolve({}),
  }) as Record<string, unknown>;
  vm.runInContext("globalThis.self = globalThis;", context);
  vm.runInContext(workerSource(code, []).source, context);

  const port = new MessagePort();
  const settle = () => new Promise(resolve => setTimeout(resolve, 0));
  return {
    context, sent,
    // Hands the worker its port, as the sandbox does.
    givePort() {
      const event = new MessageEvent({port});
      for (const listener of [...listeners]) {
        listener(event);
        if (event.stopped) {
          break;
        }
      }
    },
    async send(message: ToWorker) {
      port.handler?.(new MessageEvent(message));
      await settle();
    },
    // Moves the clock on to `to` ms, running each timer that comes due.
    advance(to: number) {
      for (;;) {
        const [id, timer] = [...timers].sort((a, b) => a[1].at - b[1].at)[0] ?? [];
        if (id === undefined || timer!.at > to) {
          break;
        }
        now = timer!.at;
        if (timer!.every === null) {
          timers.delete(id);
        } else {
          timer!.at += Math.max(1, timer!.every);
        }
        timer!.callback();
      }
      now = to;
    },
  };
}

const INIT: ToWorker = {type: "init", width: 4, height: 4, duration: 1, fonts: [], textures: []};
const STEP: ToWorker = {type: "steps", id: 1, steps: [{time: 0, frame: 0, floats: []}]};

describe("workerRuntime", () => {
  it("runs the layer's code only once it has the port, so the code can't take it", async () => {
    const worker = startWorker([
      "globalThis.ran = true;",
      "Event.prototype.stopImmediatePropagation = function () {};",
      "addEventListener(\"message\", event => { globalThis.grabbed = event.data; }, {capture: true});",
      "function draw() {}",
    ].join("\n"));
    expect(worker.context.ran).toBeUndefined();
    worker.givePort();
    expect(worker.context.ran).toBe(true);
    expect(worker.context.grabbed).toBeUndefined();
    await worker.send(INIT);
    expect(worker.sent).toEqual([{type: "ready", registered: true, hasDraw: true}]);
  });

  it("doesn't run a timer that comes due while paused if one before it clears it", async () => {
    const worker = startWorker([
      "globalThis.ran = [];",
      "let b;",
      "setTimeout(() => { ran.push(\"a\"); clearTimeout(b); }, 10);",
      "b = setTimeout(() => ran.push(\"b\"), 10);",
      "function draw() {}",
    ].join("\n"));
    worker.givePort();
    await worker.send(INIT);
    worker.advance(20);
    expect(worker.context.ran).toEqual([]);
    await worker.send(STEP);
    expect(worker.context.ran).toEqual(["a"]);
  });

  it("goes back to holding timers after a timer that was waiting throws", async () => {
    const worker = startWorker([
      "globalThis.ran = [];",
      "setTimeout(() => { throw new Error(\"oops\"); }, 10);",
      "setTimeout(() => ran.push(\"later\"), 5000);",
      "function draw() {}",
    ].join("\n"));
    worker.givePort();
    await worker.send(INIT);
    worker.advance(20);
    await worker.send(STEP);
    expect(worker.sent.map(m => m.type)).toEqual(["ready", "error"]);
    worker.advance(6000);
    expect(worker.context.ran).toEqual([]);
  });
});
