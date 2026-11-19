// The animation document: the JSON that's saved, downloaded and opened (see FILE_FORMATS.md).

export const NUM_TEXTURES = 8;
export const NUM_VARIABLES = 16;
export const DEFAULT_TITLE = "Untitled animation";
export const MAX_TITLE_LENGTH = 32;
export const DEFAULT_DURATION = 12;

export const ASPECT_RATIOS: readonly AspectRatio[] = [[1, 1], [4, 3], [16, 9], [3, 4], [9, 16]];
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
}

export interface TextureSlot {
  id: string;  // iTexture0 … iTexture7
  // A built-in texture's path under public/images/textures/, or an uploaded image's id.
  url: string;
  isUserUploaded: boolean;
}

export interface AnimationDocument {
  title: string;
  code: string;
  duration: number;  // Seconds.
  aspectRatio: AspectRatio;
  textures: TextureSlot[];
  variables: Variable[];
}

export const DEFAULT_CODE = `// Getting started? Try the tutorial: https://github.com/matthen/smoothstep/blob/main/docs/tutorial/README.md
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  // Compute coordinates that range from x = 0 to 1 and y = 0 to 1.
  vec2 uv = fragCoord / iResolution.xy;

  // Compute a color that varies with uv.x, uv.y and iTime.
  vec3 col = 0.5 + 0.5 * cos(iTime + uv.xyx + vec3(0, 2, 4));

  // Output the colour for this pixel.
  fragColor = vec4(col, 1.0);
}`;

export function emptyTextures(): TextureSlot[] {
  return Array.from({length: NUM_TEXTURES}, (_, i) => (
    {id: "iTexture" + i, url: "special/black.png", isUserUploaded: false}));
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
  if (!Array.isArray(aspectRatio) || aspectRatio.length !== 2 ||
      !aspectRatio.every(Number.isInteger) ||
      !ASPECT_RATIOS.some(([w, h]) => w === aspectRatio[0] && h === aspectRatio[1])) {
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
      const ok = isRecord(t) && Number.isInteger(r.startDSecs) && (r.startDSecs as number) >= 0 &&
        Number.isInteger(r.endDSecs) && (r.endDSecs as number) > (r.startDSecs as number) &&
        startValue !== null && endValue !== null &&
        (TRANSITION_TYPES as readonly unknown[]).includes(r.type);
      if (!ok) {fail("transition in variable " + i);}
      return {
        startDSecs: r.startDSecs as number, endDSecs: r.endDSecs as number,
        startValue: startValue!, endValue: endValue!,
        type: r.type as TransitionType,
      };
    });
    return {transitions};
  });
  return {
    title: json.title as string,
    code: json.code as string,
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
  return variables.map(v => variableValue(v.transitions, time));
}
