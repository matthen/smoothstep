// Runs an animation's Canvas2D layer for the app, the players and the exporter: starts its worker in
// the sandbox, sends it the steps to draw, and hands back the frames. A run that has drawn can't be
// rewound, so restarting starts a new worker; one is kept waiting so that's quick.
import { uses } from '../lib/glslCode';
import { isVideoURL } from '../lib/media';
import type { LineError } from '../lib/types';
import type { LayerAssets } from './assets';
import type { FontData } from './fonts';
import { parseImports } from './libraries';
import type { FromWorker, LayerInputs, ToWorker } from './runtime';
import { Sandbox, type SandboxWorker } from './sandbox';
import {
  errorFromEvent, errorFromStack, logsFromWorker, workerSource, type LayerLog, type WorkerSource,
} from './workerSource';

export type { LayerInputs, LayerLog };

export interface LayerConfig {
  code: string;
  // The frame's size in pixels.
  width: number;
  height: number;
  duration: number;
  // Each texture slot's image or video URL, or null for an empty slot. A video's frames come with
  // each step's inputs.
  textures: readonly (string | null)[];
}

export interface LayerCallbacks {
  // A new frame, to draw with. Whoever takes it closes it.
  onFrame(bitmap: ImageBitmap): void;
  // The layer's errors, on lines of its code; none once a run draws its first frame.
  // `loading` says the code didn't get through loading and its top-level run, as for a syntax error.
  onStatus(errors: LineError[], loading?: boolean): void;
  // The step the layer has been drawing for a while, "starting" while its code's first run takes a
  // while, or null once it's done.
  onBusy?(frame: number | "starting" | null): void;
  // The code's console calls, in order, and how many more there were than the worker kept. Without
  // it, they go to the browser's console.
  onLog?(logs: LayerLog[], dropped: number): void;
  // A run that had drawn is replaced by one starting again from setup, other than for a build.
  onRestart?(): void;
}

// How long a step takes before the layer says it's still drawing it.
const BUSY_MS = 1_000;
// Steps waiting to be drawn before whoever is pushing them should wait.
const MAX_WAITING = 12;

const NO_DRAW = "The Canvas2D code needs a draw function, which draws on the canvas each step.";
const WRONG_SIZE = "The Canvas2D frame wasn't the animation's size, so it was stopped. Build to run it again.";

// What every run of one configuration shares.
interface Prepared {
  source: WorkerSource;
  fonts: FontData[];
  textures: (ImageBitmap | null)[];
}

interface Run {
  worker: SandboxWorker;
  ready: boolean;
  // The batch of steps the worker is drawing, and whether it has been sent any.
  inFlight: number | null;
  stepped: boolean;
  drawn: boolean;
  // The step it's drawing now.
  drawing: number;
  // When it started, by performance.now().
  started: number;
  // A spare's console calls, from code outside setup and draw, held until it's used.
  heldLogs: LayerLog[];
  heldDropped: number;
}

// The most a spare holds before it only counts them.
const MAX_HELD_LOGS = 200;

async function loadBitmap(url: string): Promise<ImageBitmap | null> {
  try {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.src = url;
    await image.decode();
    return await createImageBitmap(image);
  } catch {
    return null;
  }
}

export class CanvasLayer {
  private sandbox = new Sandbox();
  private config: LayerConfig | null = null;
  private prepared: Prepared | null = null;
  // Bumped by each configure, so work for an older one is dropped when it finishes.
  private generation = 0;
  private current: Run | null = null;
  private standby: Run | null = null;
  private waiting: LayerInputs[] = [];
  // Whether the code reads textures and one is a video, so each step needs the video's frame.
  private videos = false;
  // After an error, nothing runs until the next configure.
  private stopped = false;
  private errors: LineError[] = [];
  private nextBatch = 1;
  private bitmaps = new Map<string, Promise<ImageBitmap | null>>();
  private pendingDraw: {resolve(bitmap: ImageBitmap): void; reject(error: Error): void} | null = null;
  private disposed = false;
  private busyTimer: number | undefined;
  private busyShown = false;

