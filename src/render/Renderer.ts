// Compiles the user's fragment shaders and renders frames with WebGL 2. Each frame first renders the
// buffers the image uses, in order, then the image. Every shader renders into one of a pair of
// framebuffers, so it can read its own previous frame: the image as iPrevFrame, and buffer k as
// iBuffer<k>. Then the image is copied to the canvas.
import { MAX_BUFFERS, NUM_TEXTURES, NUM_VARIABLES } from '../lib/document';
import type { LineError } from '../lib/types';
import { uses } from '../lib/glslCode';
import { isVideoURL } from '../lib/media';
import { bracketError } from './brackets';
import { VideoTexture } from './videoTexture';
import {
  PROBE_DECLARATIONS, PROBE_MAIN, planProbe, probeComponents, sharedCallers, typeFromError, UNREACHED, withProbe,
  type ProbeType, type Site,
} from './probe';
import { PICK_UNIFORM, pickedRequest, pickedSources, pickRange, type Pick, type PickType, type Sources } from './pick';
import { ProgramCache } from './programCache';
import { combineBlocks, rangeFor, type FoundRange, type RangeMode } from './probeRange';

const VERTEX_SHADER = `#version 300 es
in vec4 a_position;
void main() {
  gl_Position = a_position;
}
`;

const COPY_SHADER = `#version 300 es
precision highp float;
uniform sampler2D iTexture;
uniform vec2 iResolution;
out vec4 fragColor;
void main() {
  fragColor = texture(iTexture, gl_FragCoord.xy / iResolution.xy);
}
`;

// Whether a probe never ran for a pixel. Bytes clip the marker to 0, so only a value with an alpha of 1
// can be told from it.
const UNREACHED_GLSL = `bool unreached(vec4 v) {
  return iBytes ? iCount < 4 && v.a == 0. : all(equal(v, vec4(${UNREACHED}.)));
}`;

// Finds the lowest and highest finite component in each block of the probe's values, as
// (lowest, highest, 1 if any, 0), for Auto's range.
const PROBE_RANGE_SHADER = `#version 300 es
precision highp float;
uniform sampler2D iTexture;
uniform int iCount;
uniform bool iBytes;
uniform ivec2 iBlock;
out vec4 fragColor;
${UNREACHED_GLSL}
void main() {
  ivec2 size = textureSize(iTexture, 0);
  ivec2 start = ivec2(gl_FragCoord.xy) * iBlock;
  ivec2 end = min(start + iBlock, size);
  float lo = 0.;
  float hi = 0.;
  bool found = false;
  for (int y = start.y; y < end.y; y++) {
    for (int x = start.x; x < end.x; x++) {
      vec4 v = texelFetch(iTexture, ivec2(x, y), 0);
      if (unreached(v)) continue;
      for (int i = 0; i < iCount; i++) {
        float c = v[i];
        if (isnan(c) || isinf(c)) continue;
        lo = found ? min(lo, c) : c;
        hi = found ? max(hi, c) : c;
        found = true;
      }
    }
  }
  fragColor = vec4(lo, hi, found ? 1. : 0., 0.);
}
`;

// Auto's range looks again at most this often while playing, over blocks of a grid this many across.
const RANGE_INTERVAL_MS = 250;
const RANGE_BLOCKS = 64;

// Shows the value a probe kept for each pixel: a float as grey, a vec2 as red and green, and so on.
// Pixels it never ran for are striped, and a vec4's alpha shows over a checkerboard.
const SHOW_PROBE_SHADER = `#version 300 es
precision highp float;
uniform sampler2D iTexture;
uniform int iCount;
uniform vec2 iRange;
uniform bool iBytes;
out vec4 fragColor;
${UNREACHED_GLSL}
void main() {
  vec4 v = texelFetch(iTexture, ivec2(gl_FragCoord.xy), 0);
  if (unreached(v)) {
    float stripe = mod(floor((gl_FragCoord.x + gl_FragCoord.y) / 8.), 2.);
    fragColor = vec4(mix(vec3(0.16, 0.16, 0.21), vec3(0.27, 0.28, 0.35), stripe), 1.);
    return;
  }
  v = (v - iRange.x) / (iRange.y - iRange.x);
  vec3 c = clamp(iCount == 1 ? v.rrr : iCount == 2 ? vec3(v.rg, 0.) : v.rgb, 0., 1.);
  if (iCount == 4) {
    vec2 cell = floor(gl_FragCoord.xy / 8.);
    c = mix(vec3(mod(cell.x + cell.y, 2.) == 0. ? 0.3 : 0.5), c, clamp(v.a, 0., 1.));
  }
  fragColor = vec4(c, 1.);
}
`;

// Everything before the user's code, with an iBuffer uniform for each of the animation's buffers, and a
// dragged picker's uniform. It's always three lines, so error line numbers are offset by the same amount.
function shaderPrefix(numBuffers = 0, pick: PickType | null = null): string {
  let uniforms = "uniform vec2 iResolution; uniform float iTime; uniform float iDuration; uniform int iFrame; ";
  uniforms += "uniform sampler2D iPrevFrame; uniform sampler2D iCanvas2D; ";
  for (let i = 0; i < NUM_TEXTURES; i++) {
    uniforms += `uniform sampler2D iTexture${i}; `;
  }
  for (let i = 0; i < NUM_VARIABLES; i++) {
    uniforms += `uniform float iFloat${i}; `;
  }
  for (let i = 0; i < numBuffers; i++) {
    uniforms += `uniform sampler2D iBuffer${i}; `;
  }
  if (pick) {
    uniforms += `uniform ${pick} ${PICK_UNIFORM}; `;
  }
  return "#version 300 es\nprecision highp float;\n" + uniforms + "\n";
}

// The image is opaque; a buffer keeps its alpha, since it may hold any numbers.
function shaderSuffix(isBuffer: boolean): string {
  return "\nout vec4 smoothstepColor;\nvoid main() { mainImage(smoothstepColor, gl_FragCoord.xy);" +
    (isBuffer ? "" : " smoothstepColor.a = 1.;") + " }\n";
}

// The shared code goes before each shader's own code.
function userCode(code: string, shared: string): string {
  return shared ? shared + "\n" + code : code;
}

export function fragmentSource(
  code: string, numBuffers = 0, isBuffer = false, shared = "", pick: PickType | null = null,
): string {
  return shaderPrefix(numBuffers, pick) + userCode(code, shared) + shaderSuffix(isBuffer);
}

// A shader that outputs the value its probe kept in place of its colour.
function probeFragmentSource(code: string, numBuffers: number, shared: string, pick: PickType | null): string {
  return shaderPrefix(numBuffers, pick).slice(0, -1) + PROBE_DECLARATIONS + "\n" + userCode(code, shared) +
    "\nout vec4 smoothstepColor;\n" + PROBE_MAIN + "\n";
}

