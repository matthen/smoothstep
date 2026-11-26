import { describe, expect, it } from 'vitest';

import { formatLog } from './formatLog';

describe("formatLog", () => {
  it("prints strings as they are and joins arguments with spaces", () => {
    expect(formatLog(["frame", 12, "of", 60])).toBe("frame 12 of 60");
    expect(formatLog([""])).toBe("");
  });

  it("prints numbers and other primitives as devtools does", () => {
    expect(formatLog([0.1 + 0.2, -0, NaN, Infinity])).toBe("0.30000000000000004 -0 NaN Infinity");
    expect(formatLog([12n, true, null, undefined])).toBe("12n true null undefined");
    expect(formatLog([Symbol("id")])).toBe("Symbol(id)");
  });

  it("quotes strings inside arrays and objects, but not at the top", () => {
    expect(formatLog([["a", 1]])).toBe('["a", 1]');
    expect(formatLog([{name: "Ada", "two words": 2}])).toBe('{name: "Ada", "two words": 2}');
  });

  it("names class instances, typed arrays, maps and sets", () => {
    class Particle {
      x = 1;
      y = 2;
    }
    expect(formatLog([new Particle()])).toBe("Particle {x: 1, y: 2}");
    expect(formatLog([new Float32Array([1, 0.5])])).toBe("Float32Array(2) [1, 0.5]");
    expect(formatLog([new Map([["a", 1]])])).toBe('Map(1) {"a" => 1}');
    expect(formatLog([new Set([1, 2])])).toBe("Set(2) {1, 2}");
  });

  it("shows functions and errors briefly", () => {
    function draw() {}
    expect(formatLog([draw])).toBe("ƒ draw()");
    expect(formatLog([new TypeError("bad")])).toBe("TypeError: bad");
  });

  it("shortens long arrays, many keys and deep nesting", () => {
    const long = Array.from({length: 100}, (_, i) => i);
    expect(formatLog([long])).toBe(`[${long.slice(0, 20).join(", ")}, …80 more]`);
    const many = Object.fromEntries(Array.from({length: 15}, (_, i) => ["k" + i, i]));
    expect(formatLog([many])).toMatch(/k11: 11, …3 more\}$/);
    expect(formatLog([{a: {b: {c: {d: 1}}}}])).toBe("{a: {b: {…}}}");
    expect(formatLog([[[[1]]]])).toBe("[[[…]]]");
  });

  it("marks an object that holds itself instead of looping", () => {
    const node: {name: string; self?: unknown} = {name: "loop"};
    node.self = node;
    expect(formatLog([node])).toBe('{name: "loop", self: [Circular]}');
  });

  it("cuts off very long output", () => {
    const text = formatLog(["x".repeat(5000)]);
    expect(text.length).toBeLessThan(1100);
    expect(text.endsWith("…")).toBe(true);
  });

  it("fills format specifiers from the arguments after the first", () => {
    expect(formatLog(["%s is %d years, %f%%", "Ada", 36.6, 0.5])).toBe("Ada is 36 years, 0.5%");
    expect(formatLog(["%cstyled", "color: red", "after"])).toBe("styled after");
    expect(formatLog(["%o", {a: 1}])).toBe("{a: 1}");
    expect(formatLog(["100%"])).toBe("100%");
  });

  it("copes with getters that throw", () => {
    const tricky = {get boom(): number { throw new Error("no"); }, fine: 1};
    expect(formatLog([tricky])).toBe("{boom: ?, fine: 1}");
  });
});