  constructor(
    private assets: LayerAssets, private callbacks: LayerCallbacks,
    // A spare worker makes restarts quick; an export restarts only once, so it goes without.
    private keepStandby = true,
  ) {}

  // Sets what to run. A new configuration starts a fresh run, as does `force` when nothing changed.
  // Returns whether it did.
  configure(config: LayerConfig, force = false): boolean {
    const old = this.config;
    const same = old !== null && old.code === config.code && old.width === config.width &&
      old.height === config.height && old.duration === config.duration &&
      old.textures.length === config.textures.length && old.textures.every((t, i) => t === config.textures[i]);
    if ((same && !force) || this.disposed) {
      return false;
    }
    this.config = config;
    const generation = ++this.generation;
    // A build (`force`) says so itself; a new size or texture starts the code again.
    if (!force && this.current?.stepped) {
      this.callbacks.onRestart?.();
    }
    this.stopRuns();
    this.stopped = false;
    this.prepared = null;
    this.dropWaiting();
    this.videos = config.textures.some(isVideoURL) && uses(config.code, /\btextures\b/);
    void this.prepare(config).then(prepared => {
      if (generation !== this.generation || this.disposed) {
        return;
      }
      if ("errors" in prepared) {
        this.fail(prepared.errors, true);
        return;
      }
      this.prepared = prepared;
      this.use(this.spawn(prepared));
    });
    return true;
  }

  // Makes `run` the one that draws, and watches how long it takes to start.
  private use(run: Run) {
    this.current = run;
    if (run.heldLogs.length > 0 || run.heldDropped > 0) {
      this.log(run.heldLogs, run.heldDropped);
      run.heldLogs = [];
      run.heldDropped = 0;
    }
    if (!this.busyShown) {
      this.watchBusy();
    }
    this.flush();
  }

  private async prepare(config: LayerConfig): Promise<Prepared | {errors: LineError[]}> {
    const imports = parseImports(config.code);
    if (imports.errors.length > 0) {
      return {errors: imports.errors};
    }
    try {
      const [libraries, fonts, textures] = await Promise.all([
        Promise.all(imports.libraries.map(async name => ({name, code: await this.assets.library(name)}))),
        this.assets.fonts(),
        // Decoding images takes a while, so only for code that uses them.
        Promise.all(config.textures.map(url =>
          url !== null && !isVideoURL(url) && uses(config.code, /\btextures\b/) ? this.bitmap(url) : Promise.resolve(null))),
      ]);
      return {source: workerSource(imports.code, libraries), fonts, textures};
    } catch (error) {
      console.error(error);
      return {errors: [{line: 0, message: "Couldn't load what the Canvas2D code needs. Check your connection and build again."}]};
    }
  }

  private bitmap(url: string): Promise<ImageBitmap | null> {
    let bitmap = this.bitmaps.get(url);
    if (!bitmap) {
      bitmap = loadBitmap(url);
      this.bitmaps.set(url, bitmap);
    }
    return bitmap;
  }

  private spawn(prepared: Prepared): Run {
    const config = this.config!;
    const run: Run = {
      worker: this.sandbox.spawn(prepared.source.source, error => {
        if (run === this.current) {
          this.fail([errorFromEvent(error, prepared.source)], !run.ready);
        } else {
          this.discardStandby();
        }
      }),
      ready: false, inFlight: null, stepped: false, drawn: false, drawing: 0, started: performance.now(),
      heldLogs: [], heldDropped: 0,
    };
    run.worker.port.onmessage = (event: MessageEvent<FromWorker>) => this.receive(run, prepared, event.data);
    // Each worker gets its own copies of the fonts and images.
    run.worker.port.postMessage({
      type: "init", width: config.width, height: config.height, duration: config.duration,
      fonts: prepared.fonts, textures: prepared.textures,
    } satisfies ToWorker);
    return run;
  }

