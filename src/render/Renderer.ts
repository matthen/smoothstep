// Compiles the user's fragment shaders and renders frames with WebGL 2. Each frame first renders the
// buffers the image uses, in order, then the image. Every shader renders into one of a pair of
// framebuffers, so it can read its own previous frame: the image as iPrevFrame, and buffer k as
// iBuffer<k>. Then the image is copied to the canvas.
import { MAX_BUFFERS, NUM_TEXTURES, NUM_VARIABLES } from '../lib/document';
import type { LineError } from '../lib/types';
import { uses } from '../lib/glslCode';
import {
  PROBE_DECLARATIONS, PROBE_MAIN, planProbe, probeComponents, sharedCallers, typeFromError, UNREACHED, withProbe,
  type ProbeType, type Site,
} from './probe';

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

// Shows the value a probe kept for each pixel: a float as grey, a vec2 as red and green, and so on.
// Pixels it never ran for are striped, and a vec4's alpha shows over a checkerboard.
const SHOW_PROBE_SHADER = `#version 300 es
precision highp float;
uniform sampler2D iTexture;
uniform int iCount;
uniform bool iSigned;
uniform bool iBytes;
out vec4 fragColor;
void main() {
  vec4 v = texelFetch(iTexture, ivec2(gl_FragCoord.xy), 0);
  // Bytes clip the marker to 0, so only a value with an alpha of 1 can be told from it.
  if (iBytes ? iCount < 4 && v.a == 0. : all(equal(v, vec4(${UNREACHED}.)))) {
    float stripe = mod(floor((gl_FragCoord.x + gl_FragCoord.y) / 8.), 2.);
    fragColor = vec4(mix(vec3(0.16, 0.16, 0.21), vec3(0.27, 0.28, 0.35), stripe), 1.);
    return;
  }
  if (iSigned) {
    v = v * 0.5 + 0.5;
  }
  vec3 c = clamp(iCount == 1 ? v.rrr : iCount == 2 ? vec3(v.rg, 0.) : v.rgb, 0., 1.);
  if (iCount == 4) {
    vec2 cell = floor(gl_FragCoord.xy / 8.);
    c = mix(vec3(mod(cell.x + cell.y, 2.) == 0. ? 0.3 : 0.5), c, clamp(v.a, 0., 1.));
  }
  fragColor = vec4(c, 1.);
}
`;

