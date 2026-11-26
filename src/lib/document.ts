// The animation document: the JSON that's saved, downloaded and opened (see FILE_FORMATS.md).

export const NUM_TEXTURES = 8;
export const NUM_VARIABLES = 16;
export const MAX_BUFFERS = 4;
export const DEFAULT_TITLE = "Untitled animation";
export const MAX_TITLE_LENGTH = 32;
// The tutorial's animation is longer than a new one, which loops quickly to show its phase going round.
const TUTORIAL_DURATION = 12;
const DEFAULT_DURATION = 4;
const TWO_PI = 6.283;

export const ASPECT_RATIOS: readonly AspectRatio[] = [[1, 1], [4, 3], [16, 9], [3, 4], [9, 16]];
// A custom ratio is two whole numbers up to this, no wider or taller than 10:1.
export const MAX_ASPECT_TERM = 100;

export function isAspectRatio(value: unknown): value is AspectRatio {
  if (!Array.isArray(value) || value.length !== 2) {
    return false;
  }
  const [w, h] = value as unknown[];
  return Number.isInteger(w) && Number.isInteger(h) &&
    (w as number) >= 1 && (h as number) >= 1 && (w as number) <= MAX_ASPECT_TERM && (h as number) <= MAX_ASPECT_TERM &&
    (w as number) / (h as number) <= 10 && (h as number) / (w as number) <= 10;
}
const TRANSITION_TYPES = ["step", "linear", "smoothstep", "easeIn", "easeOut", "overshoot", "exponential"] as const;

export type AspectRatio = [number, number];
export type TransitionType = (typeof TRANSITION_TYPES)[number];

export interface Transition {
  // Times are in tenths of a second.
  startDSecs: number;
  endDSecs: number;
  startValue: number;
  endValue: number;
  type: TransitionType;
}

export interface Variable {
  transitions: Transition[];
  // Set with its slider: the value while it has no transitions (0 when left out).
  value?: number;
  // The slider's range, when set; otherwise sliderRange works one out.
  min?: number;
  max?: number;
}

export interface TextureSlot {
  id: string;  // iTexture0 … iTexture7
  // A built-in texture's path under public/images/textures/, or an uploaded image's id.
  url: string;
  isUserUploaded: boolean;
}

// A shader that renders before the image each frame, which every shader can read as iBuffer<index>.
interface Buffer {
  code: string;
}

// JavaScript that draws on a 2D canvas each step. With `overlay` its drawing is shown over the image;
// either way every shader can read it as iCanvas2D.
export interface CanvasLayer {
  kind: "canvas2d";
  code: string;
  overlay: boolean;
}

const MAX_LAYERS = 1;

export interface AnimationDocument {
  title: string;
  code: string;
  // Left out when there are none, so animations without buffers are saved as before.
  buffers?: Buffer[];
  // Left out when there are none. A list, each with its kind, so other kinds of layer can follow.
  layers?: CanvasLayer[];
  // Code that goes before the image's and every buffer's own code. Left out when there's none.
  shared?: string;
  duration: number;  // Seconds.
  aspectRatio: AspectRatio;
  textures: TextureSlot[];
  variables: Variable[];
}

// The mainImage a missing one's error offers to insert.
export const DEFAULT_MAIN_IMAGE = `void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  // Compute coordinates that range from x = 0 to 1 and y = 0 to 1.
  vec2 uv = fragCoord / iResolution.xy;

  // Compute a color that varies with uv.x, uv.y and iTime.
  vec3 col = 0.5 + 0.5 * cos(iTime + uv.xyx + vec3(0, 2, 4));

  // Output the colour for this pixel.
  fragColor = vec4(col, 1.0);
}`;

export const DEFAULT_CODE = `// Getting started? Try the tutorial in [Help → Tutorial].

// phase is iFloat0, which its row in the timeline takes from 0 to 2π (6.283) as the animation plays.
#define phase iFloat0

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  // Compute coordinates that range from x = 0 to 1 and y = 0 to 1.
  vec2 uv = fragCoord / iResolution.xy;

  // Compute a color that varies with uv.x, uv.y and phase. cos repeats every 2π, so it loops smoothly.
  vec3 col = 0.5 + 0.5 * cos(phase + 2.0 * uv.xyx + vec3(0, 2, 4));

  // Output the colour for this pixel.
  fragColor = vec4(col, 1.0);
}`;

