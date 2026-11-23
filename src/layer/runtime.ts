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
}

export type ToWorker =
  | {type: "init"; width: number; height: number; duration: number; fonts: FontData[]; textures: (ImageBitmap | null)[]}
  | {type: "steps"; id: number; steps: LayerInputs[]};

// From the worker. Its code is the user's, so the app checks everything it sends.
export type FromWorker =
  | {type: "ready"; registered: boolean; hasDraw: boolean}
  | {type: "frame"; id: number; bitmap: ImageBitmap}
  | {type: "error"; message: string; stack: string; line: number | null};

type UserSetup = (inputs: Record<string, unknown>) => unknown;
type UserDraw = (ctx: OffscreenCanvasRenderingContext2D, inputs: Record<string, unknown>) => void;
type ModuleFactory = (module: {exports: unknown}, exports: unknown) => void;

interface WorkerScope {
  addEventListener(type: string, listener: (event: {data?: {port?: MessagePort}; reason?: unknown}) => void): void;
  fonts: {add(font: FontFace): void};
}

export function workerRuntime(helpersFor: (env: HelperEnv) => Helpers) {
  const scope = self as unknown as WorkerScope;
  // Drawing units: the canvas is always this many tall, so sizes look the same at any resolution.
  const UNITS_TALL = 1080;
  const env: HelperEnv = {scale: 1, width: UNITS_TALL, height: UNITS_TALL};
  const helpers = helpersFor(env);

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
  let textures: (ImageBitmap | null)[] = [];
  let data: unknown = undefined;
  let setupDone = false;
  let failed = false;

  const send = (message: FromWorker, transfer: Transferable[] = []) => port?.postMessage(message, transfer);
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
      ctx = canvas.getContext("2d");
      env.scale = message.height / UNITS_TALL;
      env.height = UNITS_TALL;
      env.width = UNITS_TALL * message.width / message.height;
      duration = message.duration;
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
    for (const step of message.steps) {
      stepTime = step.time;
      const floats = [...step.floats];
      const size = {width: env.width, height: env.height, duration};
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

  let queue = Promise.resolve();
  scope.addEventListener("message", event => {
    if (!port && event.data?.port) {
      port = event.data.port;
      port.onmessage = (e: MessageEvent<ToWorker>) => {
        queue = queue.then(() => handle(e.data)).catch(fail);
      };
    }
  });
  scope.addEventListener("unhandledrejection", event => fail(event.reason));

  return {helpers, define, lib, start};
}
