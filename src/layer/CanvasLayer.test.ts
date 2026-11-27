import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { LineError } from '../lib/types';
import type { LayerAssets } from './assets';
import { CanvasLayer, readyOutcome, type LayerConfig, type LayerInputs, type LayerLog } from './CanvasLayer';
import { FakeBitmap, FakeHost, type FakeWorker } from './fakeHost';
import type { WorkerLog } from './runtime';

describe("readyOutcome", () => {
  it("draws only when the code set up a draw function", () => {
    expect(readyOutcome({registered: true, hasDraw: true, stoppedEarly: false})).toBe("draws");
    expect(readyOutcome({registered: true, hasDraw: false, stoppedEarly: false})).toBe("no draw");
  });

  it("tells a top-level return apart from an error, which arrives on its own", () => {
    expect(readyOutcome({registered: false, hasDraw: false, stoppedEarly: true})).toBe("stopped early");
    expect(readyOutcome({registered: false, hasDraw: false, stoppedEarly: false})).toBe("threw");
  });

  it("treats fields of the wrong type from the worker as false", () => {
    expect(readyOutcome({registered: "yes" as unknown as boolean, hasDraw: true})).toBe("threw");
    expect(readyOutcome({registered: true, hasDraw: 1 as unknown as boolean})).toBe("no draw");
  });
});

const CONFIG: LayerConfig = {code: "function draw(ctx) {}", width: 8, height: 4, duration: 1, textures: []};
const ASSETS: LayerAssets = {library: () => Promise.resolve(""), fonts: () => Promise.resolve([])};
// Longer than the layer waits before it calls a run slow.
const LONG_MS = 5_000;

function step(frame: number, videoFrames?: FakeBitmap[]): LayerInputs {
  return {
    time: frame / 60, frame, floats: [],
    videoFrames: videoFrames?.map(bitmap => ({slot: 0, bitmap})),
  };
}

function workerLog(text: string): WorkerLog {
  return {level: "log", text, frame: null, time: null, lines: [], count: 1};
}

// Lets the layer's loading, which waits on promises, finish.
async function settle() {
  for (let i = 0; i < 20; i++) {
    await Promise.resolve();
  }
}

function makeLayer(keepStandby = true) {
  const host = new FakeHost();
  const seen = {
    frames: [] as FakeBitmap[], statuses: [] as {errors: LineError[]; loading?: boolean}[],
    busy: [] as (number | "starting" | null)[], logs: [] as LayerLog[], dropped: 0, restarts: 0,
  };
  const layer = new CanvasLayer(ASSETS, {
    onFrame: bitmap => seen.frames.push(bitmap as unknown as FakeBitmap),
    onStatus: (errors, loading) => seen.statuses.push({errors, loading}),
    onBusy: frame => seen.busy.push(frame),
    onLog: (logs, dropped) => {
      seen.logs.push(...logs);
      seen.dropped += dropped;
    },
    onRestart: () => seen.restarts++,
  }, keepStandby, host);
  const worker = (i: number): FakeWorker => host.workers[i]!;
  return {host, layer, seen, worker};
}

// A layer whose first run has drawn a frame, with its standby started.
async function drawnLayer() {
  const made = makeLayer();
  made.layer.configure(CONFIG);
  await settle();
  made.worker(0).ready();
  made.layer.push(step(0));
  made.worker(0).frame(CONFIG.width, CONFIG.height);
  return made;
}

