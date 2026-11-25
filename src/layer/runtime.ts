// What runs in a Canvas2D layer's worker before the layer's own code: it takes messages from the
// app, calls setup and draw, and sends back each frame. The worker gets workerRuntime as source
// text, so it must not use anything from outside its own body.
import type { FontData } from './fonts';
import type { HelperEnv, Helpers } from './helpers';

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
  | {type: "ready"; registered: boolean; hasDraw: boolean}
  | {type: "drawing"; frame: number}
  | {type: "frame"; id: number; bitmap: ImageBitmap}
  | {type: "error"; message: string; stack: string; line: number | null};

type UserSetup = (inputs: Record<string, unknown>) => unknown;
type UserDraw = (ctx: OffscreenCanvasRenderingContext2D, inputs: Record<string, unknown>) => void;
type ModuleFactory = (module: {exports: unknown}, exports: unknown) => void;

interface WorkerEvent {
  reason?: unknown;
}

interface WorkerScope {
  addEventListener(type: string, listener: (event: WorkerEvent) => void, options?: {capture: boolean}): void;
  fonts: {add(font: FontFace): void};
}

type Callback = (...args: unknown[]) => void;

export function workerRuntime(helpersFor: (env: HelperEnv) => Helpers) {
  const scope = self as unknown as WorkerScope;
  // Drawing units: the canvas is always this many tall, so sizes look the same at any resolution.
  const UNITS_TALL = 1080;
  const env: HelperEnv = {scale: 1, width: UNITS_TALL, height: UNITS_TALL};
  const helpers = helpersFor(env);

  // The layer's code can't start workers of its own, or loop on frames, messages or timers outside its steps.
  const global = self as unknown as Record<string, unknown>;
  const remove = (name: string, from: object = global) => {
    for (let o: object | null = from; o; o = Object.getPrototypeOf(o) as object | null) {
      Reflect.deleteProperty(o, name);
    }
  };
  ["Worker", "SharedWorker", "requestAnimationFrame", "cancelAnimationFrame", "MessageChannel",
    "BroadcastChannel", "scheduler", "TaskController"].forEach(name => remove(name));
  if (typeof AbortSignal !== "undefined") {
    remove("timeout", AbortSignal);
  }

  // What the runtime calls once the layer's code has run, kept here so that code can't replace it.
  const {apply, deleteProperty} = Reflect;
  const native = (prototype: object, name: string, part: "value" | "get" | "set") =>
    Object.getOwnPropertyDescriptor(prototype, name)![part] as (...args: never[]) => unknown;
  const postMessage = native(MessagePort.prototype, "postMessage", "value");
  const setOnMessage = native(MessagePort.prototype, "onmessage", "set");
  const dataOf = native(MessageEvent.prototype, "data", "get");
  const stopImmediately = native(Event.prototype, "stopImmediatePropagation", "value");

  // Timers run only while steps are being drawn, or soon after: a timer that comes due while the
  // animation is paused waits for the next step, so a loop of them doesn't keep the worker busy.
  // They're kept in objects with no prototype, so the layer's code can't patch how they're stored.
  const realNow = performance.now.bind(performance);
  const [nativeSetTimeout, nativeSetInterval, nativeClear] = [setTimeout, setInterval, clearTimeout];
  ["setTimeout", "setInterval", "clearTimeout", "clearInterval"].forEach(name => remove(name));
  const IDLE_MS = 1000;
  let lastActive = -Infinity;
  let drawing = false;
  let nextTimer = 1;
  const timers = Object.create(null) as Record<number, ReturnType<typeof setTimeout> | undefined>;
  const parked = Object.create(null) as Record<number, (() => void) | undefined>;
  const awake = () => drawing || realNow() - lastActive < IDLE_MS;
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
  global.setTimeout = (callback: unknown, ms?: number, ...args: unknown[]) => {
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
  global.setInterval = (callback: unknown, ms?: number, ...args: unknown[]) => {
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
  global.clearTimeout = clear;
  global.clearInterval = clear;
  // Runs the parked timers in turn, skipping any that an earlier one cleared.
  const wake = () => {
    drawing = true;
    for (const id in parked) {
      const resume = parked[id];
      if (resume) {
        deleteProperty(parked, id);
        resume();
      }
    }
  };

  // Math.random repeats from one run to the next, and clocks give the animation's time.
  let seed = 0x2F6E2B1;
  Math.random = () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  let stepTime = 0;
  Date.now = () => Math.round(stepTime * 1000);
  performance.now = () => stepTime * 1000;

  const factories: Record<string, ModuleFactory> = {};
  const modules: Record<string, unknown> = {};
  const define = (name: string, factory: ModuleFactory) => {
    factories[name] = factory;
  };
  // A library's exports; with `byDefault`, what `import name from` gives.
  const lib = (name: string, byDefault = false): unknown => {
    if (!(name in modules)) {
      const module = {exports: {} as unknown};
      factories[name]!(module, module.exports);
      modules[name] = module.exports;
    }
    const exported = modules[name] as {__esModule?: boolean; default?: unknown} | undefined;
    return byDefault && exported?.__esModule && "default" in exported ? exported.default : exported;
  };

  let registered = false;
  let userSetup: UserSetup | null = null;
  let userDraw: UserDraw | null = null;
  const start = (setup: unknown, draw: unknown) => {
    registered = true;
    userSetup = typeof setup === "function" ? setup as UserSetup : null;
    userDraw = typeof draw === "function" ? draw as UserDraw : null;
  };

  let port: MessagePort | null = null;
  let canvas: OffscreenCanvas | null = null;
  let ctx: OffscreenCanvasRenderingContext2D | null = null;
  let duration = 0;
  let resolution: [number, number] = [0, 0];
  let textures: (ImageBitmap | null)[] = [];
  let data: unknown = undefined;
  let setupDone = false;
  let failed = false;

  const send = (message: FromWorker, transfer: Transferable[] = []) => {
    if (port) {
      apply(postMessage, port, [message, transfer]);
    }
  };
  const fail = (error: unknown) => {
    failed = true;
    const e = error as {message?: unknown; stack?: unknown; lineNumber?: unknown; line?: unknown} | null | undefined;
    const line = Number(e?.lineNumber ?? e?.line);
    send({
      type: "error", message: String(e?.message ?? error), stack: typeof e?.stack === "string" ? e.stack : "",
      line: Number.isFinite(line) ? line : null,
    });
  };

  const handle = async (message: ToWorker) => {
    if (message.type === "init") {
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
      send({type: "ready", registered, hasDraw: userDraw !== null && ctx !== null});
      return;
    }
    if (failed || !ctx || !canvas || !userDraw) {
      return;
    }
    try {
      wake();
      await drawSteps(message);
    } finally {
      drawing = false;
      lastActive = realNow();
    }
  };

  const drawSteps = async (message: Extract<ToWorker, {type: "steps"}>) => {
    if (!ctx || !canvas || !userDraw) {
      return;
    }
    for (const step of message.steps) {
      send({type: "drawing", frame: step.frame});
      stepTime = step.time;
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
      code?.();
    }
  }, {capture: true});
  scope.addEventListener("unhandledrejection", event => fail(event.reason));

  return {helpers, define, lib, start, run};
}
