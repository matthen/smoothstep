import { describe, expect, it } from 'vitest';

import { exportSize, frameCount } from '../export/exportVideo';
import { fitCanvas } from './layout';
import { fragmentSource, parseErrors } from './Renderer';

describe("parseErrors", () => {
  const code = "void mainImage(out vec4 c, in vec2 p) {\n  c = vec4(1.);\n  oops;\n}";

  it("maps WebGL error lines back to lines of the user's code", () => {
    const source = fragmentSource(code).split("\n");
    const glLine = source.indexOf("  oops;") + 1;  // WebGL counts from 1
    expect(parseErrors(`ERROR: 0:${glLine}: 'oops' : undeclared identifier\n`, code))
      .toEqual([{line: 2, message: "'oops' : undeclared identifier"}]);
  });

  it("clamps lines outside the code, and keeps logs it can't parse", () => {
    expect(parseErrors("ERROR: 0:999: 'x' : bad\n", code)[0]!.line).toBe(3);
    expect(parseErrors("ERROR: 0:1: '' : too early\n", code)[0]!.line).toBe(0);
    expect(parseErrors("Something odd", code)).toEqual([{line: 0, message: "Something odd"}]);
  });
});

describe("sizes", () => {
  it("fits the canvas in its container, at most 1280", () => {
    expect(fitCanvas(500, 400, [1, 1])).toEqual([400, 400]);
    expect(fitCanvas(480, 800, [16, 9])).toEqual([480, 270]);
    expect(fitCanvas(4000, 4000, [3, 4])).toEqual([960, 1280]);
  });

  it("gives exports even dimensions", () => {
    expect(exportSize({width: 511, fps: 30, type: "webm"}, [16, 9])).toEqual([512, 288]);
    expect(exportSize({width: 100, fps: 30, type: "gif"}, [3, 4])).toEqual([100, 134]);
    expect(frameCount(12, 30)).toBe(360);
  });
});