// Everything before the user's code, with an iBuffer uniform for each of the animation's buffers.
// It's always three lines, so error line numbers are offset by the same amount.
function shaderPrefix(numBuffers = 0): string {
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

export function fragmentSource(code: string, numBuffers = 0, isBuffer = false, shared = ""): string {
  return shaderPrefix(numBuffers) + userCode(code, shared) + shaderSuffix(isBuffer);
}

// A shader that outputs the value its probe kept in place of its colour.
function probeFragmentSource(code: string, numBuffers: number, shared: string): string {
  return shaderPrefix(numBuffers).slice(0, -1) + PROBE_DECLARATIONS + "\n" + userCode(code, shared) +
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

// Turns a WebGL info log into errors on lines of the user's code (0-based, clamped to the code).
export function parseErrors(log: string, code: string): LineError[] {
  const offset = shaderPrefix().split("\n").length;  // 1-based line number of the code's first line
  const lastLine = code.split("\n").length - 1;
  const errors: LineError[] = [];
  for (const match of log.matchAll(/ERROR:\s*\d+:(\d+):\s*(.*)/g)) {
    const line = Number(match[1]) - offset;
    errors.push({line: Math.max(0, Math.min(line, lastLine)), message: (match[2] ?? "").trim()});
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
  // Whether the probe's values are shown from -1 to 1 rather than 0 to 1.
  probeSigned = false;
  // Off while a thumbnail is taken.
  showProbe = true;
  // The code as last built, and the buffers the image needs without the probe.
  private sources: {code: string; buffers: readonly string[]; shared: string} = {code: "", buffers: [], shared: ""};
  private imageUsed: number[] = [];
  // The buffers drawn only for the probe, and whether they've just started.
  private probeBuffers: number[] = [];
  private probeRestart = false;
  // The site and type that last built for an expression, tried first when the code builds again.
  private probeCache: {key: string; site: number; type: ProbeType} | null = null;
  private layerSize: [number, number] = [1, 1];
  private uniforms = new WeakMap<WebGLProgram, Map<string, WebGLUniformLocation | null>>();
  // [last frame, the one before], for the image and for each buffer in use.
  private targets: [Target, Target] | null = null;
  private bufferTargets = new Map<number, [Target, Target]>();
  // Buffers hold half floats where the browser can render to them, and bytes otherwise.
  private floatBuffers: boolean;
  private width = 1;
  private height = 1;
  private textureUnits: WebGLTexture[] = [];
  private images = new Map<string, HTMLImageElement>();
  private textureURLs: string[] = [];
  onTextureLoaded: () => void = () => {};

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl2", {antialias: false, preserveDrawingBuffer: false});
    if (!gl) {
      throw new WebGLUnavailableError("WebGL 2 isn't available");
    }
    this.gl = gl;
    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
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
    const vertex = this.compile(gl.VERTEX_SHADER, VERTEX_SHADER);
    const program = gl.createProgram();
    gl.attachShader(program, vertex.shader!);
    gl.attachShader(program, fragment.shader);
    gl.linkProgram(program);
    gl.deleteShader(vertex.shader);
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

  // Builds the image's shader and the buffers'. If any fails, the previous ones keep rendering.
  setCode(code: string, buffers: readonly string[] = [], shared = ""): CompileResult {
    const sources: [ShaderId, string][] = [["image", code], ...buffers.map((c, i): [ShaderId, string] => [i, c])];
    const programs: Program[] = [];
    for (const [shader, source] of sources) {
      const result = this.link(fragmentSource(source, buffers.length, shader !== "image", shared));
      if (!result.program) {
        programs.forEach(p => this.deleteProgram(p));
        if (result.stage === "link") {
          return {ok: false, shader, errors: [{line: 0, message: result.log.trim() || "Couldn't link the shader."}]};
        }
        const located = locateErrors(parseErrors(result.log, userCode(source, shared)), shared);
        return located.inShared ? {ok: false, shader: "shared", errors: located.errors} :
          {ok: false, shader, errors: markMissingMainImage(located.errors, source, shared)};
      }
      programs.push(result.program);
    }
    [this.program, ...this.bufferPrograms].forEach(p => p && this.deleteProgram(p));
    this.program = programs[0]!;
    this.bufferPrograms = programs.slice(1);
    this.sources = {code, buffers, shared};
    this.imageUsed = buffersUsed(userCode(code, shared), buffers.map(b => userCode(b, shared)));
    this.used = this.imageUsed;
    this.probeBuffers = [];
    this.shaderState = this.used.length > 0 || uses(userCode(code, shared), /\biPrevFrame\b/);
    this.clearTargets();
    this.useProbe(null);
    return {ok: true};
  }

  // Shows the expression `request` selects in place of the image, or the image again for null. The
  // probe's tab uses the request's code; the others, the code last built. Builds the expression at
  // each place it could go and as each type it could be, until one works.
  setProbe(request: ProbeRequest | null): ProbeResult | null {
    if (!request) {
      this.useProbe(null);
      return null;
    }
    if (request.tab === "canvas") {
      return {ok: false, message: "Select an expression in a shader tab."};
    }
    const plan = planProbe(request.code, request.from, request.to);
    if (!plan.ok) {
      return plan;
    }
    const {code, buffers, shared} = this.sources;
    // Shared code shows in the image if it reaches the function, or else the first buffer that does.
    const calls = new RegExp(`\\b(?:${sharedCallers(shared, plan.functionName).join("|")})\\s*\\(`);
    const caller = buffers.findIndex(b => uses(b, calls));
    const shader = request.tab !== "shared" ? request.tab : uses(code, calls) || caller < 0 ? "image" : caller;
    const own = shader === "image" ? code : buffers[shader] ?? "";
    let reason = "";
    const attempt = (site: Site, type: ProbeType | null) => {
      const variant = withProbe(request.code, site, plan.expression, type);
      const [c, s] = request.tab === "shared" ? [own, variant] : [variant, shared];
      const result = this.link(probeFragmentSource(c, buffers.length, s));
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
    return {ok: false, message: "This selection doesn't work as a value here" + (reason ? `: ${reason}` : ".")};
  }

  private useProbe(probe: Probe | null) {
    if (this.probe) {
      this.deleteProgram(this.probe.program);
    }
    this.probe = probe;
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
      const layer = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, layer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.canvasTexture, 0);
      const [lw, lh] = this.layerSize;
      gl.readPixels(Math.floor(x * lw / this.width), Math.floor(y * lh / this.height), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
      gl.deleteFramebuffer(layer);
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
  clearTargets() {
    for (const pair of [this.targets, ...this.bufferTargets.values()]) {
      pair?.forEach(t => this.deleteTarget(t));
    }
    this.targets = [this.target(false), this.target(false)];
    this.bufferTargets = new Map(this.used.map(i => [i, [this.target(true), this.target(true)]]));
  }

  private deleteTarget(target: Target) {
    this.gl.deleteFramebuffer(target.framebuffer);
    this.gl.deleteTexture(target.texture);
  }

  private target(isBuffer: boolean, format?: "float"): Target {
    const gl = this.gl;
    const texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + PREV_FRAME_UNIT);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    if (format === "float") {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, this.width, this.height, 0, gl.RGBA, gl.FLOAT, null);
    } else if (isBuffer && this.floatBuffers) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, this.width, this.height, 0, gl.RGBA, gl.HALF_FLOAT, null);
    } else {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.width, this.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
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

  // Sets the image URL of each texture slot; images load in the background, black until then.
  setTextures(urls: readonly string[]) {
    urls.forEach((url, i) => {
      if (this.textureURLs[i] === url) {
        return;
      }
      this.textureURLs[i] = url;
      const cached = this.images.get(url);
      if (cached?.complete && cached.naturalWidth) {
        this.upload(i, cached);
        return;
      }
      this.upload(i, null);
      const image = cached ?? new Image();
      if (!cached) {
        image.crossOrigin = "anonymous";
        image.src = url;
        this.images.set(url, image);
      }
      image.addEventListener("load", () => {
        if (this.textureURLs[i] === url) {
          this.upload(i, image);
          this.onTextureLoaded();
        }
      }, {once: true});
    });
  }

  // Resolves once every texture slot's image has loaded or failed.
  async texturesReady(): Promise<void> {
    await Promise.all(this.textureURLs.map(url => {
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
    gl.bindFramebuffer(gl.FRAMEBUFFER, output.framebuffer);
    gl.viewport(0, 0, this.width, this.height);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  render(inputs: FrameInputs) {
    if (!this.program || !this.targets) {
      return;
    }
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
      gl.uniform1i(this.uniform(program, "iSigned"), Number(this.probeSigned));
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
    this.gl.getExtension("WEBGL_lose_context")?.loseContext();
  }
}

function isPowerOf2(value: number): boolean {
  return (value & (value - 1)) === 0;
}