// The built-in image an empty texture slot holds.
export const EMPTY_TEXTURE = "special/black.png";

// A new buffer's mainImage, which draws what it drew last frame, so the image can read it.
export function bufferMainImage(index: number): string {
  return `void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / iResolution.xy;
  vec4 last = texture(iBuffer${index}, uv);
  vec4 now = vec4(uv, 0.5 + 0.5 * sin(iTime), 1.);
  fragColor = mix(last, now, 0.05);
}`;
}

// A new buffer's code.
export function newBufferCode(index: number): string {
  return `// iBuffer${index} draws before the image each frame, and any shader can read what it drew:
// try texture(iBuffer${index}, uv) in the [Image.glsl] tab. Reading itself gives what it drew last frame.
` + bufferMainImage(index);
}

// A new Canvas2D layer's draw: a line of text, bobbing gently.
export const NEW_CANVAS_DRAW = `function draw(ctx, {time}) {
  clear(ctx);
  ctx.fillStyle = "white";
  ctx.font = "600 80px Inter";
  ctx.fillText("Hello, canvas", 80, 540 + 40 * Math.sin(time));
}`;

export const NEW_CANVAS_CODE = `// Draws over the image each frame; shaders read it as iCanvas2D. See [the Canvas2D layer](docs/canvas2d).

// Runs at the start, before the first draw: after each build and when the animation starts again.
// Whatever it returns is data in draw.
function setup({width, height}) {
  return {message: "Hello, canvas"};
}

function draw(ctx, {time, data}) {
  clear(ctx);
  ctx.fillStyle = "white";
  ctx.font = "600 80px Inter";
  ctx.fillText(data.message, 80, 540 + 40 * Math.sin(time));
}
`;

export function bufferCodes(doc: AnimationDocument): string[] {
  return (doc.buffers ?? []).map(buffer => buffer.code);
}

// The animation's Canvas2D layer, if it has one.
export function canvasLayer(doc: AnimationDocument): CanvasLayer | undefined {
  return doc.layers?.[0];
}

// The document with its Canvas2D layer set, or removed with null.
export function withCanvasLayer(doc: AnimationDocument, layer: CanvasLayer | null): AnimationDocument {
  const next: AnimationDocument = {...doc, layers: layer ? [layer] : []};
  if (!layer) {
    delete next.layers;
  }
  return next;
}

// The code that builds with the image's: the buffers', the code they all share, and the canvas
// layer's (null without one).
export interface ShaderExtras {
  buffers: string[];
  shared: string;
  canvas: string | null;
}

export function shaderExtras(doc: AnimationDocument): ShaderExtras {
  return {buffers: bufferCodes(doc), shared: doc.shared ?? "", canvas: canvasLayer(doc)?.code ?? null};
}

export function sameExtras(a: ShaderExtras, b: ShaderExtras): boolean {
  return a.shared === b.shared && a.canvas === b.canvas &&
    a.buffers.length === b.buffers.length && a.buffers.every((c, i) => c === b.buffers[i]);
}

// What the shared.glsl tab shows before anything's written in it.
export const SHARED_PLACEHOLDER = `// Functions, constants and #defines here can be used in every shader tab: the image and each buffer.
`;

export function emptyTextures(): TextureSlot[] {
  return Array.from({length: NUM_TEXTURES}, (_, i) => (
    {id: "iTexture" + i, url: EMPTY_TEXTURE, isUserUploaded: false}));
}

export function emptyVariables(): Variable[] {
  return Array.from({length: NUM_VARIABLES}, () => ({transitions: []}));
}

// What a new visitor sees first, and File → New: phase goes once round on the timeline, and loops.
export function newDocument(): AnimationDocument {
  const variables = emptyVariables();
  variables[0] = {transitions: [
    {startDSecs: 0, endDSecs: DEFAULT_DURATION * 10, startValue: 0, endValue: TWO_PI, type: "linear"},
  ]};
  return {
    title: DEFAULT_TITLE,
    code: DEFAULT_CODE,
    duration: DEFAULT_DURATION,
    aspectRatio: [1, 1],
    textures: emptyTextures(),
    variables,
  };
}

