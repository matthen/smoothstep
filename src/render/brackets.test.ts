import { describe, expect, it } from 'vitest';

import { DEFAULT_CODE } from '../lib/document';
import { bracketError } from './brackets';

describe("bracketError", () => {
  it("finds nothing wrong in code whose braces and parentheses pair up", () => {
    expect(bracketError(DEFAULT_CODE)).toBeNull();
    expect(bracketError("")).toBeNull();
  });

  it("puts a { that's never closed on its own line", () => {
    const code = DEFAULT_CODE.slice(0, DEFAULT_CODE.lastIndexOf("}"));
    const line = code.split("\n").findIndex(l => l.startsWith("void mainImage"));
    expect(bracketError(code)).toEqual({line, message: "This { is never closed. Add a } to end it."});
  });

  it("finds a ( left open inside a block, and a stray }", () => {
    expect(bracketError("void f() {\n  g(1;\n}")).toEqual({line: 1, message: "This ( is never closed. Add a ) to end it."});
    expect(bracketError("void f() {\n}\n}")?.line).toBe(2);
    expect(bracketError("void f() {\n}\n}")?.message).toMatch(/^This } has no \{ before it/);
  });

  it("skips brackets in comments and strings, counting their lines", () => {
    expect(bracketError("// {\n/* ( {\n */ void f() {}\n#error \"}\"")).toBeNull();
    expect(bracketError("/* {\n\n */\nvoid f() {")?.line).toBe(3);
  });
});
