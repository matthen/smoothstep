// Runs an animation's Canvas2D layer for the app, the players and the exporter: starts its worker in
// the sandbox, sends it the steps to draw, and hands back the frames. A run that has drawn can't be
// rewound, so restarting starts a new worker; one is kept waiting so that's quick.
import { uses } from '../lib/glslCode';
import { isVideoURL } from '../lib/media';
import type { LineError } from '../lib/types';
import type { LayerAssets } from './assets';
import { BUSY_MS, BusyWatch, type Busy } from './busyWatch';
import type { LayerWorker, WorkerHost } from './host';
import { checkFromWorker, readyOutcome } from './messages';
import { prepare, type Prepared } from './prepare';
import type { FromWorker, LayerInputs } from './runtime';
import { Sandbox } from './sandbox';
import { StepQueue } from './stepQueue';
import { loadBitmap, TextureBitmaps, type BitmapLoader } from './textureBitmaps';
import { errorFromEvent, errorFromStack, logsFromWorker, type LayerLog } from './workerSource';

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
  onBusy?(frame: Busy): void;
  // The code's console calls, in order, and how many more there were than the worker kept. Without
  // it, they go to the browser's console.
  onLog?(logs: LayerLog[], dropped: number): void;
  // A run that had drawn is replaced by one starting again from setup, other than for a build.
  onRestart?(): void;
}

const NO_DRAW = "The Canvas2D code needs a draw function, which draws on the canvas each step.";
const STOPPED_EARLY = "A return outside any function stopped the Canvas2D code before its end, so its draw " +
  "function was never found. Move the return into a function or take it out.";
const WRONG_SIZE = "The Canvas2D frame wasn't the animation's size, so it was stopped. Build to run it again.";

type Received<K extends FromWorker["type"]> = Extract<FromWorker, {type: K}>;

// A run's code is running for the first time, then it waits for steps or draws a batch of them. One
// whose code threw waits for that error, and draws nothing.
type RunPhase =
  | {kind: "starting"}
  | {kind: "idle"}
  | {kind: "drawing"; batch: number}
  | {kind: "threw"};

interface Run {
  worker: LayerWorker;
  phase: RunPhase;
  // Whether it has been sent any steps, and has sent back a frame.
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

// The layer has no code yet, loads what a configuration needs (a newer configure replaces the phase,
// so older work is dropped), runs it with a spare, stops on an error until the next configure, or is closed.
type LayerPhase =
  | {kind: "unconfigured"}
  | {kind: "preparing"}
  | {kind: "running"; prepared: Prepared; current: Run; standby: Run | null}
  | {kind: "stopped"; errors: LineError[]}
  | {kind: "disposed"};

// The most a spare holds before it only counts them.
const MAX_HELD_LOGS = 200;

function sameConfig(a: LayerConfig | null, b: LayerConfig): boolean {
  return a !== null && a.code === b.code && a.width === b.width && a.height === b.height &&
    a.duration === b.duration && a.textures.length === b.textures.length && a.textures.every((t, i) => t === b.textures[i]);
}

export class CanvasLayer {
  private config: LayerConfig | null = null;
  private phase: LayerPhase = {kind: "unconfigured"};
  private waiting = new StepQueue();
  // Whether the code reads textures and one is a video, so each step needs the video's frame.
  private videos = false;
  private bitmaps: TextureBitmaps;
  // A draw's promise, and the batch its step went in once it's sent.
  private pendingDraw: {resolve(bitmap: ImageBitmap): void; reject(error: Error): void; batch?: number} | null = null;
  private busyWatch: BusyWatch;

  constructor(
    private assets: LayerAssets, private callbacks: LayerCallbacks,
    // A spare worker makes restarts quick; an export restarts only once, so it goes without.
    private keepStandby = true,
    private host: WorkerHost = new Sandbox(),
    loader: BitmapLoader = loadBitmap,
  ) {
    this.bitmaps = new TextureBitmaps(loader);
    // Slow code just plays slowly, and is stopped by the next build or restart.
    this.busyWatch = new BusyWatch(busy => callbacks.onBusy?.(busy), () => {
      const run = this.current;
      return run?.phase.kind === "drawing" ? run.drawing : run?.phase.kind === "starting" ? "starting" : null;
    });
  }

  private get current(): Run | null {
    return this.phase.kind === "running" ? this.phase.current : null;
  }

  private get standby(): Run | null {
    return this.phase.kind === "running" ? this.phase.standby : null;
  }

  // Whether steps pushed now will be drawn.
  private get accepting(): boolean {
    return this.phase.kind === "preparing" || this.phase.kind === "running";
  }

