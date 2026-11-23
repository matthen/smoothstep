// Runs an animation's Canvas2D layer for the app, the players and the exporter: starts its worker in
// the sandbox, sends it the steps to draw, and hands back the frames. A run that has drawn can't be
// rewound, so restarting starts a new worker; one is kept waiting so that's quick.
import { uses } from '../lib/glslCode';
import type { LineError } from '../lib/types';
import type { LayerAssets } from './assets';
import type { FontData } from './fonts';
import { parseImports } from './libraries';
import type { FromWorker, LayerInputs, ToWorker } from './runtime';
import { Sandbox, type SandboxWorker } from './sandbox';
import { errorFromEvent, errorFromStack, workerSource, type WorkerSource } from './workerSource';

export type { LayerInputs };

export interface LayerConfig {
  code: string;
  // The frame's size in pixels.
  width: number;
  height: number;
  duration: number;
  // Each texture slot's image URL, or null for an empty slot.
  textures: readonly (string | null)[];
}

export interface LayerCallbacks {
  // A new frame, to draw with. Whoever takes it closes it.
  onFrame(bitmap: ImageBitmap): void;
  // The layer's errors, on lines of its code; none once a run draws its first frame.
  onStatus(errors: LineError[]): void;
}

// How long a worker may take to start and run setup, and to draw a batch of steps.
const START_TIMEOUT_MS = 10_000;
const STEP_TIMEOUT_MS = 1_000;
// Steps waiting to be drawn before whoever is pushing them should wait.
const MAX_WAITING = 12;

export const TOO_SLOW = "The Canvas2D code took too long, so it was stopped. Build to run it again.";
const NO_DRAW = "The Canvas2D code needs a draw function, which draws on the canvas each step.";

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
  timer: number | undefined;
}

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
  // After an error or a timeout, nothing runs until the next configure.
  private stopped = false;
  private errors: LineError[] = [];
  private nextBatch = 1;
  private bitmaps = new Map<string, Promise<ImageBitmap | null>>();
  private pendingDraw: {resolve(bitmap: ImageBitmap): void; reject(error: Error): void} | null = null;
  private disposed = false;

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
    this.stopRuns();
    this.stopped = false;
    this.prepared = null;
    this.waiting = [];
    void this.prepare(config).then(prepared => {
      if (generation !== this.generation || this.disposed) {
        return;
      }
      if ("errors" in prepared) {
        this.fail(prepared.errors);
        return;
      }
      this.prepared = prepared;
      this.current = this.spawn(prepared);
      this.flush();
    });
    return true;
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
          url !== null && uses(config.code, /\btextures\b/) ? this.bitmap(url) : Promise.resolve(null))),
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
          this.fail([errorFromEvent(error, prepared.source)]);
        } else {
          this.discardStandby();
        }
      }),
      ready: false, inFlight: null, stepped: false, drawn: false, timer: undefined,
    };
    run.worker.port.onmessage = (event: MessageEvent<FromWorker>) => this.receive(run, prepared, event.data);
    // Each worker gets its own copies of the fonts and images.
    run.worker.port.postMessage({
      type: "init", width: config.width, height: config.height, duration: config.duration,
      fonts: prepared.fonts, textures: prepared.textures,
    } satisfies ToWorker);
    this.watch(run, START_TIMEOUT_MS);
    return run;
  }

  // Stops the run if it doesn't answer in time: its code may be in a loop that never ends.
  private watch(run: Run, ms: number) {
    window.clearTimeout(run.timer);
    run.timer = window.setTimeout(() => {
      if (document.hidden) {
        // A hidden page's timers and messages run late, so this proves nothing; look again later.
        this.watch(run, ms);
      } else if (run === this.current) {
        this.fail([{line: 0, message: TOO_SLOW}]);
      } else {
        this.discardStandby();
      }
    }, ms);
  }

  // The worker runs the user's code, so nothing it sends is taken on trust.
  private receive(run: Run, prepared: Prepared, message: Partial<FromWorker> | null) {
    if (run !== this.current && run !== this.standby) {
      return;
    }
    if (message?.type === "ready") {
      run.ready = true;
      window.clearTimeout(run.timer);
      if (run === this.current) {
        if (message.registered === true && message.hasDraw !== true) {
          // Under the last line, where the editor's fix puts one.
          const lastLine = (this.config?.code ?? "").split("\n").length - 1;
          this.fail([{line: lastLine, message: NO_DRAW, missing: "draw"}]);
          return;
        }
        if (message.registered !== true) {
          // Its code stopped with an error, which arrives on its own.
          this.watch(run, START_TIMEOUT_MS);
          return;
        }
        this.flush();
      } else if (message.registered !== true || message.hasDraw !== true) {
        this.discardStandby();
      }
    } else if (message?.type === "frame" && run === this.current && message.id === run.inFlight &&
        message.bitmap instanceof ImageBitmap) {
      window.clearTimeout(run.timer);
      run.inFlight = null;
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
        }, prepared.source)]);
      } else {
        this.discardStandby();
      }
    }
  }

  private stopRun(run: Run | null) {
    if (run) {
      window.clearTimeout(run.timer);
      run.worker.kill();
    }
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

  private fail(errors: LineError[]) {
    this.stopRuns();
    this.stopped = true;
    this.errors = errors;
    this.waiting = [];
    this.callbacks.onStatus(errors);
    const pending = this.pendingDraw;
    this.pendingDraw = null;
    pending?.reject(this.error());
  }

  private error(): Error {
    return new Error(this.errors[0]?.message ?? "The Canvas2D code has an error.");
  }

  // Starts again from setup and frame 0. A run that hasn't drawn yet is already there.
  restart() {
    this.waiting = [];
    if (this.stopped || !this.prepared || !this.current?.stepped) {
      return;
    }
    this.stopRun(this.current);
    this.current = this.standby ?? this.spawn(this.prepared);
    this.standby = null;
  }

  // Whether to hold off pushing more steps, because the worker has fallen behind.
  get busy(): boolean {
    return !this.stopped && this.waiting.length >= MAX_WAITING;
  }

  // Queues a step to draw. Steps are drawn in order, and onFrame gets the latest frame.
  push(inputs: LayerInputs) {
    if (this.stopped || !this.config) {
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
    run.worker.port.postMessage({type: "steps", id, steps: this.waiting} satisfies ToWorker);
    this.waiting = [];
    // The first batch also runs setup, which may work things out for a while.
    this.watch(run, run.stepped ? STEP_TIMEOUT_MS : START_TIMEOUT_MS);
    run.stepped = true;
  }

  // Draws one step and resolves with exactly its frame, for exports. One at a time.
  draw(inputs: LayerInputs): Promise<ImageBitmap> {
    return new Promise((resolve, reject) => {
      if (this.stopped) {
        reject(this.error());
        return;
      }
      this.pendingDraw = {resolve, reject};
      this.push(inputs);
    });
  }

  dispose() {
    this.disposed = true;
    this.stopRuns();
    this.sandbox.dispose();
    for (const bitmap of this.bitmaps.values()) {
      void bitmap.then(b => b?.close());
    }
    this.bitmaps.clear();
  }
}