// Splits errors in a shader's code, after the shared code, into those in the shared code and
// those in its own, and returns the part the first error is in.
export function locateErrors(errors: LineError[], shared: string): {inShared: boolean; errors: LineError[]} {
  const sharedLines = shared ? shared.split("\n").length : 0;
  const inShared = (errors[0]?.line ?? sharedLines) < sharedLines;
  return {
    inShared,
    errors: errors.filter(e => (e.line < sharedLines) === inShared)
      .map(e => inShared ? e : {...e, line: e.line - sharedLines}),
  };
}

const DECLARED_TYPE = String.raw`\b(?:void|bool|int|uint|float|[biu]?vec[234]|mat[234](?:x[234])?|\w*sampler\w*)\s+`;

// Where an error with no line number comes from, such as a link error or a call to a function declared but
// never defined: the first name in the log declared in the shared code or the shader's own, else line 0.
export function locateUnplacedError(log: string, code: string, shared: string): {inShared: boolean; errors: LineError[]} {
  const message = log.trim() || "Couldn't link the shader.";
  for (const name of log.match(/\b[A-Za-z_]\w*\b/g) ?? []) {
    const declaration = new RegExp(DECLARED_TYPE + name + String.raw`\b`);
    for (const [inShared, source] of [[true, shared], [false, code]] as const) {
      const line = source.split("\n").findIndex(text => declaration.test(text));
      if (line >= 0) {
        return {inShared, errors: [{line, message}]};
      }
    }
  }
  return {inShared: false, errors: [{line: 0, message}]};
}

// Whether code defines mainImage, outside comments.
function definesMainImage(code: string): boolean {
  return /\bvoid\s+mainImage\s*\(/.test(code.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, ""));
}

// A shader's errors, with those about calling a mainImage that isn't there replaced by one that
// says so, under the code's last line.
export function markMissingMainImage(errors: LineError[], code: string, shared: string): LineError[] {
  if (definesMainImage(userCode(code, shared))) {
    return errors;
  }
  return [
    ...errors.filter(e => !e.message.includes("mainImage")),
    {line: code.split("\n").length - 1, message: "This tab needs a mainImage function, which works out " +
      "the colour of each pixel.", missing: "mainImage"},
  ];
}

// The buffers the image needs this frame: those it reads, and those they read in turn.
export function buffersUsed(code: string, buffers: readonly string[]): number[] {
  const used = new Set<number>();
  const visit = (source: string) => {
    for (const match of source.matchAll(/\biBuffer(\d+)\b/g)) {
      const index = Number(match[1]);
      if (index < buffers.length && !used.has(index)) {
        used.add(index);
        visit(buffers[index]!);
      }
    }
  };
  visit(code);
  return [...used].sort((a, b) => a - b);
}

export const PAST_END_ERROR = "The code ends before something in it is finished, such as a missing ; or }.";

// Turns a WebGL info log into errors on lines of the user's code (0-based, clamped to the code).
// Errors in the app's code after it say so plainly, once, on the code's last line that isn't blank.
export function parseErrors(log: string, code: string): LineError[] {
  const offset = shaderPrefix().split("\n").length;  // 1-based line number of the code's first line
  const lines = code.split("\n");
  const lastLine = lines.length - 1;
  const lastFilled = Math.max(0, lines.findLastIndex(line => line.trim() !== ""));
  const errors: LineError[] = [];
  for (const match of log.matchAll(/ERROR:\s*\d+:(\d+):\s*(.*)/g)) {
    const line = Number(match[1]) - offset;
    const message = (match[2] ?? "").trim();
    // A call to a missing mainImage is in the app's code too; markMissingMainImage explains that one.
    if (line > lastLine && !message.includes("mainImage")) {
      if (!errors.some(e => e.message === PAST_END_ERROR)) {
        errors.push({line: lastFilled, message: PAST_END_ERROR});
      }
    } else {
      errors.push({line: Math.max(0, Math.min(line, lastLine)), message});
    }
  }
  if (errors.length === 0 && log.trim()) {
    errors.push({line: 0, message: log.trim()});
  }
  return errors;
}

export interface FrameInputs {
  time: number;
  duration: number;
  frameIndex: number;
  variableValues: readonly number[];
}

interface Target {
  framebuffer: WebGLFramebuffer;
  texture: WebGLTexture;
}

// A tab of code: the image, buffer k, the code they share, or the Canvas2D layer's JavaScript. Also
// which one an error is in.
export type ShaderId = "image" | "shared" | "canvas" | number;

export type CompileResult = {ok: true} | {ok: false; shader: ShaderId; errors: LineError[]};

// An expression to show in place of the image: the code of the tab it's in, and where it is in that code.
export interface ProbeRequest {
  tab: ShaderId;
  code: string;
  from: number;
  to: number;
}

export type ProbeResult = {
  ok: true;
  expression: string;
  type: ProbeType;
  // The shader it's shown in, which for shared code is the first that calls its function.
  shader: "image" | number;
  from: number;
  to: number;
  // Where values are bytes, pixels a vec4 never ran for can't be told apart.
  unmarked: boolean;
} | {ok: false; message: string};

// What the inspector reads at a pixel: its colour, and the probe's value there, or null where it never ran.
export interface PixelReading {
  color: [number, number, number];
  value?: number[] | null;
}

interface Probe {
  program: Program;
  shader: "image" | number;
  type: ProbeType;
  // The code it runs, to find the buffers it reads.
  code: string;
}

// Texture units: the previous frame, then the texture slots, then the buffers, then the Canvas2D layer.
const PREV_FRAME_UNIT = 0;
const TEXTURE_UNIT = 1;
const BUFFER_UNIT = TEXTURE_UNIT + NUM_TEXTURES;
const CANVAS_UNIT = BUFFER_UNIT + MAX_BUFFERS;  // Up to 14 units in all; WebGL 2 promises 16.

type Program = WebGLProgram & {vao: WebGLVertexArrayObject | null};

class WebGLUnavailableError extends Error {}

