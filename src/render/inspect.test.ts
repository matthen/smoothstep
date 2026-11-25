import { describe, expect, it } from 'vitest';

import { formatNumber, formatValue, hexColor, pixelAt } from './inspect';

describe("formatValue", () => {
  it("writes a float with three decimals, and tiny or huge ones as exponents", () => {
    expect(formatValue([0.25], "float")).toBe("0.250");
    expect(formatValue([-1.5], "float")).toBe("-1.500");
    expect(formatNumber(0.00002)).toBe("2.00e-5");
    expect(formatNumber(0)).toBe("0.000");
    expect(formatNumber(Infinity)).toBe("inf");
  });

  it("writes a vector as its constructor", () => {
    expect(formatValue([0.1, 0.2, 0.3], "vec3")).toBe("vec3(0.100, 0.200, 0.300)");
  });

  it("writes whole numbers and bools as GLSL does", () => {
    expect(formatValue([3], "int")).toBe("3");
    expect(formatValue([1, 2], "ivec2")).toBe("ivec2(1, 2)");
    expect(formatValue([1], "bool")).toBe("true");
    expect(formatValue([0], "bool")).toBe("false");
  });
});

describe("hexColor", () => {
  it("rounds and clamps each channel", () => {
    expect(hexColor([1, 0.5, 0])).toBe("#ff8000");
    expect(hexColor([2, -1, 0.2, 1])).toBe("#ff0033");
  });
});

describe("pixelAt", () => {
  it("counts from the bottom left, at the drawing's resolution", () => {
    expect(pixelAt(0, 0, 100, 50, [200, 100])).toEqual([0, 99]);
    expect(pixelAt(99.9, 49.9, 100, 50, [200, 100])).toEqual([199, 0]);
    expect(pixelAt(50, 25, 100, 50, [200, 100])).toEqual([100, 50]);
  });

  it("stays on the canvas at its edges", () => {
    expect(pixelAt(100, 50, 100, 50, [200, 100])).toEqual([199, 0]);
  });
});
