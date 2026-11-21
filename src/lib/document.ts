// The animation document: the JSON that's saved, downloaded and opened (see FILE_FORMATS.md).

export const NUM_TEXTURES = 8;
export const NUM_VARIABLES = 16;
export const MAX_BUFFERS = 4;
export const DEFAULT_TITLE = "Untitled animation";
export const MAX_TITLE_LENGTH = 32;
export const DEFAULT_DURATION = 12;

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
export const TRANSITION_TYPES = ["step", "linear", "smoothstep"] as const;

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
export interface Buffer {
  code: string;
}

export interface AnimationDocument {
  title: string;
  code: string;
  // Left out when there are none, so animations without buffers are saved as before.
  buffers?: Buffer[];
  // Code that goes before the image's and every buffer's own code. Left out when there's none.
  shared?: string;
  duration: number;  // Seconds.
  aspectRatio: AspectRatio;
  textures: TextureSlot[];
  variables: Variable[];
}

export const DEFAULT_CODE = `// Getting started? Try the tutorial in [Help → Tutorial].

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  // Compute coordinates that range from x = 0 to 1 and y = 0 to 1.
  vec2 uv = fragCoord / iResolution.xy;

  // Compute a color that varies with uv.x, uv.y and iTime.
  vec3 col = 0.5 + 0.5 * cos(iTime + uv.xyx + vec3(0, 2, 4));

  // Output the colour for this pixel.
  fragColor = vec4(col, 1.0);
}`;

// The built-in image an empty texture slot holds.
export const EMPTY_TEXTURE = "special/black.png";

// A new buffer's code, which draws what it drew last frame, so the image can read it.
export function newBufferCode(index: number): string {
  return `// iBuffer${index} draws before the image each frame, and any shader can read what it drew:
// try texture(iBuffer${index}, uv) in the [Image] tab. Reading itself gives what it drew last frame.
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / iResolution.xy;
  vec4 last = texture(iBuffer${index}, uv);
  vec4 now = vec4(uv, 0.5 + 0.5 * sin(iTime), 1.);
  fragColor = mix(last, now, 0.05);
}`;
}

export function bufferCodes(doc: AnimationDocument): string[] {
  return (doc.buffers ?? []).map(buffer => buffer.code);
}

// The code that compiles with the image's: the buffers', and the code they all share.
export interface ShaderExtras {
  buffers: string[];
  shared: string;
}

export function shaderExtras(doc: AnimationDocument): ShaderExtras {
  return {buffers: bufferCodes(doc), shared: doc.shared ?? ""};
}

export function sameExtras(a: ShaderExtras, b: ShaderExtras): boolean {
  return a.shared === b.shared && a.buffers.length === b.buffers.length && a.buffers.every((c, i) => c === b.buffers[i]);
}

// What the Shared tab shows before anything's written in it.
export const SHARED_PLACEHOLDER = `// Functions, constants and #defines here can be used in every tab: the image and each buffer.
`;

export function emptyTextures(): TextureSlot[] {
  return Array.from({length: NUM_TEXTURES}, (_, i) => (
    {id: "iTexture" + i, url: EMPTY_TEXTURE, isUserUploaded: false}));
}

export function emptyVariables(): Variable[] {
  return Array.from({length: NUM_VARIABLES}, () => ({transitions: []}));
}

export function newDocument(): AnimationDocument {
  return {
    title: DEFAULT_TITLE,
    code: DEFAULT_CODE,
    duration: DEFAULT_DURATION,
    aspectRatio: [1, 1],
    textures: emptyTextures(),
    variables: emptyVariables(),
  };
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
  return {
    title: json.title as string,
    code: json.code as string,
    ...(buffers.length > 0 ? {buffers} : {}),
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
  switch (transition.type) {
    case "smoothstep": {
      const s = t * t * (3 - 2 * t);
      return a * (1 - s) + b * s;
    }
    case "step":
      return t > 0.5 ? b : a;
    default:
      return (1 - t) * a + t * b;
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