  // Sets what to run. A new configuration starts a fresh run, as does `force` when nothing changed.
  // Returns whether it did.
  configure(config: LayerConfig, force = false): boolean {
    if ((sameConfig(this.config, config) && !force) || this.phase.kind === "disposed") {
      return false;
    }
    this.config = config;
    this.bitmaps.keepOnly(config.textures);
    // A build (`force`) says so itself; a new size or texture starts the code again.
    if (!force && this.current?.stepped) {
      this.callbacks.onRestart?.();
    }
    this.stopRuns();
    const preparing: LayerPhase = {kind: "preparing"};
    this.phase = preparing;
    this.waiting.drop();
    this.rejectPending(new Error("The Canvas2D layer was restarted."));
    this.videos = config.textures.some(isVideoURL) && uses(config.code, /\btextures\b/);
    void prepare(config, this.assets, this.bitmaps).then(prepared => {
      if (this.phase !== preparing) {
        return;
      }
      if ("errors" in prepared) {
        this.fail(prepared.errors, true);
        return;
      }
      if (prepared.warnings.length > 0) {
        this.log(prepared.warnings, 0);
      }
      this.use(prepared, this.spawn(prepared));
    });
    return true;
  }

  // Makes `run` the one that draws, and watches how long it takes to start.
  private use(prepared: Prepared, run: Run) {
    this.phase = {kind: "running", prepared, current: run, standby: null};
    if (run.heldLogs.length > 0 || run.heldDropped > 0) {
      this.log(run.heldLogs, run.heldDropped);
      run.heldLogs = [];
      run.heldDropped = 0;
    }
    this.busyWatch.arm();
    this.flush();
  }

  private spawn(prepared: Prepared): Run {
    const config = this.config!;
    const run: Run = {
      worker: this.host.spawn(prepared.source.source, error => {
        if (run === this.current) {
          this.fail([errorFromEvent(error, prepared.source)], !this.loaded(run));
        } else {
          this.discardStandby();
        }
      }),
      phase: {kind: "starting"}, stepped: false, drawn: false, drawing: 0, started: performance.now(),
      heldLogs: [], heldDropped: 0,
    };
    run.worker.onMessage = data => this.receive(run, prepared, data);
    // Each worker gets its own copies of the fonts and images.
    run.worker.post({
      type: "init", width: config.width, height: config.height, duration: config.duration,
      fonts: prepared.fonts, textures: prepared.textures,
    });
    return run;
  }

  // Whether the run's code got through its first run.
  private loaded(run: Run): boolean {
    return run.phase.kind === "idle" || run.phase.kind === "drawing";
  }

  // Whether the run's code has been running for a while without finishing its first run.
  private slowToStart(run: Run): boolean {
    return run.phase.kind === "starting" && performance.now() - run.started >= BUSY_MS;
  }

  private receive(run: Run, prepared: Prepared, data: unknown) {
    const message = checkFromWorker(data);
    const live = run === this.current || run === this.standby;
    if (message?.type === "frame") {
      // A frame from a stale batch, or a run that's gone, is closed, as nothing else will.
      if (run === this.current && run.phase.kind === "drawing" && message.id === run.phase.batch) {
        this.receiveFrame(run, prepared, message.bitmap, message.id);
      } else {
        message.bitmap.close();
      }
    } else if (!live) {
      return;
    } else if (message?.type === "logs") {
      this.receiveLogs(run, prepared, message);
    } else if (message?.type === "ready" && run.phase.kind === "starting") {
      this.receiveReady(run, message);
    } else if (message?.type === "drawing" && run === this.current) {
      run.drawing = message.frame;
      this.busyWatch.update(message.frame);
    } else if (message?.type === "error") {
      this.receiveError(run, prepared, message);
    }
  }

  // The current run's console calls are passed on; a standby's are held until it takes over.
  private receiveLogs(run: Run, prepared: Prepared, message: Received<"logs">) {
    const logs = logsFromWorker(message.logs, prepared.source);
    if (run === this.current) {
      this.log(logs, message.dropped);
    } else {
      const room = Math.max(0, MAX_HELD_LOGS - run.heldLogs.length);
      run.heldLogs.push(...logs.slice(0, room));
      run.heldDropped += message.dropped + Math.max(0, logs.length - room);
    }
  }

  // The run's code has finished its first run: drawing can start, or a standby without a draw is dropped.
  private receiveReady(run: Run, message: Received<"ready">) {
    const outcome = readyOutcome(message);
    if (run !== this.current) {
      if (outcome === "draws") {
        run.phase = {kind: "idle"};
      } else {
        this.discardStandby();
      }
      return;
    }
    // Under the last line, where the editor's fix for a missing draw puts one.
    const lastLine = (this.config?.code ?? "").split("\n").length - 1;
    if (outcome === "no draw") {
      this.fail([{line: lastLine, message: NO_DRAW, missing: "draw"}], true);
    } else if (outcome === "stopped early") {
      this.fail([{line: lastLine, message: STOPPED_EARLY}], true);
    } else if (outcome === "threw") {
      run.phase = {kind: "threw"};
    } else {
      run.phase = {kind: "idle"};
      this.busyWatch.clear();
      this.flush();
    }
  }

