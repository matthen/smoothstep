// Compiles the user's fragment shaders and renders frames with WebGL 2. Each frame first renders the
// buffers the image uses, in order, then the image. Every shader renders into one of a pair of
// framebuffers, so it can read its own previous frame: the image as iPrevFrame, and buffer k as
// iBuffer<k>. Then the image is copied to the canvas.
import { NUM_TEXTURES, NUM_VARIABLES } from '../lib/document';
import type { LineError } from '../lib/types';

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

// Everything before the user's code, with an iBuffer uniform for each of the animation's buffers.
// It's always three lines, so error line numbers are offset by the same amount.
function shaderPrefix(numBuffers = 0): string {
  let uniforms = "uniform vec2 iResolution; uniform float iTime; uniform float iDuration; uniform int iFrame; ";
  uniforms += "uniform sampler2D iPrevFrame; ";
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

// A tab of code: the image, buffer k, or the code they share. Also which one an error is in.
export type ShaderId = "image" | "shared" | number;

export type CompileResult = {ok: true} | {ok: false; shader: ShaderId; errors: LineError[]};

// Texture units: the previous frame, then the texture slots, then the buffers.
const PREV_FRAME_UNIT = 0;
const TEXTURE_UNIT = 1;
const BUFFER_UNIT = TEXTURE_UNIT + NUM_TEXTURES;  // Up to 13 units in all; WebGL 2 promises 16.

type Program = WebGLProgram & {vao: WebGLVertexArrayObject | null};

export class WebGLUnavailableError extends Error {}

export class Renderer {
  readonly gl: WebGL2RenderingContext;
  private program: Program | null = null;
  private bufferPrograms: Program[] = [];
  // The buffers the image needs, in the order they render.
  private used: number[] = [];
  private copyProgram: Program;
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
    // Some phones can only render to half floats, which is all the buffers need.
    this.floatBuffers = gl.getExtension("EXT_color_buffer_float") !== null ||
      gl.getExtension("EXT_color_buffer_half_float") !== null;
    // Uploaded images are flipped so texture coordinates start at the bottom left, as in GL.
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    for (let i = 0; i < NUM_TEXTURES; i++) {
      this.textureUnits.push(this.blackTexture());
    }
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
    const program = gl.createProgram()!;
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
        programs.forEach(p => this.gl.deleteProgram(p));
        if (result.stage === "link") {
          return {ok: false, shader, errors: [{line: 0, message: result.log.trim() || "Couldn't link the shader."}]};
        }
        const located = locateErrors(parseErrors(result.log, userCode(source, shared)), shared);
        return {ok: false, shader: located.inShared ? "shared" : shader, errors: located.errors};
      }
      programs.push(result.program);
    }
    [this.program, ...this.bufferPrograms].forEach(p => p && this.gl.deleteProgram(p));
    this.program = programs[0]!;
    this.bufferPrograms = programs.slice(1);
    this.used = buffersUsed(userCode(code, shared), buffers.map(b => userCode(b, shared)));
    this.clearTargets();
    return {ok: true};
  }

  // Returns whether the size changed, which clears the previous frame.
  setSize(width: number, height: number): boolean {
    if (width === this.width && height === this.height && this.targets) {
      return false;
    }
    this.width = width;
    this.height = height;
    this.gl.canvas.width = width;
    this.gl.canvas.height = height;
    this.clearTargets();
    return true;
  }

  // Starts again from a blank previous frame and blank buffers (after a new shader or size, or a rewind).
  clearTargets() {
    const gl = this.gl;
    for (const pair of [this.targets, ...this.bufferTargets.values()]) {
      for (const t of pair ?? []) {
        gl.deleteFramebuffer(t.framebuffer);
        gl.deleteTexture(t.texture);
      }
    }
    this.targets = [this.target(false), this.target(false)];
    this.bufferTargets = new Map(this.used.map(i => [i, [this.target(true), this.target(true)]]));
  }

  private target(isBuffer: boolean): Target {
    const gl = this.gl;
    const texture = gl.createTexture()!;
    gl.activeTexture(gl.TEXTURE0 + PREV_FRAME_UNIT);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    if (isBuffer && this.floatBuffers) {
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
    const framebuffer = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return {framebuffer, texture};
  }

  private blackTexture(): WebGLTexture {
    const gl = this.gl;
    const texture = gl.createTexture()!;
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
        return undefined;
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
    const texture = gl.createTexture()!;
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
  // never also bound for reading, which WebGL refuses.
  private draw(program: Program, output: Target, inputs: FrameInputs, prevFrame: Target) {
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
    this.textureUnits.forEach((texture, i) => {
      gl.activeTexture(gl.TEXTURE0 + TEXTURE_UNIT + i);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.uniform1i(this.uniform(program, "iTexture" + i), TEXTURE_UNIT + i);
    });
    this.bufferPrograms.forEach((_, i) => {
      // A buffer's latest frame: this frame's if it has already rendered, otherwise the last one.
      gl.activeTexture(gl.TEXTURE0 + BUFFER_UNIT + i);
      gl.bindTexture(gl.TEXTURE_2D, this.bufferTargets.get(i)?.[0].texture ?? null);
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
    const gl = this.gl;
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

    gl.useProgram(this.copyProgram);
    gl.bindVertexArray(this.copyProgram.vao);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.activeTexture(gl.TEXTURE0 + PREV_FRAME_UNIT);
    gl.bindTexture(gl.TEXTURE_2D, output.texture);
    gl.uniform1i(this.uniform(this.copyProgram, "iTexture"), PREV_FRAME_UNIT);
    gl.uniform2f(this.uniform(this.copyProgram, "iResolution"), this.width, this.height);
    gl.viewport(0, 0, this.width, this.height);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  dispose() {
    this.gl.getExtension("WEBGL_lose_context")?.loseContext();
  }
}

function isPowerOf2(value: number): boolean {
  return (value & (value - 1)) === 0;
}