  // Slow code just plays slowly, and is stopped by the next build or restart. After a while starting
  // or drawing one batch, it says so.
  private watchBusy() {
    window.clearTimeout(this.busyTimer);
    this.busyTimer = window.setTimeout(() => {
      const run = this.current;
      if (run && (!run.ready || run.inFlight !== null)) {
        this.busyShown = true;
        this.callbacks.onBusy?.(run.ready ? run.drawing : "starting");
      }
    }, BUSY_MS);
  }

  // Whether the run's code has been running for a while without finishing its first run.
  private slowToStart(run: Run): boolean {
    return !run.ready && performance.now() - run.started >= BUSY_MS;
  }

  private notBusy() {
    window.clearTimeout(this.busyTimer);
    if (this.busyShown) {
      this.busyShown = false;
      this.callbacks.onBusy?.(null);
    }
  }

  // The worker runs the user's code, so nothing it sends is taken on trust.
  private receive(run: Run, prepared: Prepared, message: Partial<FromWorker> | null) {
    if (run !== this.current && run !== this.standby) {
      return;
    }
    if (message?.type === "logs") {
      const {logs, dropped} = logsFromWorker(message, prepared.source);
      if (run === this.current) {
        this.log(logs, dropped);
      } else {
        const room = Math.max(0, MAX_HELD_LOGS - run.heldLogs.length);
        run.heldLogs.push(...logs.slice(0, room));
        run.heldDropped += dropped + Math.max(0, logs.length - room);
      }
    } else if (message?.type === "ready") {
      run.ready = true;
      if (run === this.current) {
        if (message.registered === true && message.hasDraw !== true) {
          // Under the last line, where the editor's fix puts one.
          const lastLine = (this.config?.code ?? "").split("\n").length - 1;
          this.fail([{line: lastLine, message: NO_DRAW, missing: "draw"}], true);
          return;
        }
        if (message.registered !== true) {
          return;  // Its code stopped with an error, which arrives on its own.
        }
        this.notBusy();
        this.flush();
      } else if (message.registered !== true || message.hasDraw !== true) {
        this.discardStandby();
      }
    } else if (message?.type === "drawing" && run === this.current && typeof message.frame === "number" && Number.isInteger(message.frame)) {
      run.drawing = message.frame;
      if (this.busyShown) {
        this.callbacks.onBusy?.(message.frame);
      }
    } else if (message?.type === "frame" && run === this.current && message.id === run.inFlight &&
        message.bitmap instanceof ImageBitmap) {
      const config = this.config!;
      if (message.bitmap.width !== config.width || message.bitmap.height !== config.height) {
        message.bitmap.close();
        this.fail([{line: 0, message: WRONG_SIZE}]);
        return;
      }
      run.inFlight = null;
      if (this.waiting.length === 0) {
        this.notBusy();
      }
      if (!run.drawn) {
        run.drawn = true;
        this.callbacks.onStatus([]);
        if (this.keepStandby && !this.standby) {
          this.standby = this.spawn(prepared);
        }
      }
      const pending = this.pendingDraw;
      this.pendingDraw = null;
      if (pending) {
        pending.resolve(message.bitmap);
      } else {
        this.callbacks.onFrame(message.bitmap);
      }
      this.flush();
    } else if (message?.type === "error") {
      if (run === this.current) {
        this.fail([errorFromStack({
          message: typeof message.message === "string" ? message.message.slice(0, 500) : "",
          stack: typeof message.stack === "string" ? message.stack.slice(0, 5000) : "",
          line: typeof message.line === "number" ? message.line : null,
        }, prepared.source)], !run.ready);
      } else {
        this.discardStandby();
      }
    }
  }

  private log(logs: LayerLog[], dropped: number) {
    if (this.callbacks.onLog) {
      this.callbacks.onLog(logs, dropped);
      return;
    }
    for (const log of logs) {
      console[log.level]("Canvas2D.js" + (log.line === null ? "" : `:${log.line + 1}`) + ":", log.text +
        (log.count > 1 ? ` (×${log.count})` : ""));
    }
  }

