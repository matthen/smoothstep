// Compiles the user's fragment shader and renders frames with WebGL 2. Each frame renders into one
// of two framebuffers, so the shader can read the previous frame as iPrevFrame, then copies it to
// the canvas.
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

// Everything before the user's code. Error line numbers are offset by its line count.
function shaderPrefix(): string {
  let uniforms = "uniform vec2 iResolution; uniform float iTime; uniform float iDuration; uniform int iFrame; ";
  uniforms += "uniform sampler2D iPrevFrame; ";
  for (let i = 0; i < NUM_TEXTURES; i++) {
    uniforms += `uniform sampler2D iTexture${i}; `;
  }
  for (let i = 0; i < NUM_VARIABLES; i++) {
    uniforms += `uniform float iFloat${i}; `;
  }
  return "#version 300 es\nprecision highp float;\n" + uniforms + "\n";
}

const SHADER_SUFFIX = "\nout vec4 smoothstepColor;\n" +
  "void main() { mainImage(smoothstepColor, gl_FragCoord.xy); smoothstepColor.a = 1.; }\n";

export function fragmentSource(code: string): string {
  return shaderPrefix() + code + SHADER_SUFFIX;
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
  unit: number;
}

export type CompileResult = {ok: true} | {ok: false; errors: LineError[]};

export class WebGLUnavailableError extends Error {}

export class Renderer {
  readonly gl: WebGL2RenderingContext;
  private program: WebGLProgram | null = null;
  private copyProgram: WebGLProgram;
  private uniforms = new Map<string, WebGLUniformLocation | null>();
  private targets: [Target, Target] | null = null;
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

  private link(fragmentSourceCode: string): {program: WebGLProgram | null; log: string; stage: "compile" | "link"} {
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
    (program as WebGLProgram & {vao: WebGLVertexArrayObject | null}).vao = vao;
    return {program, log: "", stage: "link"};
  }

  // Builds the user's shader. On failure the previous program keeps rendering.
  setCode(code: string): CompileResult {
    const result = this.link(fragmentSource(code));
    if (!result.program) {
      return {ok: false, errors: result.stage === "compile" ?
        parseErrors(result.log, code) : [{line: 0, message: result.log.trim() || "Couldn't link the shader."}]};
    }
    if (this.program) {
      this.gl.deleteProgram(this.program);
    }
    this.program = result.program;
    this.uniforms.clear();
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

  // Starts again from a blank previous frame (after a new shader or size, or a rewind).
  clearTargets() {
    const gl = this.gl;
    if (this.targets) {
      for (const t of this.targets) {
        gl.deleteFramebuffer(t.framebuffer);
        gl.deleteTexture(t.texture);
      }
    }
    this.targets = [this.target(0), this.target(1)];
  }

  private target(unit: number): Target {
    const gl = this.gl;
    const texture = gl.createTexture()!;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.width, this.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    const framebuffer = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return {framebuffer, texture, unit};
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
    const key = (program === this.program ? "u:" : "c:") + name;
    if (!this.uniforms.has(key)) {
      this.uniforms.set(key, this.gl.getUniformLocation(program, name));
    }
    return this.uniforms.get(key) ?? null;
  }

  render(inputs: FrameInputs) {
    const gl = this.gl;
    if (!this.program || !this.targets) {
      return;
    }
    const [input, output] = this.targets;
    this.targets = [output, input];
    const program = this.program;
    gl.useProgram(program);
    gl.bindVertexArray((program as WebGLProgram & {vao: WebGLVertexArrayObject | null}).vao);
    gl.uniform1f(this.uniform(program, "iTime"), inputs.time);
    gl.uniform1f(this.uniform(program, "iDuration"), inputs.duration);
    gl.uniform2f(this.uniform(program, "iResolution"), this.width, this.height);
    gl.uniform1i(this.uniform(program, "iFrame"), inputs.frameIndex);
    gl.activeTexture(gl.TEXTURE0 + input.unit);
    gl.bindTexture(gl.TEXTURE_2D, input.texture);
    gl.uniform1i(this.uniform(program, "iPrevFrame"), input.unit);
    this.textureUnits.forEach((texture, i) => {
      gl.activeTexture(gl.TEXTURE0 + 2 + i);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.uniform1i(this.uniform(program, "iTexture" + i), 2 + i);
    });
    inputs.variableValues.forEach((value, i) => {
      gl.uniform1f(this.uniform(program, "iFloat" + i), value);
    });
    // The output target's texture mustn't also be bound for sampling while it's rendered to.
    gl.activeTexture(gl.TEXTURE0 + output.unit);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, output.framebuffer);
    gl.viewport(0, 0, this.width, this.height);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    gl.useProgram(this.copyProgram);
    gl.bindVertexArray((this.copyProgram as WebGLProgram & {vao: WebGLVertexArrayObject | null}).vao);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.activeTexture(gl.TEXTURE0 + output.unit);
    gl.bindTexture(gl.TEXTURE_2D, output.texture);
    gl.uniform1i(this.uniform(this.copyProgram, "iTexture"), output.unit);
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
