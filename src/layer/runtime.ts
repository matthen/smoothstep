// What runs in a Canvas2D layer's worker before the layer's own code: it takes messages from the
// app, calls setup and draw, and sends back each frame. The worker gets workerRuntime as source
// text, with its parts, so it must not use anything from outside its own body.
import type { FontData } from './fonts';
import type { HelperEnv, Helpers } from './helpers';
import type { WorkerParts } from './worker/parts';

// What the layer draws one step with.
export interface LayerInputs {
  time: number;
  frame: number;
  floats: readonly number[];
  // The frame each video texture shows at this step, which replaces the slot's last one.
  videoFrames?: {slot: number; bitmap: ImageBitmap}[];
}

export type ToWorker =
  | {type: "init"; width: number; height: number; duration: number; fonts: FontData[]; textures: (ImageBitmap | null)[]}
  | {type: "steps"; id: number; steps: LayerInputs[]};

// From the worker. Its code is the user's, so the app checks everything it sends.
export type FromWorker =
  // `stoppedEarly`: the code's top level ran without an error but returned before setting up draw.
  | {type: "ready"; registered: boolean; hasDraw: boolean; stoppedEarly: boolean}
  | {type: "drawing"; frame: number}
  | {type: "frame"; id: number; bitmap: ImageBitmap}
  | {type: "error"; message: string; stack: string; line: number | null}
  | {type: "logs"; logs: WorkerLog[]; dropped: number};

export type LogLevel = "log" | "info" | "warn" | "error";

// A console call from the layer's code, or several the same in a row.
export interface WorkerLog {
  level: LogLevel;
  text: string;
  // The step it was drawing and its time, or null before the first step.
  frame: number | null;
  time: number | null;
  // The lines of the worker's script in the call's stack, innermost first.
  lines: number[];
  count: number;
}

type UserSetup = (inputs: Record<string, unknown>) => unknown;
type UserDraw = (ctx: OffscreenCanvasRenderingContext2D, inputs: Record<string, unknown>) => void;

interface WorkerEvent {
  reason?: unknown;
}

interface WorkerScope {
  addEventListener(type: string, listener: (event: WorkerEvent) => void, options?: {capture: boolean}): void;
  fonts: {add(font: FontFace): void};
}

// The most console calls a worker holds between messages to the app; past it they're only counted.
export const MAX_WORKER_LOGS = 200;

