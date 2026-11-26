// The Canvas2D layer's worker runtime, run in a context of its own with a clock the tests move on.
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

import type { ToWorker, WorkerLog } from './runtime';
import { workerSource } from './workerSource';

interface Timer {
  at: number;
  every: number | null;
  callback: () => void;
}

class FakeBitmap {
  closed = false;
  constructor(public name: string) {}
  close() {
    this.closed = true;
  }
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
    ImageBitmap: FakeBitmap,
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

// The console calls in the messages a worker sent.
function sentLogs(sent: {type: string}[]): WorkerLog[] {
  return sent.flatMap(m => m.type === "logs" ? (m as {type: string; logs: WorkerLog[]}).logs : []);
}

const INIT: ToWorker ={type: "init", width: 4, height: 4, duration: 1, fonts: [], textures: []};
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

  it("sends console calls with their step, folding repeats and sending them before the frame", async () => {
    const worker = startWorker([
      "console.log(\"loaded\", {n: 1});",
      "function setup() { console.info(\"setup\"); }",
      "function draw(ctx, {frame}) { console.log(\"tick\"); if (frame === 2) console.warn(\"frame\", frame); }",
    ].join("\n"));
    worker.givePort();
    await worker.send(INIT);
    await worker.send({type: "steps", id: 1, steps: [0, 1, 2].map(frame => ({time: frame / 60, frame, floats: []}))});
    const types = worker.sent.map(m => m.type);
    expect(types.indexOf("logs")).toBeLessThan(types.indexOf("ready"));
    expect(types.lastIndexOf("logs")).toBeLessThan(types.indexOf("frame"));
    expect(sentLogs(worker.sent).map(({level, text, frame}) => `${level} ${text} @${frame}`)).toEqual([
      "log loaded {n: 1} @null", "info setup @0", "log tick @0", "log tick @1", "log tick @2", "warn frame 2 @2",
    ]);
  });

  it("folds a line logged again and again into one with a count", async () => {
    const worker = startWorker("function draw() { for (let i = 0; i < 100; i++) console.log(\"same\"); }");
    worker.givePort();
    await worker.send(INIT);
    await worker.send(STEP);
    expect(sentLogs(worker.sent).map(({text, count}) => `${text} ×${count}`)).toEqual(["same ×100"]);
  });

  it("keeps a code's flood of different lines to a limit, counting the rest", async () => {
    const worker = startWorker("function draw() { for (let i = 0; i < 5000; i++) console.log(i); }");
    worker.givePort();
    await worker.send(INIT);
    await worker.send(STEP);
    const messages = worker.sent.filter(m => m.type === "logs") as unknown as {logs: WorkerLog[]; dropped: number}[];
    const kept = messages.reduce((sum, m) => sum + m.logs.length, 0);
    const dropped = messages.reduce((sum, m) => sum + m.dropped, 0);
    expect(kept).toBeLessThanOrEqual(200);
    expect(kept + dropped).toBe(5000);
  });

  it("gives setup and draw the frame's size in pixels as resolution", async () => {
    const worker = startWorker([
      "globalThis.seen = [];",
      "function setup({resolution}) { seen.push(resolution.join(\"x\")); }",
      "function draw(ctx, {resolution, width, height}) { seen.push(resolution.join(\"x\"), width + \"x\" + height); }",
    ].join("\n"));
    worker.givePort();
    await worker.send({...INIT, width: 640, height: 360});
    await worker.send(STEP);
    expect(worker.context.seen).toEqual(["640x360", "640x360", "1920x1080"]);
  });

  it("puts each step's video frames in their texture slots, closing the frame before", async () => {
    const worker = startWorker([
      "globalThis.seen = [];",
      "function draw(ctx, {textures}) { seen.push(textures.map(t => t && t.name).join(\",\")); }",
    ].join("\n"));
    const image = new FakeBitmap("image");
    const [first, second] = [new FakeBitmap("video at 0"), new FakeBitmap("video at 1/60")];
    const bitmap = (b: FakeBitmap) => b as unknown as ImageBitmap;
    worker.givePort();
    await worker.send({...INIT, textures: [bitmap(image), null]});
    await worker.send({type: "steps", id: 1, steps: [
      {time: 0, frame: 0, floats: [], videoFrames: [{slot: 1, bitmap: bitmap(first)}]},
      {time: 1 / 60, frame: 1, floats: [], videoFrames: [{slot: 1, bitmap: bitmap(second)}]},
      {time: 2 / 60, frame: 2, floats: []},
    ]});
    expect(worker.context.seen).toEqual(["image,video at 0", "image,video at 1/60", "image,video at 1/60"]);
    expect([image.closed, first.closed, second.closed]).toEqual([false, true, false]);
  });
});