describe("CanvasLayer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("ImageBitmap", FakeBitmap);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("holds steps while it loads and while the code first runs, then sends them in one batch", async () => {
    const {layer, worker} = makeLayer();
    layer.configure(CONFIG);
    layer.push(step(0));
    layer.push(step(1));
    await settle();
    layer.push(step(2));
    expect(worker(0).batches).toEqual([]);
    worker(0).ready();
    expect(worker(0).batches.map(batch => batch.steps.map(s => s.frame))).toEqual([[0, 1, 2]]);
  });

  it("says it's busy once steps pile up, and not once they're sent", async () => {
    const {layer, worker} = makeLayer();
    layer.configure(CONFIG);
    await settle();
    let pushed = 0;
    while (!layer.busy && pushed < 1000) {
      layer.push(step(pushed++));
    }
    expect(layer.busy).toBe(true);
    worker(0).ready();
    expect(layer.busy).toBe(false);
  });

  it("clears its errors on the first frame and starts a standby then, unless it goes without", async () => {
    const {host, seen, worker} = await drawnLayer();
    expect(seen.statuses).toEqual([{errors: [], loading: undefined}]);
    expect(host.workers).toHaveLength(2);
    expect(worker(1).posts[0]?.message.type).toBe("init");

    const bare = makeLayer(false);
    bare.layer.configure(CONFIG);
    await settle();
    bare.worker(0).ready();
    bare.layer.push(step(0));
    bare.worker(0).frame(CONFIG.width, CONFIG.height);
    expect(bare.host.workers).toHaveLength(1);
  });

  it("restarts onto the standby, killing the run that drew", async () => {
    const {layer, host, seen, worker} = await drawnLayer();
    worker(1).ready();
    layer.restart();
    expect(worker(0).killed).toBe(true);
    expect(seen.restarts).toBe(1);
    layer.push(step(0));
    expect(worker(1).batches).toHaveLength(1);
    expect(host.workers).toHaveLength(2);
  });

  it("keeps the same run on a restart before it has been sent any steps", async () => {
    const {layer, host, seen, worker} = makeLayer();
    layer.configure(CONFIG);
    await settle();
    worker(0).ready();
    layer.restart();
    expect(worker(0).killed).toBe(false);
    expect(host.workers).toHaveLength(1);
    expect(seen.restarts).toBe(0);
  });

  it("replaces a run that is slow to start on a restart, as its code may never finish", async () => {
    const {layer, host, seen, worker} = makeLayer();
    layer.configure(CONFIG);
    await settle();
    vi.advanceTimersByTime(LONG_MS);
    layer.restart();
    expect(worker(0).killed).toBe(true);
    expect(host.workers).toHaveLength(2);
    expect(seen.restarts).toBe(0);
  });

  it.each([
    ["throws", (w: FakeWorker) => w.reply({type: "error", message: "oops", stack: "", line: null})],
    ["has no draw function", (w: FakeWorker) => w.ready(false)],
    ["crashes", (w: FakeWorker) => w.crash({message: "SyntaxError", line: 1})],
  ])("drops a standby that %s without a word, and starts afresh on the next restart", async (_, fault) => {
    const {layer, host, seen, worker} = await drawnLayer();
    fault(worker(1));
    expect(worker(1).killed).toBe(true);
    expect(seen.statuses).toEqual([{errors: [], loading: undefined}]);
    layer.restart();
    expect(host.workers).toHaveLength(3);
  });

  it("holds a standby's console calls until it takes over", async () => {
    const {layer, seen, worker} = await drawnLayer();
    worker(1).reply({type: "logs", logs: [workerLog("loaded")], dropped: 0});
    expect(seen.logs).toEqual([]);
    worker(1).ready();
    layer.restart();
    expect(seen.logs.map(log => log.text)).toEqual(["loaded"]);
  });

  it("keeps only so many of a standby's console calls, counting the rest", async () => {
    const {layer, seen, worker} = await drawnLayer();
    const total = 1000;
    for (let i = 0; i < total; i += 100) {
      worker(1).reply({type: "logs", logs: Array.from({length: 100}, (_, j) => workerLog(String(i + j))), dropped: 0});
    }
    worker(1).ready();
    layer.restart();
    expect(seen.logs.length).toBeGreaterThan(0);
    expect(seen.logs.length).toBeLessThan(total);
    expect(seen.logs.length + seen.dropped).toBe(total);
    expect(seen.logs[0]?.text).toBe("0");
  });

  it("ignores messages from a run it has replaced", async () => {
    const {layer, seen, worker} = await drawnLayer();
    worker(1).ready();
    layer.restart();
    worker(0).reply({type: "error", message: "late", stack: "", line: null});
    worker(0).reply({type: "logs", logs: [workerLog("late")], dropped: 0});
    expect(seen.statuses).toHaveLength(1);
    expect(seen.logs).toEqual([]);
  });

  it("resolves a draw with its own frame, not passing it to onFrame", async () => {
    const {layer, seen, worker} = makeLayer(false);
    layer.configure(CONFIG);
    await settle();
    worker(0).ready();
    const drawn = layer.draw(step(0));
    const bitmap = worker(0).frame(CONFIG.width, CONFIG.height);
    await expect(drawn).resolves.toBe(bitmap);
    expect(seen.frames).toEqual([]);
  });

  it.each([
    ["a new configuration", (layer: CanvasLayer) => layer.configure({...CONFIG, width: 16})],
    ["an error", (_: CanvasLayer, w: FakeWorker) => w.reply({type: "error", message: "oops", stack: "", line: null})],
    ["closing the layer", (layer: CanvasLayer) => layer.dispose()],
  ])("rejects a waiting draw on %s", async (_, interrupt: (layer: CanvasLayer, worker: FakeWorker) => void) => {
    const {layer, worker} = makeLayer(false);
    layer.configure(CONFIG);
    await settle();
    worker(0).ready();
    const drawn = layer.draw(step(0));
    interrupt(layer, worker(0));
    await expect(drawn).rejects.toThrow();
  });

  it("stops on a frame of the wrong size, closing it", async () => {
    const {layer, seen, worker} = makeLayer();
    layer.configure(CONFIG);
    await settle();
    worker(0).ready();
    layer.push(step(0));
    const bitmap = worker(0).frame(CONFIG.width + 1, CONFIG.height);
    expect(bitmap.closed).toBe(true);
    expect(worker(0).killed).toBe(true);
    expect(seen.statuses.at(-1)?.errors).toHaveLength(1);
    expect(seen.frames).toEqual([]);
  });

  it("closes the video frames of steps it won't draw", () => {
    const {layer} = makeLayer();
    const early = new FakeBitmap(1, 1);
    layer.push(step(0, [early]));
    expect(early.closed).toBe(true);

    layer.configure({...CONFIG, code: "function draw(ctx, {textures}) {}", textures: ["clip.mp4"]});
    expect(layer.needsVideoFrames).toBe(true);
    const waiting = new FakeBitmap(1, 1);
    layer.push(step(0, [waiting]));
    expect(waiting.closed).toBe(false);
    layer.restart();
    expect(waiting.closed).toBe(true);
  });

  it("says it's busy starting while the code's first run takes a while, then that it's done", async () => {
    const {layer, seen, worker} = makeLayer();
    layer.configure(CONFIG);
    await settle();
    vi.advanceTimersByTime(LONG_MS);
    expect(seen.busy).toEqual(["starting"]);
    worker(0).ready();
    expect(seen.busy).toEqual(["starting", null]);
  });

  it("kills both workers and the host when closed", async () => {
    const {layer, host, worker} = await drawnLayer();
    layer.dispose();
    expect([worker(0).killed, worker(1).killed, host.disposed]).toEqual([true, true, true]);
  });

  it("says a top-level return stopped the code before draw, on loading", async () => {
    const {layer, seen, worker} = makeLayer();
    layer.configure(CONFIG);
    await settle();
    worker(0).reply({type: "ready", registered: false, hasDraw: false, stoppedEarly: true});
    expect(seen.statuses).toHaveLength(1);
    expect(seen.statuses[0]?.loading).toBe(true);
    expect(seen.statuses[0]?.errors.map(error => error.message)).toEqual([expect.stringMatching(/return outside/)]);
    expect(worker(0).killed).toBe(true);
  });
});
