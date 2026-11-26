import { describe, expect, it } from 'vitest';

import { exportSize, frameCount } from '../export/exportVideo';
import { drawingSize, fitCanvas, SlowFrames } from './layout';
import { buffersUsed, fragmentSource, locateErrors, markMissingMainImage, PAST_END_ERROR, parseErrors } from './Renderer';

describe("parseErrors", () => {
  const code = "void mainImage(out vec4 c, in vec2 p) {\n  c = vec4(1.);\n  oops;\n}";

  it("maps WebGL error lines back to lines of the user's code", () => {
    const source = fragmentSource(code).split("\n");
    const glLine = source.indexOf("  oops;") + 1;  // WebGL counts from 1
    expect(parseErrors(`ERROR: 0:${glLine}: 'oops' : undeclared identifier\n`, code))
      .toEqual([{line: 2, message: "'oops' : undeclared identifier"}]);
  });

  it("clamps lines outside the code, and keeps logs it can't parse", () => {
    expect(parseErrors("ERROR: 0:1: '' : too early\n", code)[0]!.line).toBe(0);
    expect(parseErrors("Something odd", code)).toEqual([{line: 0, message: "Something odd"}]);
  });

  it("puts errors in the app's code after the user's on its last line that isn't blank, as one plain error", () => {
    const end = fragmentSource(code + "\n\n").split("\n").length;
    const log = `ERROR: 0:${end - 1}: 'out' : invalid qualifier combination\nERROR: 0:${end}: '{' : syntax error\n`;
    expect(parseErrors(log, code + "\n\n")).toEqual([{line: 3, message: PAST_END_ERROR}]);
    // Except a call to a missing mainImage, which has an error of its own.
    expect(parseErrors(`ERROR: 0:${end}: 'mainImage' : no matching overloaded function found\n`, code)[0]!.message)
      .toMatch(/mainImage/);
  });
});

describe("markMissingMainImage", () => {
  const log = [{line: 1, message: "'mainImage' : no matching overloaded function found"}];

  it("says a tab without mainImage needs one, under its last line, keeping other errors", () => {
    const code = "// Only a comment: void mainImage(\nfloat f() { return oops; }";
    const errors = markMissingMainImage([{line: 1, message: "'oops' : undeclared identifier"}, ...log], code, "");
    expect(errors.map(e => e.missing)).toEqual([undefined, "mainImage"]);
    expect(errors[1]!.line).toBe(1);
  });

  it("leaves errors alone when the tab or the shared code has mainImage", () => {
    expect(markMissingMainImage(log, "void mainImage(out vec4 c, in vec2 p) { oops; }", "")).toBe(log);
    expect(markMissingMainImage(log, "", "void  mainImage (out vec4 c, in vec2 p) {}")).toBe(log);
  });
});

describe("sizes", () => {
  it("fits the canvas in its container, at most 1280", () => {
    expect(fitCanvas(500, 400, [1, 1])).toEqual([400, 400]);
    expect(fitCanvas(480, 800, [16, 9])).toEqual([480, 270]);
    expect(fitCanvas(4000, 4000, [3, 4])).toEqual([960, 1280]);
  });

  it("draws the preview at the screen's pixel ratio, up to 2× and 2048 pixels, or 1× when asked", () => {
    expect(drawingSize(400, 300, 2)).toEqual([800, 600]);
    expect(drawingSize(400, 300, 3)).toEqual([800, 600]);
    expect(drawingSize(400, 300, 1.5)).toEqual([600, 450]);
    expect(drawingSize(1280, 720, 2)).toEqual([2048, 1152]);
    expect(drawingSize(400, 300, 1)).toEqual([400, 300]);
    expect(drawingSize(400, 300, 0.5)).toEqual([400, 300]);
    expect(drawingSize(400, 300, 2, true)).toEqual([400, 300]);
  });

  it("calls the frame rate slow only once it has stayed slow for a few seconds", () => {
    const watch = (frameMs: number, seconds: number, frames = new SlowFrames(), start = 0) => {
      for (let t = start; t <= start + seconds * 1000; t += frameMs) frames.frame(t);
      return frames;
    };
    expect(watch(1000 / 60, 10).slow).toBe(false);
    expect(watch(1000 / 20, 1).slow).toBe(false);
    expect(watch(1000 / 20, 4).slow).toBe(true);
    // A pause between frames isn't slowness, and starts the count again.
    const paused = watch(1000 / 20, 2);
    paused.idle();
    expect(watch(1000 / 20, 2, paused, 60_000).slow).toBe(false);
    // Nor is a quick patch after a slow one.
    const recovered = watch(1000 / 60, 3, watch(1000 / 20, 2), 2050);
    expect(recovered.slow).toBe(false);
  });

  it("gives exports even dimensions", () => {
    expect(exportSize({width: 511, fps: 30, type: "webm"}, [16, 9])).toEqual([512, 288]);
    expect(exportSize({width: 100, fps: 30, type: "gif"}, [3, 4])).toEqual([100, 134]);
    expect(frameCount(12, 30)).toBe(360);
  });
});

describe("buffers and shared code", () => {
  it("declares a sampler for each buffer, and keeps a buffer's alpha but not the image's", () => {
    const image = fragmentSource("void mainImage(out vec4 c, in vec2 p) {}", 2);
    expect(image).toContain("uniform sampler2D iBuffer0; uniform sampler2D iBuffer1;");
    expect(image).not.toContain("iBuffer2");
    expect(image).toContain("smoothstepColor.a = 1.");
    expect(fragmentSource("void mainImage(out vec4 c, in vec2 p) {}", 2, true)).not.toContain(".a = 1.");
  });

  it("puts the shared code before each shader's own, keeping the prefix three lines", () => {
    const source = fragmentSource("void mainImage(out vec4 c, in vec2 p) {}", 0, false, "float f() { return 1.; }");
    const lines = source.split("\n");
    expect(lines[3]).toBe("float f() { return 1.; }");
    expect(lines[4]).toBe("void mainImage(out vec4 c, in vec2 p) {}");
  });

  it("works out which buffers the image needs, through the buffers it reads", () => {
    const buffers = ["texture(iBuffer2, uv)", "nothing", "texture(iBuffer2, uv)", "texture(iBuffer0, uv)"];
    expect(buffersUsed("texture(iBuffer3, uv)", buffers)).toEqual([0, 2, 3]);
    expect(buffersUsed("no buffers", buffers)).toEqual([]);
    // Reading a buffer that doesn't exist doesn't count.
    expect(buffersUsed("texture(iBuffer7, uv)", buffers)).toEqual([]);
  });

  it("puts errors in the shared code or in the shader's own code", () => {
    const shared = "float a;\nfloat b;";
    expect(locateErrors([{line: 1, message: "in shared"}, {line: 3, message: "own"}], shared))
      .toEqual({inShared: true, errors: [{line: 1, message: "in shared"}]});
    expect(locateErrors([{line: 3, message: "own"}], shared))
      .toEqual({inShared: false, errors: [{line: 1, message: "own"}]});
    expect(locateErrors([{line: 0, message: "own"}], "")).toEqual({inShared: false, errors: [{line: 0, message: "own"}]});
  });
});