  // The frame the current run was asked for.
  private receiveFrame(run: Run, prepared: Prepared, bitmap: ImageBitmap, batch: number) {
    const config = this.config!;
    if (bitmap.width !== config.width || bitmap.height !== config.height) {
      bitmap.close();
      this.fail([{line: 0, message: WRONG_SIZE}]);
      return;
    }
    run.phase = {kind: "idle"};
    if (this.waiting.empty) {
      this.busyWatch.clear();
    }
    if (!run.drawn) {
      run.drawn = true;
      this.callbacks.onStatus([]);
      if (this.keepStandby && this.phase.kind === "running" && !this.phase.standby) {
        this.phase.standby = this.spawn(prepared);
      }
    }
    const pending = this.pendingDraw;
    if (pending?.batch === batch) {
      this.pendingDraw = null;
      pending.resolve(bitmap);
    } else {
      this.callbacks.onFrame(bitmap);
    }
    this.flush();
  }

  private receiveError(run: Run, prepared: Prepared, message: Received<"error">) {
    if (run === this.current) {
      this.fail([errorFromStack(message, prepared.source)], !this.loaded(run));
    } else {
      this.discardStandby();
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
      this.busyWatch.clear();
    }
    run?.worker.kill();
  }

  // Stops both workers; the caller moves the layer on to its next phase.
  private stopRuns() {
    this.stopRun(this.current);
    this.stopRun(this.standby);
  }

  // A spare that fails isn't replaced: the next restart starts a worker of its own.
  private discardStandby() {
    if (this.phase.kind === "running") {
      this.stopRun(this.phase.standby);
      this.phase.standby = null;
    }
  }

  private fail(errors: LineError[], loading = false) {
    this.stopRuns();
    this.phase = {kind: "stopped", errors};
    this.waiting.drop();
    this.callbacks.onStatus(errors, loading);
    this.rejectPending(this.error());
  }

  private rejectPending(error: Error) {
    const pending = this.pendingDraw;
    this.pendingDraw = null;
    pending?.reject(error);
  }

  private error(): Error {
    const errors = this.phase.kind === "stopped" ? this.phase.errors : [];
    return new Error(errors[0]?.message ?? "The Canvas2D code has an error.");
  }

  // Starts again from setup and frame 0. A run that hasn't been sent steps is already there, unless
  // its code is slow to start, which may never end, so it's replaced.
  restart() {
    this.waiting.drop();
    this.rejectPending(new Error("The Canvas2D layer was restarted."));
    const phase = this.phase;
    if (phase.kind !== "running" || (!phase.current.stepped && !this.slowToStart(phase.current))) {
      return;
    }
    const run = phase.current;
    this.stopRun(run);
    if (run.stepped) {
      this.callbacks.onRestart?.();
    }
    this.use(phase.prepared, phase.standby ?? this.spawn(phase.prepared));
  }

  // Whether each step pushed needs its video textures' frames, in `videoFrames`.
  get needsVideoFrames(): boolean {
    return this.videos && this.accepting;
  }

  // Whether to hold off pushing more steps, because the worker has fallen behind.
  get busy(): boolean {
    return this.accepting && this.waiting.full;
  }

  // Queues a step to draw. Steps are drawn in order, and onFrame gets the latest frame.
  push(inputs: LayerInputs) {
    this.waiting.push(inputs, this.accepting);
    this.flush();
  }

  private flush() {
    const run = this.current;
    const batch = run?.phase.kind === "idle" ? this.waiting.take() : null;
    if (!run || !batch) {
      return;
    }
    run.phase = {kind: "drawing", batch: batch.id};
    run.drawing = batch.steps[0]!.frame;
    run.worker.post({type: "steps", id: batch.id, steps: batch.steps}, batch.transfer);
    run.stepped = true;
    if (this.pendingDraw && this.pendingDraw.batch === undefined) {
      this.pendingDraw.batch = batch.id;
    }
    this.busyWatch.arm();
  }

  // Draws one step and resolves with exactly its frame, for exports. One at a time: another draw
  // before this one's frame arrives rejects it.
  draw(inputs: LayerInputs): Promise<ImageBitmap> {
    return new Promise((resolve, reject) => {
      if (!this.accepting) {
        inputs.videoFrames?.forEach(frame => frame.bitmap.close());
        reject(this.phase.kind === "stopped" ? this.error() : new Error("The Canvas2D layer was closed."));
        return;
      }
      this.rejectPending(new Error("Another Canvas2D frame was asked for before this one was drawn."));
      this.pendingDraw = {resolve, reject};
      this.push(inputs);
    });
  }

  dispose() {
    this.waiting.drop();
    this.stopRuns();
    this.phase = {kind: "disposed"};
    this.rejectPending(new Error("The Canvas2D layer was closed."));
    this.host.dispose();
    this.bitmaps.dispose();
  }
}