  private stopRun(run: Run | null) {
    if (run === this.current) {
      this.notBusy();
    }
    run?.worker.kill();
  }

  private stopRuns() {
    this.stopRun(this.current);
    this.stopRun(this.standby);
    this.current = null;
    this.standby = null;
  }

  // A spare that fails isn't replaced: the next restart starts a worker of its own.
  private discardStandby() {
    this.stopRun(this.standby);
    this.standby = null;
  }

  private fail(errors: LineError[], loading = false) {
    this.stopRuns();
    this.stopped = true;
    this.errors = errors;
    this.dropWaiting();
    this.callbacks.onStatus(errors, loading);
    const pending = this.pendingDraw;
    this.pendingDraw = null;
    pending?.reject(this.error());
  }

  private error(): Error {
    return new Error(this.errors[0]?.message ?? "The Canvas2D code has an error.");
  }

  // Starts again from setup and frame 0. A run that hasn't been sent steps is already there, unless
  // its code is slow to start, which may never end, so it's replaced.
  restart() {
    this.dropWaiting();
    const run = this.current;
    if (this.stopped || !this.prepared || !run || (!run.stepped && !this.slowToStart(run))) {
      return;
    }
    this.stopRun(run);
    if (run.stepped) {
      this.callbacks.onRestart?.();
    }
    const next = this.standby ?? this.spawn(this.prepared);
    this.standby = null;
    this.use(next);
  }

  // Steps that won't be drawn, with their video frames closed.
  private dropWaiting() {
    for (const step of this.waiting) {
      step.videoFrames?.forEach(frame => frame.bitmap.close());
    }
    this.waiting = [];
  }

  // Whether each step pushed needs its video textures' frames, in `videoFrames`.
  get needsVideoFrames(): boolean {
    return this.videos && !this.stopped;
  }

  // Whether to hold off pushing more steps, because the worker has fallen behind.
  get busy(): boolean {
    return !this.stopped && this.waiting.length >= MAX_WAITING;
  }

  // Queues a step to draw. Steps are drawn in order, and onFrame gets the latest frame.
  push(inputs: LayerInputs) {
    if (this.stopped || !this.config) {
      inputs.videoFrames?.forEach(frame => frame.bitmap.close());
      return;
    }
    this.waiting.push(inputs);
    this.flush();
  }

  private flush() {
    const run = this.current;
    if (!run?.ready || run.inFlight !== null || this.waiting.length === 0) {
      return;
    }
    const id = this.nextBatch++;
    run.inFlight = id;
    run.drawing = this.waiting[0]!.frame;
    const frames = this.waiting.flatMap(step => (step.videoFrames ?? []).map(frame => frame.bitmap));
    run.worker.port.postMessage({type: "steps", id, steps: this.waiting} satisfies ToWorker, frames);
    this.waiting = [];
    run.stepped = true;
    if (!this.busyShown) {
      this.watchBusy();
    }
  }

  // Draws one step and resolves with exactly its frame, for exports. One at a time.
  draw(inputs: LayerInputs): Promise<ImageBitmap> {
    return new Promise((resolve, reject) => {
      if (this.stopped) {
        inputs.videoFrames?.forEach(frame => frame.bitmap.close());
        reject(this.error());
        return;
      }
      this.pendingDraw = {resolve, reject};
      this.push(inputs);
    });
  }

  dispose() {
    this.disposed = true;
    this.dropWaiting();
    this.stopRuns();
    const pending = this.pendingDraw;
    this.pendingDraw = null;
    pending?.reject(new Error("The Canvas2D layer was closed."));
    this.sandbox.dispose();
    for (const bitmap of this.bitmaps.values()) {
      void bitmap.then(b => b?.close());
    }
    this.bitmaps.clear();
  }
}