// The tutorial's animation, with an empty timeline, as its lessons fill it.
export function tutorialDocument(): AnimationDocument {
  return {...newDocument(), duration: TUTORIAL_DURATION, variables: emptyVariables()};
}

export class InvalidDocumentError extends Error {
  constructor(message: string) {
    super("Invalid animation: " + message);
    this.name = "InvalidDocumentError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// The old timeline could save a cleared value field as "" (which it played as 0) or a number as a
// string, so those load as numbers.
function numericValue(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

// Checks a parsed JSON value is a valid document, with the rules the old hosted smoothstep.io
// applied when saving, and returns a clean copy with only the known fields.
export function parseDocument(value: unknown): AnimationDocument {
  const fail = (message: string): never => {throw new InvalidDocumentError(message);};
  if (!isRecord(value)) {fail("not an object");}
  const json = value as Record<string, unknown>;
  // Documents saved before aspect ratios existed are square.
  const aspectRatio = (json.aspectRatio === undefined ? [1, 1] : json.aspectRatio) as number[];
  if (typeof json.title !== "string") {fail("title");}
  if (typeof json.code !== "string") {fail("code");}
  if (typeof json.duration !== "number" || !(json.duration > 0)) {fail("duration");}
  if (!isAspectRatio(aspectRatio)) {
    fail("aspectRatio");
  }
  if (!Array.isArray(json.textures)) {fail("textures");}
  const textures = (json.textures as unknown[]).map((texture, i): TextureSlot => {
    if (!isRecord(texture) || typeof texture.url !== "string" || texture.id !== "iTexture" + i) {
      fail("texture " + i);
    }
    const t = texture as Record<string, unknown>;
    return {id: t.id as string, url: t.url as string, isUserUploaded: t.isUserUploaded === true};
  });
  if (!Array.isArray(json.variables) || json.variables.length !== NUM_VARIABLES) {fail("variables");}
  const variables = (json.variables as unknown[]).map((variable, i): Variable => {
    if (!isRecord(variable) || !Array.isArray(variable.transitions)) {fail("variable " + i);}
    const transitions = ((variable as Record<string, unknown>).transitions as unknown[]).map(t => {
      const r = isRecord(t) ? t : {};
      const startValue = numericValue(r.startValue);
      const endValue = numericValue(r.endValue);
      // Times are kept to a hundredth of a second, one decimal place of a tenth.
      const startDSecs = typeof r.startDSecs === "number" ? Math.round(r.startDSecs * 10) / 10 : NaN;
      const endDSecs = typeof r.endDSecs === "number" ? Math.round(r.endDSecs * 10) / 10 : NaN;
      const ok = isRecord(t) && Number.isFinite(startDSecs) && startDSecs >= 0 &&
        Number.isFinite(endDSecs) && endDSecs > startDSecs &&
        startValue !== null && endValue !== null &&
        (TRANSITION_TYPES as readonly unknown[]).includes(r.type);
      if (!ok) {fail("transition in variable " + i);}
      return {
        startDSecs, endDSecs,
        startValue: startValue!, endValue: endValue!,
        type: r.type as TransitionType,
      };
    });
    // The slider's fields are optional, and left out unless they're finite numbers.
    const v = variable as Record<string, unknown>;
    const slider: Partial<Variable> = {};
    for (const key of ["value", "min", "max"] as const) {
      if (typeof v[key] === "number" && Number.isFinite(v[key])) {
        slider[key] = v[key];
      }
    }
    return {transitions, ...slider};
  });
  if (json.buffers !== undefined && (!Array.isArray(json.buffers) || json.buffers.length > MAX_BUFFERS)) {
    fail("buffers");
  }
  const buffers = ((json.buffers ?? []) as unknown[]).map((buffer, i): Buffer => {
    if (!isRecord(buffer) || typeof buffer.code !== "string") {fail("buffer " + i);}
    return {code: (buffer as Record<string, unknown>).code as string};
  });
  if (json.shared !== undefined && typeof json.shared !== "string") {fail("shared");}
  const shared = (json.shared ?? "") as string;
  if (json.layers !== undefined && (!Array.isArray(json.layers) || json.layers.length > MAX_LAYERS)) {
    fail("layers");
  }
  const layers = ((json.layers ?? []) as unknown[]).map((layer, i): CanvasLayer => {
    if (!isRecord(layer) || layer.kind !== "canvas2d" || typeof layer.code !== "string") {fail("layer " + i);}
    const l = layer as Record<string, unknown>;
    // Drawn over the image unless it says not.
    return {kind: "canvas2d", code: l.code as string, overlay: l.overlay !== false};
  });
  return {
    title: json.title as string,
    code: json.code as string,
    ...(buffers.length > 0 ? {buffers} : {}),
    ...(layers.length > 0 ? {layers} : {}),
    ...(shared ? {shared} : {}),
    duration: json.duration as number,
    aspectRatio: [aspectRatio[0], aspectRatio[1]] as AspectRatio,
    textures,
    variables,
  };
}

// JSON with object keys sorted, so equal documents compare equal whatever wrote them.
export function canonicalJSON(value: unknown): string {
  if (Array.isArray(value)) {
    return "[" + value.map(canonicalJSON).join(",") + "]";
  }
  if (isRecord(value)) {
    return "{" + Object.keys(value).sort().map(
      k => JSON.stringify(k) + ":" + canonicalJSON(value[k])).join(",") + "}";
  }
  return JSON.stringify(value);
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

export function transitionValue(transition: Transition, time: number): number {
  const timeDSecs = time * 10;
  const t = clamp01((timeDSecs - transition.startDSecs) / (transition.endDSecs - transition.startDSecs));
  const a = transition.startValue;
  const b = transition.endValue;
  if (transition.type === "step") {
    return t > 0.5 ? b : a;
  }
  // The same factor each moment, for zooms and frequencies; that needs both ends on one side of 0.
  if (transition.type === "exponential" && a * b > 0) {
    return a * (b / a) ** t;
  }
  const s = easing(transition.type, t);
  return a * (1 - s) + b * s;
}

// How far through a transition the value is, 0 to 1 (overshoot goes a little past 1), at fraction t
// of its time.
function easing(type: TransitionType, t: number): number {
  switch (type) {
    case "smoothstep":
      return t * t * (3 - 2 * t);
    case "easeIn":
      return t * t * t;
    case "easeOut":
      return 1 - (1 - t) ** 3;
    case "overshoot": {
      // The usual "back" ease out, which overshoots by about 10%.
      const c = 1.70158;
      return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
    }
    default:
      return t;
  }
}

// A variable's value at `time` seconds: before its first transition it holds that transition's
// start value, and between transitions the previous one's end value. Transitions are sorted.
export function variableValue(transitions: readonly Transition[], time: number): number {
  const first = transitions[0];
  if (!first) {
    return 0;
  }
  const timeDSecs = time * 10;
  let value = first.startValue;
  for (const transition of transitions) {
    if (transition.startDSecs <= timeDSecs && timeDSecs <= transition.endDSecs) {
      return transitionValue(transition, time);
    } else if (transition.endDSecs < timeDSecs) {
      value = transition.endValue;
    } else {
      break;
    }
  }
  return Number.isFinite(value) ? value : 0;
}

export function variableValues(variables: readonly Variable[], time: number): number[] {
  return variables.map(v => v.transitions.length > 0 ? variableValue(v.transitions, time) : v.value ?? 0);
}

// A slider's range: the one set for it, or one that covers its timeline values and its value,
// starting from 0 to 1.
export function sliderRange(variable: Variable): [number, number] {
  let lo = 0;
  let hi = 1;
  const values = [variable.value ?? 0, ...variable.transitions.flatMap(t => [t.startValue, t.endValue])];
  for (const value of values) {
    lo = Math.min(lo, value);
    hi = Math.max(hi, value);
  }
  return [variable.min ?? lo, variable.max ?? hi];
}