export function workerRuntime(
  parts: WorkerParts, helpersFor: (env: HelperEnv) => Helpers, formatLog: (args: readonly unknown[]) => string,
  maxLogs: number,
) {
  const scope = self as unknown as WorkerScope;
  const global = self as unknown as Record<string, unknown>;
  // Drawing units: the canvas is always this many tall, so sizes look the same at any resolution.
  const UNITS_TALL = 1080;
  const env: HelperEnv = {scale: 1, width: UNITS_TALL, height: UNITS_TALL};
  const helpers = helpersFor(env);

  // Before any library or the layer's code runs, so neither can replace what the runtime calls.
  const natives = parts.lockdown(global);
  const {apply, postMessage, setOnMessage, dataOf, stopImmediately} = natives;
  const timers = parts.makeTimers({natives, now: natives.now});
  timers.install(global);
  const clock = parts.makeDeterministic();
  const {define, lib} = parts.makeModules();

  let registered = false;
  let ranToEnd = false;
  let userSetup: UserSetup | null = null;
  let userDraw: UserDraw | null = null;
  const start = (setup: unknown, draw: unknown) => {
    registered = true;
    userSetup = typeof setup === "function" ? setup as UserSetup : null;
    userDraw = typeof draw === "function" ? draw as UserDraw : null;
  };

  let port: MessagePort | null = null;
  const logger = parts.makeLogger({formatLog, maxLogs, setTimeout: natives.setTimeout, post: message => {
    if (port) {
      apply(postMessage, port, [message, []]);
    }
    return port !== null;
  }});
  parts.installConsole(global, logger.log, apply);
  const send = (message: FromWorker, transfer: Transferable[] = []) => {
    logger.flush();
    if (port) {
      apply(postMessage, port, [message, transfer]);
    }
  };
  let failed = false;
  const fail = (error: unknown) => {
    failed = true;
    const e = error as {message?: unknown; stack?: unknown; lineNumber?: unknown; line?: unknown} | null | undefined;
    const line = Number(e?.lineNumber ?? e?.line);
    send({
      type: "error", message: String(e?.message ?? error), stack: typeof e?.stack === "string" ? e.stack : "",
      line: Number.isFinite(line) ? line : null,
    });
  };

  let canvas: OffscreenCanvas | null = null;
  let ctx: OffscreenCanvasRenderingContext2D | null = null;
  let duration = 0;
  let resolution: [number, number] = [0, 0];
  let textures: (ImageBitmap | null)[] = [];
  let data: unknown = undefined;
  let setupDone = false;

  const init = async (message: Extract<ToWorker, {type: "init"}>) => {
    // Fonts go in before any of the layer's code draws, as a font is looked up once and remembered.
    await Promise.all(message.fonts.map(async font => {
      try {
        const face = new FontFace(font.family, font.data, {weight: font.weight, unicodeRange: font.unicodeRange});
        scope.fonts.add(face);
        await face.load();
      } catch {
        // Text falls back to another font.
      }
    }));
    canvas = new OffscreenCanvas(message.width, message.height);
    // The animation sets the size, and every frame must have it.
    for (const side of ["width", "height"] as const) {
      const value = canvas[side];
      Object.defineProperty(canvas, side, {get: () => value, set: () => {
        throw new Error(`The canvas's ${side} is set by the animation's size, so it can't be changed.`);
      }});
    }
    ctx = canvas.getContext("2d");
    env.scale = message.height / UNITS_TALL;
    env.height = UNITS_TALL;
    env.width = UNITS_TALL * message.width / message.height;
    duration = message.duration;
    resolution = [message.width, message.height];
    textures = message.textures;
    if (ctx) {
      ctx.font = "48px Inter, sans-serif";
      ctx.fillStyle = "white";
      ctx.strokeStyle = "white";
      ctx.lineWidth = 2;
    }
    send({type: "ready", registered, hasDraw: userDraw !== null && ctx !== null, stoppedEarly: ranToEnd && !registered});
  };

  const drawSteps = async (message: Extract<ToWorker, {type: "steps"}>) => {
    if (!ctx || !canvas || !userDraw) {
      return;
    }
    for (const step of message.steps) {
      send({type: "drawing", frame: step.frame});
      clock.setTime(step.time);
      logger.setStep(step.frame, step.time);
      for (const {slot, bitmap} of step.videoFrames ?? []) {
        // A video's last frame is closed, so a long video doesn't fill the memory.
        const old = textures[slot];
        if (old instanceof ImageBitmap) {
          old.close();
        }
        textures[slot] = bitmap;
      }
      const floats = [...step.floats];
      const size = {width: env.width, height: env.height, duration, resolution: [...resolution]};
      try {
        if (!setupDone) {
          setupDone = true;
          data = userSetup ? await userSetup({...size, floats, textures}) : undefined;
        }
        ctx.save();
        ctx.setTransform(env.scale, 0, 0, env.scale, 0, 0);
        try {
          userDraw(ctx, {time: step.time, frame: step.frame, ...size, floats, textures, data});
        } finally {
          ctx.restore();
        }
      } catch (error) {
        fail(error);
        return;
      }
    }
    // A copy, so the canvas keeps what's drawn on it for the next step.
    const bitmap = await createImageBitmap(canvas, {imageOrientation: "flipY", premultiplyAlpha: "premultiply"});
    send({type: "frame", id: message.id, bitmap}, [bitmap]);
  };

  const handle = async (message: ToWorker) => {
    if (message.type === "init") {
      await init(message);
    } else if (!failed && ctx && canvas && userDraw) {
      try {
        timers.wake();
        await drawSteps(message);
      } finally {
        timers.sleep();
      }
    }
  };

  // The layer's code and the libraries' definitions, which run once the port has arrived.
  let body: (() => void) | null = null;
  const run = (code: () => void) => {
    body = code;
  };

  // The port arrives before any of the layer's code runs, so that code never sees it, and listeners
  // it adds get no messages.
  let queue = Promise.resolve();
  scope.addEventListener("message", event => {
    apply(stopImmediately, event, []);
    const received = apply(dataOf, event, []) as {port?: MessagePort} | null;
    if (!port && received?.port) {
      port = received.port;
      apply(setOnMessage, port, [(e: MessageEvent) => {
        const message = apply(dataOf, e, []) as ToWorker;
        queue = queue.then(() => handle(message)).catch(fail);
      }]);
      const code = body;
      body = null;
      // An uncaught error goes to the app another way, which may not wait for the logs before it.
      try {
        code?.();
        ranToEnd = true;
      } finally {
        logger.flush();
      }
    }
  }, {capture: true});
  scope.addEventListener("unhandledrejection", event => fail(event.reason));

  return {helpers, define, lib, start, run};
}
