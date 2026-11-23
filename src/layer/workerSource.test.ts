import { describe, expect, it } from 'vitest';

import { errorFromEvent, errorFromStack, workerSource } from './workerSource';

const CODE = "function draw(ctx) {\n  clear(ctx);\n  oops();\n}";

// The line of the worker's script (counting from 1) that holds the code's line `line` (from 0).
function scriptLine(source: string, line: number): number {
  return source.split("\n").indexOf(CODE.split("\n")[line]!) + 1;
}

describe("workerSource", () => {
  const library = {name: "planck", code: "module.exports = {};\n// a second line"};
  const source = workerSource(CODE, [library]);

  it("puts the code in the script after the runtime and libraries", () => {
    const script = source.source;
    expect(script).toContain(CODE);
    expect(script.indexOf(library.code)).toBeLessThan(script.indexOf(CODE));
    expect(source.lines).toBe(4);
  });

  it("maps a stack's lines in the script back to the code's, in each browser's format", () => {
    const line = scriptLine(source.source, 2);
    const helper = 5;  // A line of the runtime, before the code.
    const message = "oops is not defined";
    for (const stack of [
      `ReferenceError: oops is not defined\n    at draw (blob:null/1234:${line}:3)\n    at blob:null/1234:${helper}:9`,
      `draw@blob:null/1234:${line}:3\nhandle@blob:null/1234:${helper}:9`,
    ]) {
      expect(errorFromStack({message, stack, line: null}, source)).toEqual({line: 2, message});
    }
  });

  it("puts an error inside a helper or library on the line of the code that called it", () => {
    const line = scriptLine(source.source, 1);
    const stack = `TypeError: bad\n    at clear (blob:null/1:12:1)\n    at draw (blob:null/1:${line}:3)`;
    expect(errorFromStack({message: "bad", stack, line: null}, source).line).toBe(1);
  });

  it("falls back to the error's own line, then the first line", () => {
    const line = scriptLine(source.source, 3);
    expect(errorFromStack({message: "x", stack: "", line}, source).line).toBe(3);
    expect(errorFromStack({message: "x", stack: "nothing useful", line: null}, source).line).toBe(0);
  });

  it("maps a syntax error's line, and tidies its message", () => {
    const line = scriptLine(source.source, 2);
    expect(errorFromEvent({message: "Uncaught SyntaxError: Unexpected token ';'", line}, source))
      .toEqual({line: 2, message: "SyntaxError: Unexpected token ';'"});
    // A line past the end, as for a missing closing brace, goes on the last line.
    expect(errorFromEvent({message: "x", line: line + 50}, source).line).toBe(3);
  });
});