export class Renderer {
  readonly gl: WebGL2RenderingContext;
  // Every program shares this vertex shader, compiled once.
  private vertexShader: WebGLShader;
  private programs = new ProgramCache<Program>(program => this.deleteProgram(program));
  private program: Program | null = null;
  private bufferPrograms: Program[] = [];
  // The buffers the image needs, in the order they render.
  private used: number[] = [];
  // Whether the shaders' frames depend on the ones before, through buffers or iPrevFrame.
  private shaderState = false;
  // The Canvas2D layer's latest frame, which shaders read as iCanvas2D: transparent without a layer.
  private canvasTexture: WebGLTexture;
  private hasLayer = false;
  // Whether the layer's frame is drawn over the image.
  layerOverlay = true;
  private lastInputs: FrameInputs | null = null;
  private copyProgram: Program;
  private showProbeProgram: Program;
  private probe: Probe | null = null;
  private probeTarget: (Target & {width: number; height: number}) | null = null;
  // The probe's values as 32-bit floats where they can be drawn and read back, else half floats or bytes.
  private probeFormat: "float" | "half" | "byte";
  private probeRangeProgram: Program;
  // The range the probe's values are shown from black to full colour, and what Auto last found.
  private rangeMode: RangeMode = "auto";
  private found: FoundRange = null;
  private rangeTarget: (Target & {width: number; height: number}) | null = null;
  // Set when the probe has drawn since Auto last looked, and when it last did.
  private rangeStale = false;
  private rangeAt = -Infinity;
  // Off while a thumbnail is taken.
  showProbe = true;
  // The code as last built, and the buffers the image needs without the probe.
  private sources: Sources = {code: "", buffers: [], shared: ""};
  // The literal a picker drags, built as a uniform, and its value; the expression shown, as asked for.
  private pick: {pick: Pick; values: number[]} | null = null;
  private probeRequest: ProbeRequest | null = null;
  private imageUsed: number[] = [];
  // The buffers drawn only for the probe, and whether they've just started.
  private probeBuffers: number[] = [];
  private probeRestart = false;
  // The site and type that last built for an expression, tried first when the code builds again.
  private probeCache: {key: string; site: number; type: ProbeType} | null = null;
  private layerSize: [number, number] = [1, 1];
  private layerReadFramebuffer: WebGLFramebuffer | null = null;
  private uniforms = new WeakMap<WebGLProgram, Map<string, WebGLUniformLocation | null>>();
  // [last frame, the one before], for the image and for each buffer in use.
  private targets: [Target, Target] | null = null;
  private bufferTargets = new Map<number, [Target, Target]>();
  // The size those targets were made at.
  private targetSize: [number, number] = [0, 0];
  // Buffers hold half floats where the browser can render to them, and bytes otherwise.
  private floatBuffers: boolean;
  private width = 1;
  private height = 1;
  private textureUnits: WebGLTexture[] = [];
  private images = new Map<string, HTMLImageElement>();
  // Whether each image's first load worked, as `complete` and `naturalWidth` can't tell a failure from an SVG with no size.
  private imageStates = new Map<string, "loading" | "loaded" | "failed">();
  private textureURLs: string[] = [];
  // Each slot's video, or null for an image; slots with the same video share it.
  private slotVideos: (VideoTexture | null)[] = [];
  private videos = new Map<string, VideoTexture>();
  onTextureLoaded: () => void = () => {};
  // A paused video has a new frame to show, so draw again.
  onVideoFrame: () => void = () => {};
  // A slot's image or video couldn't be loaded or decoded, so it stays black.
  onTextureFailed: (slot: number, video: boolean) => void = () => {};

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl2", {antialias: false, preserveDrawingBuffer: false});
    if (!gl) {
      throw new WebGLUnavailableError("WebGL 2 isn't available");
    }
    this.gl = gl;
    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    const vertex = this.compile(gl.VERTEX_SHADER, VERTEX_SHADER);
    if (!vertex.shader) {
      throw new Error("Couldn't build the vertex shader: " + vertex.log);
    }
    this.vertexShader = vertex.shader;
    const copy = this.link(COPY_SHADER);
    if (!copy.program) {
      throw new Error("Couldn't build the copy shader: " + copy.log);
    }
    this.copyProgram = copy.program;
    const show = this.link(SHOW_PROBE_SHADER);
    if (!show.program) {
      throw new Error("Couldn't build the probe shader: " + show.log);
    }
    this.showProbeProgram = show.program;
    const range = this.link(PROBE_RANGE_SHADER);
    if (!range.program) {
      throw new Error("Couldn't build the probe range shader: " + range.log);
    }
    this.probeRangeProgram = range.program;
    // Some phones can only render to half floats, which is all the buffers need.
    const floats = gl.getExtension("EXT_color_buffer_float") !== null;
    this.floatBuffers = (floats || gl.getExtension("EXT_color_buffer_half_float") !== null) &&
      this.canRender(gl.RGBA16F, gl.HALF_FLOAT);
    this.probeFormat = floats && this.canRender(gl.RGBA32F, gl.FLOAT) ? "float" : this.floatBuffers ? "half" : "byte";
    // Uploaded images are flipped so texture coordinates start at the bottom left, as in GL.
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    for (let i = 0; i < NUM_TEXTURES; i++) {
      this.textureUnits.push(this.blackTexture());
    }
    this.canvasTexture = this.blankCanvasTexture();
  }

  // Whether a frame depends on the ones before: the shaders' do, or there's a Canvas2D layer, which
  // draws each step in turn.
  get hasState(): boolean {
    return this.shaderState || this.probeBuffers.length > 0 || this.hasLayer;
  }

  private blankCanvasTexture(): WebGLTexture {
    const gl = this.gl;
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
    for (const [name, value] of [
      [gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR],
      [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE],
    ] as const) {
      gl.texParameteri(gl.TEXTURE_2D, name, value);
    }
    return texture;
  }

  // Says whether the animation has a Canvas2D layer. Without one, iCanvas2D is transparent.
  setLayer(hasLayer: boolean) {
    if (this.hasLayer && !hasLayer) {
      this.gl.deleteTexture(this.canvasTexture);
      this.canvasTexture = this.blankCanvasTexture();
    }
    this.hasLayer = hasLayer;
  }

  // Takes the layer's latest frame, and closes it. The worker made it bottom row first with
  // premultiplied alpha, as the unpack settings don't apply to bitmaps.
  setLayerFrame(bitmap: ImageBitmap) {
    const gl = this.gl;
    if (this.hasLayer) {
      gl.activeTexture(gl.TEXTURE0 + CANVAS_UNIT);
      gl.bindTexture(gl.TEXTURE_2D, this.canvasTexture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bitmap);
      this.layerSize = [bitmap.width, bitmap.height];
    }
    bitmap.close();
  }

  // Some drivers offer the extensions but still can't draw into a float texture.
  private canRender(format: number, type: number): boolean {
    const gl = this.gl;
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, format, 1, 1, 0, gl.RGBA, type, null);
    const framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    const complete = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(framebuffer);
    gl.deleteTexture(texture);
    return complete;
  }

  private deleteProgram(program: Program) {
    this.gl.deleteVertexArray(program.vao);
    this.gl.deleteProgram(program);
  }

  private compile(type: number, source: string): {shader: WebGLShader | null; log: string} {
    const gl = this.gl;
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(shader) ?? "";
      gl.deleteShader(shader);
      return {shader: null, log};
    }
    return {shader, log: ""};
  }

  private link(fragmentSourceCode: string): {program: Program | null; log: string; stage: "compile" | "link"} {
    const gl = this.gl;
    const fragment = this.compile(gl.FRAGMENT_SHADER, fragmentSourceCode);
    if (!fragment.shader) {
      return {program: null, log: fragment.log, stage: "compile"};
    }
    const program = gl.createProgram();
    gl.attachShader(program, this.vertexShader);
    gl.attachShader(program, fragment.shader);
    gl.linkProgram(program);
    gl.deleteShader(fragment.shader);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(program) ?? "";
      gl.deleteProgram(program);
      return {program: null, log, stage: "link"};
    }
    const location = gl.getAttribLocation(program, "a_position");
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0);
    const linked = program as Program;
    linked.vao = vao;
    return {program: linked, log: "", stage: "link"};
  }

  // A program for the source, the cached one if it has built before.
  private cachedLink(fragmentSourceCode: string): ReturnType<Renderer["link"]> {
    const cached = this.programs.get(fragmentSourceCode);
    if (cached) {
      return {program: cached, log: "", stage: "link"};
    }
    const result = this.link(fragmentSourceCode);
    if (result.program) {
      this.programs.add(fragmentSourceCode, result.program);
    }
    return result;
  }

  // Builds the image's shader and the buffers', compiling only those whose source changed. If any
  // fails, the previous ones keep rendering, without a picker's uniform.
  setCode(code: string, buffers: readonly string[] = [], shared = ""): CompileResult {
    const result = this.build(code, buffers, shared);
    if (!result.ok) {
      this.endPick();
    }
    return result;
  }

  private build(code: string, buffers: readonly string[], shared: string): CompileResult {
    const sources: [ShaderId, string][] = [["image", code], ...buffers.map((c, i): [ShaderId, string] => [i, c])];
    for (const [shader, source] of [["shared", shared] as [ShaderId, string], ...sources]) {
      const error = bracketError(source);
      if (error) {
        return {ok: false, shader, errors: [error]};
      }
    }
    const linked = this.linkShaders({code, buffers, shared}, null);
    if ("failed" in linked) {
      const {failed: shader, result} = linked;
      const source = shader === "image" ? code : buffers[shader]!;
      if (result.stage === "link" || !/ERROR:\s*\d+:\d+:/.test(result.log)) {
        const located = locateUnplacedError(result.log, source, shared);
        return {ok: false, shader: located.inShared ? "shared" : shader, errors: located.errors};
      }
      const located = locateErrors(parseErrors(result.log, userCode(source, shared)), shared);
      return located.inShared ? {ok: false, shader: "shared", errors: located.errors} :
        {ok: false, shader, errors: markMissingMainImage(located.errors, source, shared)};
    }
    this.usePrograms(linked.programs);
    this.pick = null;
    this.sources = {code, buffers, shared};
    this.imageUsed = buffersUsed(userCode(code, shared), buffers.map(b => userCode(b, shared)));
    this.used = this.imageUsed;
    this.probeBuffers = [];
    this.shaderState = this.used.length > 0 || uses(userCode(code, shared), /\biPrevFrame\b/);
    this.clearTargets();
    this.useProbe(null);
    this.probeRequest = null;
    return {ok: true};
  }

  // Links the image's program and each buffer's, the picked literal as a uniform in the shaders it's in,
  // or names the first that fails.
  private linkShaders(sources: Sources, pick: Pick | null):
      {programs: Program[]} | {failed: "image" | number; result: ReturnType<Renderer["link"]>} {
    const {code, buffers, shared} = pickedSources(sources, pick);
    const programs: Program[] = [];
    for (const [shader, source] of [["image", code] as const, ...buffers.map((c, i) => [i, c] as const)]) {
      const declares = pick && (pick.tab === "shared" || pick.tab === shader) ? pick.type : null;
      const result = this.cachedLink(fragmentSource(source, buffers.length, shader !== "image", shared, declares));
      if (!result.program) {
        this.programs.prune();
        return {failed: shader, result};
      }
      programs.push(result.program);
    }
    return {programs};
  }

  private usePrograms(programs: Program[]) {
    const slots = Math.max(programs.length, this.bufferPrograms.length + 1);
    this.programs.use(Array.from({length: slots}, (_, i) => [i === 0 ? "image" : `buffer${i - 1}`, programs[i] ?? null]));
    this.program = programs[0]!;
    this.bufferPrograms = programs.slice(1);
  }

  // A shader tab's code as last built.
  private builtCode(tab: ShaderId): string | null {
    const {code, buffers, shared} = this.sources;
    return tab === "image" ? code : tab === "shared" ? shared : tab === "canvas" ? null : buffers[tab] ?? null;
  }

  // Builds the code last built with the literal a picker is dragging, edited[from..to] in `tab`, as a
  // uniform, so moves set it without building. The frames so far stay. False if it doesn't build there.
  startPick(tab: ShaderId, edited: string, from: number, to: number, type: PickType, values: number[]): boolean {
    const built = this.builtCode(tab);
    const range = built === null || !this.program ? null : pickRange(built, edited, from, to);
    if (!range) {
      return false;
    }
    const pick = {tab, ...range, type};
    const linked = this.linkShaders(this.sources, pick);
    if ("failed" in linked) {
      return false;
    }
    this.usePrograms(linked.programs);
    this.pick = {pick, values};
    this.reprobe();
    return true;
  }

  // The dragged literal's value, as the uniform's components.
  setPickValues(values: number[]) {
    if (this.pick) {
      this.pick.values = values;
    }
  }

  // Goes back to the code last built, as at the end of a drag that left it unchanged.
  endPick() {
    const linked = this.pick && this.linkShaders(this.sources, null);
    if (!linked || "failed" in linked) {
      return;
    }
    this.usePrograms(linked.programs);
    this.pick = null;
    this.reprobe();
  }

  // Builds the expression shown again, for a pick's start or end, keeping what it found works.
  private reprobe() {
    if (this.probe && this.probeRequest) {
      const cache = this.probeCache;
      this.setProbe(this.probeRequest);
      this.probeCache = cache;
    }
  }

  // Shows the expression `request` selects in place of the image, or the image again for null. The
  // probe's tab uses the request's code; the others, the code last built. Builds the expression at
  // each place it could go and as each type it could be, until one works.
  setProbe(asked: ProbeRequest | null): ProbeResult | null {
    this.probeRequest = asked;
    if (!asked) {
      this.useProbe(null);
      this.freeProbeTargets();
      return null;
    }
    if (asked.tab === "canvas") {
      return {ok: false, message: "Select an expression in a shader tab."};
    }
    // While a picker drags, the expression is built with its uniform too, so it changes with it.
    const pick = this.pick?.pick ?? null;
    const request = {...pick ? pickedRequest(asked, pick, this.builtCode(pick.tab) ?? "") : asked, tab: asked.tab};
    const plan = planProbe(request.code, request.from, request.to);
    if (!plan.ok) {
      return plan;
    }
    const {code, buffers, shared} = pickedSources(this.sources, pick);
    // Shared code shows in the image if it reaches the function, or else the first buffer that does.
    const calls = new RegExp(`\\b(?:${sharedCallers(shared, plan.functionName).join("|")})\\s*\\(`);
    const caller = buffers.findIndex(b => uses(b, calls));
    const shader = request.tab !== "shared" ? request.tab : uses(code, calls) || caller < 0 ? "image" : caller;
    const own = shader === "image" ? code : buffers[shader] ?? "";
    let reason = "";
    const attempt = (site: Site, type: ProbeType | null) => {
      const variant = withProbe(request.code, site, plan.expression, type);
      const [c, s] = request.tab === "shared" ? [own, variant] : [variant, shared];
      // A build with no type only tests that some type works, so it isn't kept.
      const source = probeFragmentSource(c, buffers.length, s, pick?.type ?? null);
      const result = type === null ? this.link(source) : this.cachedLink(source);
      if (type === null) {
        reason ||= /ERROR:\s*\d+:\d+:\s*(.*)/.exec(result.log)?.[1]?.trim() ?? "";
      }
      return {built: result.program ? {program: result.program, code: userCode(c, s)} : null, log: result.log};
    };
    // At site `index`, the type that builds: `first`, the one the compiler names, or else each in turn.
    const buildAt = (index: number, first: ProbeType) => {
      const site = plan.sites[index]!;
      const guessed = attempt(site, first);
      if (guessed.built) return {...guessed.built, type: first};
      const named = typeFromError(guessed.log);
      if (named && named !== first) {
        const again = attempt(site, named).built;
        if (again) return {...again, type: named};
      }
      const any = attempt(site, null).built;
      if (!any) return null;
      this.deleteProgram(any.program);
      for (const type of plan.types) {
        const built = type !== first && type !== named ? attempt(site, type).built : null;
        if (built) return {...built, type};
      }
      return null;
    };
    const key = [request.tab, plan.functionName, plan.expression, plan.sites.length].join("\n");
    const cached = this.probeCache?.key === key ? this.probeCache : null;
    const order = plan.sites.map((_, i) => i);
    if (cached) {
      order.splice(cached.site, 1);
      order.unshift(cached.site);
    }
    for (const index of order) {
      const found = buildAt(index, index === cached?.site ? cached.type : plan.types[0]!);
      if (found) {
        this.probeCache = {key, site: index, type: found.type};
        this.useProbe({program: found.program, shader, type: found.type, code: found.code});
        return {
          ok: true, expression: plan.expression, type: found.type, shader, from: plan.from, to: plan.to,
          unmarked: this.probeFormat === "byte" && probeComponents(found.type) === 4,
        };
      }
    }
    if (!this.probe) {
      this.freeProbeTargets();
    }
    return {ok: false, message: "This selection doesn't work as a value here" + (reason ? `: ${reason}` : ".")};
  }

  // The probe's targets are full size, so they go when nothing shows; drawProbe and findRange make them again.
  private freeProbeTargets() {
    [this.probeTarget, this.rangeTarget].forEach(t => t && this.deleteTarget(t));
    this.probeTarget = null;
    this.rangeTarget = null;
  }

  private useProbe(probe: Probe | null) {
    this.probe = probe;
    this.programs.use([["probe", probe?.program ?? null]]);
    this.found = null;
    this.rangeAt = -Infinity;
    // A probed buffer draws each frame, with the buffers it reads, even if the image doesn't read them.
    const {buffers, shared} = this.sources;
    const needs = probe ? buffersUsed((probe.shader === "image" ? "" : `iBuffer${probe.shader} `) + probe.code,
      buffers.map(b => userCode(b, shared))) : [];
    const extra = needs.filter(i => !this.imageUsed.includes(i));
    if (extra.join() !== this.probeBuffers.join()) {
      // Those buffers start from frame 0, with the image, as they would in a build.
      for (const i of [...this.probeBuffers, ...extra]) {
        this.bufferTargets.get(i)?.forEach(t => this.deleteTarget(t));
        this.bufferTargets.delete(i);
      }
      for (const i of extra) {
        this.bufferTargets.set(i, [this.target(true), this.target(true)]);
      }
      this.probeRestart ||= extra.length > 0;
      this.probeBuffers = extra;
    }
    this.used = [...this.imageUsed, ...extra].sort((a, b) => a - b);
  }

  // Whether the probe has buffers to start from frame 0, so the steps should start again. Asking clears it.
  takeProbeRestart(): boolean {
    const restart = this.probeRestart;
    this.probeRestart = false;
    return restart;
  }

  // Draws the probe again from the last frame's state, without moving on a step.
  redrawProbe() {
    if (this.lastInputs) {
      this.drawProbe(this.lastInputs);
    }
    this.findRange(performance.now(), true);
    this.present();
  }

  // The probed shader draws again into the probe's target, reading what it read when it drew this frame.
  private drawProbe(inputs: FrameInputs) {
    const gl = this.gl;
    if (!this.probe || !this.targets) {
      return;
    }
    if (this.probeTarget?.width !== this.width || this.probeTarget.height !== this.height) {
      if (this.probeTarget) {
        gl.deleteFramebuffer(this.probeTarget.framebuffer);
        gl.deleteTexture(this.probeTarget.texture);
      }
      const target = this.probeFormat === "float" ? this.target(false, "float") : this.target(this.probeFormat === "half");
      this.probeTarget = {...target, width: this.width, height: this.height};
    }
    const shader = this.probe.shader;
    this.draw(this.probe.program, this.probeTarget, inputs, this.targets[1], shader === "image" ? undefined : shader);
    this.rangeStale = true;
  }

  // The range the probe's values show from black to full colour: 0 to 1, -1 to 1, or Auto.
  setRangeMode(mode: RangeMode) {
    this.rangeMode = mode;
    this.findRange(performance.now(), true);
    this.present();
  }

  // What Auto last found, while it's on and a probe shows.
  get foundRange(): FoundRange {
    return this.probe && this.rangeMode === "auto" ? this.found : null;
  }

  // Finds Auto's range again if the probe has drawn since, at most every RANGE_INTERVAL_MS unless
  // `now` is forced. Returns whether it changed, so the canvas should show it again.
  findRange(now: number, force = false): boolean {
    if (!this.probe || !this.probeTarget || this.rangeMode !== "auto" || !this.rangeStale ||
        (!force && now - this.rangeAt < RANGE_INTERVAL_MS)) {
      return false;
    }
    const gl = this.gl;
    const block = [Math.ceil(this.width / RANGE_BLOCKS), Math.ceil(this.height / RANGE_BLOCKS)];
    const [w, h] = [Math.ceil(this.width / block[0]!), Math.ceil(this.height / block[1]!)];
    if (this.rangeTarget?.width !== w || this.rangeTarget.height !== h) {
      if (this.rangeTarget) {
        this.deleteTarget(this.rangeTarget);
      }
      const target = this.probeFormat === "float" ? this.target(false, "float", w, h) :
        this.target(this.probeFormat === "half", undefined, w, h);
      this.rangeTarget = {...target, width: w, height: h};
    }
    const program = this.probeRangeProgram;
    gl.useProgram(program);
    gl.bindVertexArray(program.vao);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.rangeTarget.framebuffer);
    gl.activeTexture(gl.TEXTURE0 + PREV_FRAME_UNIT);
    gl.bindTexture(gl.TEXTURE_2D, this.probeTarget.texture);
    gl.uniform1i(this.uniform(program, "iTexture"), PREV_FRAME_UNIT);
    gl.uniform1i(this.uniform(program, "iCount"), probeComponents(this.probe.type));
    gl.uniform1i(this.uniform(program, "iBytes"), Number(this.probeFormat === "byte"));
    gl.uniform2i(this.uniform(program, "iBlock"), block[0]!, block[1]!);
    gl.viewport(0, 0, w, h);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    let blocks: ArrayLike<number>;
    if (this.probeFormat === "byte") {
      const bytes = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
      blocks = Array.from(bytes, b => b / 255);
    } else {
      blocks = new Float32Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.FLOAT, blocks as Float32Array);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.rangeStale = false;
    this.rangeAt = now;
    const found = combineBlocks(blocks);
    const changed = found?.[0] !== this.found?.[0] || found?.[1] !== this.found?.[1];
    this.found = found;
    return changed;
  }

  // The colour shown at a pixel, counted from the bottom left, and the probe's value there.
  readPixel(x: number, y: number): PixelReading | null {
    const gl = this.gl;
    if (!this.targets || x < 0 || y < 0 || x >= this.width || y >= this.height) {
      return null;
    }
    const bytes = new Uint8Array(4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.targets[0].framebuffer);
    gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
    let color: [number, number, number] = [bytes[0]! / 255, bytes[1]! / 255, bytes[2]! / 255];
    if (this.hasLayer && this.layerOverlay) {
      // The layer's frame goes over the image with premultiplied alpha, as present() draws it.
      this.layerReadFramebuffer ??= gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.layerReadFramebuffer);
      // Attached on each read, as setLayer replaces the texture.
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.canvasTexture, 0);
      const [lw, lh] = this.layerSize;
      gl.readPixels(Math.floor(x * lw / this.width), Math.floor(y * lh / this.height), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
      const alpha = bytes[3]! / 255;
      color = [0, 1, 2].map(i => color[i]! * (1 - alpha) + bytes[i]! / 255) as [number, number, number];
    }
    let value: number[] | null | undefined;
    if (this.probe && this.probeTarget) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.probeTarget.framebuffer);
      const count = probeComponents(this.probe.type);
      let raw: number[];
      let unreached: boolean;
      if (this.probeFormat === "byte") {
        gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
        raw = Array.from(bytes, b => b / 255);
        unreached = count < 4 && bytes[3] === 0;
      } else {
        const floats = new Float32Array(4);
        gl.readPixels(x, y, 1, 1, gl.RGBA, gl.FLOAT, floats);
        raw = Array.from(floats);
        unreached = raw.every(v => v === UNREACHED);
      }
      value = unreached ? null : raw.slice(0, count);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return {color, ...(value === undefined ? {} : {value})};
  }

  // The probed expression's type, while one is shown.
  get probeType(): ProbeType | null {
    return this.probe?.type ?? null;
  }

  // Returns whether the previous frame was cleared, as it is when the size changes, unless `resample`
  // asks to stretch the previous frame and buffers to the new size instead.
  setSize(width: number, height: number, resample = false): boolean {
    if (width === this.width && height === this.height && this.targets) {
      return false;
    }
    const [oldWidth, oldHeight] = [this.width, this.height];
    this.width = width;
    this.height = height;
    this.gl.canvas.width = width;
    this.gl.canvas.height = height;
    if (resample && this.targets) {
      this.targets = this.resample(this.targets, false, oldWidth, oldHeight);
      this.bufferTargets = new Map([...this.bufferTargets].map(([i, pair]) =>
        [i, this.resample(pair, true, oldWidth, oldHeight)]));
      this.targetSize = [width, height];
      return false;
    }
    this.clearTargets();
    return true;
  }

  // New targets at the current size, holding the old ones' pictures, which are deleted.
  private resample(pair: [Target, Target], isBuffer: boolean, oldWidth: number, oldHeight: number): [Target, Target] {
    const gl = this.gl;
    const resized = pair.map(old => {
      const target = this.target(isBuffer);
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, old.framebuffer);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, target.framebuffer);
      gl.blitFramebuffer(0, 0, oldWidth, oldHeight, 0, 0, this.width, this.height, gl.COLOR_BUFFER_BIT, gl.LINEAR);
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
      gl.deleteFramebuffer(old.framebuffer);
      gl.deleteTexture(old.texture);
      return target;
    });
    return [resized[0]!, resized[1]!];
  }

  // Starts again from a blank previous frame and blank buffers (after a new shader or size, or a rewind).
  // Targets already at this size are cleared rather than made again.
  clearTargets() {
    if (this.targetSize[0] !== this.width || this.targetSize[1] !== this.height) {
      this.freeTargets();
      this.targetSize = [this.width, this.height];
    }
    this.targets ??= [this.target(false), this.target(false)];
    const old = this.bufferTargets;
    this.bufferTargets = new Map(this.used.map(i => [i, old.get(i) ?? [this.target(true), this.target(true)]]));
    for (const [i, pair] of old) {
      if (!this.bufferTargets.has(i)) {
        pair.forEach(t => this.deleteTarget(t));
      }
    }
    const gl = this.gl;
    gl.clearColor(0, 0, 0, 0);
    for (const target of [...this.targets, ...[...this.bufferTargets.values()].flat()]) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  // Deletes the image's and buffers' targets, so they're made again at the current size.
  private freeTargets() {
    for (const pair of [this.targets, ...this.bufferTargets.values()]) {
      pair?.forEach(t => this.deleteTarget(t));
    }
    this.targets = null;
    this.bufferTargets = new Map();
  }

  private deleteTarget(target: Target) {
    this.gl.deleteFramebuffer(target.framebuffer);
    this.gl.deleteTexture(target.texture);
  }

  private target(isBuffer: boolean, format?: "float", width = this.width, height = this.height): Target {
    const gl = this.gl;
    const texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + PREV_FRAME_UNIT);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    if (format === "float") {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, width, height, 0, gl.RGBA, gl.FLOAT, null);
    } else if (isBuffer && this.floatBuffers) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, width, height, 0, gl.RGBA, gl.HALF_FLOAT, null);
    } else {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    }
    // Buffers blend between pixels when read between them, which simulations rely on; iPrevFrame doesn't.
    const filter = isBuffer ? gl.LINEAR : gl.NEAREST;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    const framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return {framebuffer, texture};
  }

  private blackTexture(): WebGLTexture {
    const gl = this.gl;
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
    return texture;
  }

  // Sets the image or video URL of each texture slot; they load in the background, black until then.
  setTextures(urls: readonly string[]) {
    urls.forEach((url, i) => {
      if (this.textureURLs[i] === url) {
        return;
      }
      this.textureURLs[i] = url;
      this.slotVideos[i] = null;
      if (isVideoURL(url)) {
        this.setVideo(i, url);
        return;
      }
      const cached = this.images.get(url);
      const state = this.imageStates.get(url);
      if (cached && state === "loaded") {
        this.upload(i, cached);
        return;
      }
      this.upload(i, null);
      if (state === "failed") {
        this.onTextureFailed(i, false);
      }
      if (cached) {
        return;  // Its one pair of listeners fills every slot that shows it.
      }
      const image = new Image();
      image.crossOrigin = "anonymous";
      this.images.set(url, image);
      this.imageStates.set(url, "loading");
      const settle = (ok: boolean) => {
        if (this.images.get(url) !== image) {
          return;  // No slot shows it any more.
        }
        this.imageStates.set(url, ok ? "loaded" : "failed");
        const slots = this.textureURLs.flatMap((slotURL, slot) => slotURL === url && !this.slotVideos[slot] ? [slot] : []);
        for (const slot of slots) {
          if (ok) {
            this.upload(slot, image);
          } else {
            this.onTextureFailed(slot, false);
          }
        }
        if (ok && slots.length > 0) {
          this.onTextureLoaded();
        }
      };
      image.addEventListener("load", () => settle(true), {once: true});
      image.addEventListener("error", () => settle(false), {once: true});
      image.src = url;
    });
    // Videos no slot shows any more stop playing.
    for (const [url, video] of this.videos) {
      if (!this.slotVideos.includes(video)) {
        video.dispose();
        this.videos.delete(url);
      }
    }
    for (const url of this.images.keys()) {
      if (!this.textureURLs.includes(url)) {
        this.images.delete(url);
        this.imageStates.delete(url);
      }
    }
  }

  private setVideo(slot: number, url: string) {
    let video = this.videos.get(url);
    if (!video) {
      const created = new VideoTexture(url, () => this.onVideoFrame());
      void created.whenLoaded().then(() => {
        if (created.failed) {
          this.slotVideos.forEach((video, i) => {
            if (video === created) {
              this.onTextureFailed(i, true);
            }
          });
        } else if (this.slotVideos.includes(created)) {
          this.onTextureLoaded();
        }
      });
      this.videos.set(url, created);
      video = created;
    }
    this.slotVideos[slot] = video;
    const gl = this.gl;
    const old = this.textureUnits[slot];
    if (old) {
      gl.deleteTexture(old);
    }
    const texture = this.blackTexture();
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    this.textureUnits[slot] = texture;
  }

  get hasVideos(): boolean {
    return this.slotVideos.some(video => video !== null);
  }

  // Keeps the videos with the preview's time: see VideoTexture.follow.
  followVideos(time: number, playing: boolean) {
    this.slotVideos.forEach(video => video?.follow(time, playing));
  }

  // Moves every video to exactly its frame at `time`, for an export.
  async seekVideos(time: number): Promise<void> {
    await Promise.all([...new Set(this.slotVideos)].map(video => video ? video.seek(time) : Promise.resolve()));
  }

  // Whether every video has loaded, or failed to, and none is moving to another time.
  get videosSettled(): boolean {
    return this.slotVideos.every(video => !video || video.settled);
  }

  // Whether every paused video shows exactly its frame at `time`.
  videosAt(time: number): boolean {
    return this.slotVideos.every(video => !video || video.isAt(time));
  }

  // The frame each video slot shows now, for the Canvas2D layer.
  videoFrames(): {slot: number; bitmap: ImageBitmap}[] {
    return this.slotVideos.flatMap((video, slot) => video ? [{slot, bitmap: video.frame()}] : []);
  }

  // Gives each video slot its video's current frame.
  private uploadVideos() {
    const gl = this.gl;
    this.slotVideos.forEach((video, slot) => {
      if (video?.ready) {
        gl.bindTexture(gl.TEXTURE_2D, this.textureUnits[slot]!);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video.video);
      }
    });
  }

  // Resolves once every texture slot's image or video has loaded or failed.
  async texturesReady(): Promise<void> {
    await Promise.all(this.textureURLs.map((url, i) => {
      const video = this.slotVideos[i];
      if (video) {
        return video.whenLoaded();
      }
      const image = this.images.get(url);
      if (!image || image.complete) {
        return Promise.resolve();
      }
      return new Promise<void>(resolve => {
        image.addEventListener("load", () => resolve(), {once: true});
        image.addEventListener("error", () => resolve(), {once: true});
      });
    }));
    // Load handlers upload in registration order, so give them a tick to run first.
    await new Promise(resolve => setTimeout(resolve, 0));
  }

  private upload(slot: number, image: HTMLImageElement | null) {
    const gl = this.gl;
    const old = this.textureUnits[slot];
    if (old) {
      gl.deleteTexture(old);
    }
    if (!image) {
      this.textureUnits[slot] = this.blackTexture();
      return;
    }
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    if (isPowerOf2(image.width) && isPowerOf2(image.height)) {
      gl.generateMipmap(gl.TEXTURE_2D);
    } else {
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    }
    this.textureUnits[slot] = texture;
  }

  private uniform(program: WebGLProgram, name: string): WebGLUniformLocation | null {
    let locations = this.uniforms.get(program);
    if (!locations) {
      locations = new Map();
      this.uniforms.set(program, locations);
    }
    if (!locations.has(name)) {
      locations.set(name, this.gl.getUniformLocation(program, name));
    }
    return locations.get(name) ?? null;
  }

  // Draws one shader into `output`. Every unit is bound afresh, so the texture being drawn into is
  // never also bound for reading, which WebGL refuses. Drawing buffer `again` once more after the
  // frame, it and the buffers after it read their frame before, as they did then.
  private draw(program: Program, output: Target, inputs: FrameInputs, prevFrame: Target, again?: number) {
    const gl = this.gl;
    gl.useProgram(program);
    gl.bindVertexArray(program.vao);
    gl.uniform1f(this.uniform(program, "iTime"), inputs.time);
    gl.uniform1f(this.uniform(program, "iDuration"), inputs.duration);
    gl.uniform2f(this.uniform(program, "iResolution"), this.width, this.height);
    gl.uniform1i(this.uniform(program, "iFrame"), inputs.frameIndex);
    gl.activeTexture(gl.TEXTURE0 + PREV_FRAME_UNIT);
    gl.bindTexture(gl.TEXTURE_2D, prevFrame.texture);
    gl.uniform1i(this.uniform(program, "iPrevFrame"), PREV_FRAME_UNIT);
    gl.activeTexture(gl.TEXTURE0 + CANVAS_UNIT);
    gl.bindTexture(gl.TEXTURE_2D, this.canvasTexture);
    gl.uniform1i(this.uniform(program, "iCanvas2D"), CANVAS_UNIT);
    this.textureUnits.forEach((texture, i) => {
      gl.activeTexture(gl.TEXTURE0 + TEXTURE_UNIT + i);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.uniform1i(this.uniform(program, "iTexture" + i), TEXTURE_UNIT + i);
    });
    this.bufferPrograms.forEach((_, i) => {
      // A buffer's latest frame: this frame's if it has already rendered, otherwise the last one.
      gl.activeTexture(gl.TEXTURE0 + BUFFER_UNIT + i);
      gl.bindTexture(gl.TEXTURE_2D, this.bufferTargets.get(i)?.[again !== undefined && i >= again ? 1 : 0].texture ?? null);
      gl.uniform1i(this.uniform(program, "iBuffer" + i), BUFFER_UNIT + i);
    });
    inputs.variableValues.forEach((value, i) => {
      gl.uniform1f(this.uniform(program, "iFloat" + i), value);
    });
    const pickLocation = this.pick && this.uniform(program, PICK_UNIFORM);
    if (this.pick && pickLocation) {
      const set = [gl.uniform1fv, gl.uniform2fv, gl.uniform3fv, gl.uniform4fv][this.pick.values.length - 1];
      set?.call(gl, pickLocation, this.pick.values);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, output.framebuffer);
    gl.viewport(0, 0, this.width, this.height);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  render(inputs: FrameInputs) {
    if (!this.program || !this.targets) {
      return;
    }
    this.uploadVideos();
    const [input, output] = this.targets;
    for (const i of this.used) {
      const [latest, older] = this.bufferTargets.get(i)!;
      this.draw(this.bufferPrograms[i]!, older, inputs, input);
      this.bufferTargets.set(i, [older, latest]);
    }
    this.draw(this.program, output, inputs, input);
    this.targets = [output, input];
    this.lastInputs = inputs;
    this.drawProbe(inputs);
    this.findRange(performance.now());
    this.present();
  }

  // Draws the last step again from the same state before it, so a value changed while paused shows
  // without moving the simulation on.
  redraw(inputs: FrameInputs) {
    if (!this.program || !this.targets || !this.lastInputs) {
      this.render(inputs);
      return;
    }
    this.uploadVideos();
    const [latest, previous] = this.targets;
    for (const i of this.used) {
      this.draw(this.bufferPrograms[i]!, this.bufferTargets.get(i)![0], inputs, previous, i);
    }
    this.draw(this.program, latest, inputs, previous);
    this.lastInputs = inputs;
    this.drawProbe(inputs);
    this.findRange(performance.now());
    this.present();
  }

  // Copies the image to the canvas, with the Canvas2D layer's frame over it if it's shown that way.
  present() {
    const gl = this.gl;
    if (!this.targets) {
      return;
    }
    if (this.probe && this.probeTarget && this.showProbe) {
      const program = this.showProbeProgram;
      gl.useProgram(program);
      gl.bindVertexArray(program.vao);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.activeTexture(gl.TEXTURE0 + PREV_FRAME_UNIT);
      gl.bindTexture(gl.TEXTURE_2D, this.probeTarget.texture);
      gl.uniform1i(this.uniform(program, "iTexture"), PREV_FRAME_UNIT);
      gl.uniform1i(this.uniform(program, "iCount"), probeComponents(this.probe.type));
      const [lo, hi] = rangeFor(this.rangeMode, this.found);
      gl.uniform2f(this.uniform(program, "iRange"), lo, hi);
      gl.uniform1i(this.uniform(program, "iBytes"), Number(this.probeFormat === "byte"));
      gl.viewport(0, 0, this.width, this.height);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      return;
    }
    gl.useProgram(this.copyProgram);
    gl.bindVertexArray(this.copyProgram.vao);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.activeTexture(gl.TEXTURE0 + PREV_FRAME_UNIT);
    gl.bindTexture(gl.TEXTURE_2D, this.targets[0].texture);
    gl.uniform1i(this.uniform(this.copyProgram, "iTexture"), PREV_FRAME_UNIT);
    gl.uniform2f(this.uniform(this.copyProgram, "iResolution"), this.width, this.height);
    gl.viewport(0, 0, this.width, this.height);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    if (this.hasLayer && this.layerOverlay) {
      gl.bindTexture(gl.TEXTURE_2D, this.canvasTexture);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.disable(gl.BLEND);
    }
  }

  // Shows the Canvas2D layer's newest frame without moving on a step. Shaders that read iCanvas2D draw
  // again with it, unless that would step their own state.
  refresh() {
    if (this.lastInputs && !this.shaderState && this.probeBuffers.length === 0) {
      this.render(this.lastInputs);
    } else {
      this.present();
    }
  }

  dispose() {
    this.videos.forEach(video => video.dispose());
    this.videos.clear();
    this.slotVideos = [];
    this.gl.deleteShader(this.vertexShader);
    this.gl.getExtension("WEBGL_lose_context")?.loseContext();
  }
}

function isPowerOf2(value: number): boolean {
  return (value & (value - 1)) === 0;
}
