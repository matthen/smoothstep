import { describe, expect, it } from 'vitest';

import { quickFix } from './quickFixes';

// The messages are Chrome's, from compiling each line in WebGL 2.
const INT_TO_FLOAT = "'=' : cannot convert from 'const int' to 'highp float'";
const ASSIGN_INT = "'assign' : cannot convert from 'const int' to 'highp float'";
const operands = (op: string, left: string, right: string) =>
  `'${op}' : wrong operand types - no operation '${op}' exists that takes a left-hand operand of type '${left}' ` +
  `and a right operand of type '${right}' (or there is no acceptable conversion)`;
const noOverload = (name: string) => `'${name}' : no matching overloaded function found`;

// The code with the fix for an error on `line` made, and the fix's label, or null without one.
function fix(message: string, code: string, line = 0) {
  const found = quickFix(message, code, line);
  if (!found) {
    return null;
  }
  let fixed = code;
  for (const change of [...found.changes].sort((a, b) => b.from - a.from)) {
    fixed = fixed.slice(0, change.from) + change.insert + fixed.slice(change.to);
  }
  return {code: fixed, label: found.label};
}

describe("quickFix for an int where a float is needed", () => {
  it("makes the int given to a float a float", () => {
    expect(fix(INT_TO_FLOAT, "  float x = 1;")).toEqual({code: "  float x = 1.0;", label: "Change 1 to 1.0"});
    expect(fix(INT_TO_FLOAT, "float x = -10;")?.code).toBe("float x = -10.0;");
    expect(fix(ASSIGN_INT, "x += 1;")?.code).toBe("x += 1.0;");
    expect(fix(ASSIGN_INT, "x = 3; // was 2")?.code).toBe("x = 3.0; // was 2");
  });

  it("makes the int beside an operator a float, on whichever side it is", () => {
    expect(fix(operands("*", "highp float", "const int"), "float y = x * 2;")?.code).toBe("float y = x * 2.0;");
    expect(fix(operands("*", "const int", "highp float"), "float y = 2 * x;")?.code).toBe("float y = 2.0 * x;");
    expect(fix(operands("-", "highp float", "const int"), "float d = length(p) - 1;")?.code)
      .toBe("float d = length(p) - 1.0;");
    expect(fix(operands("<", "highp float", "const int"), "if (x < 1) { x = 2.; }")?.code)
      .toBe("if (x < 1.0) { x = 2.; }");
    expect(fix(operands("*", "highp 2-component vector of float", "const int"), "vec2 y = uv * 2;")?.code)
      .toBe("vec2 y = uv * 2.0;");
    expect(fix(operands("/", "const int", "uniform highp float"), "float x = -1 / iTime;")?.code)
      .toBe("float x = -1.0 / iTime;");
    // Each of two operators' errors fixes its own int.
    const code = "float x = iTime * 2 + 1;";
    expect(fix(operands("*", "uniform highp float", "const int"), code)?.code).toBe("float x = iTime * 2.0 + 1;");
    expect(fix(operands("+", "uniform highp float", "const int"), code)?.code).toBe("float x = iTime * 2 + 1.0;");
  });

  it("makes the ints given to a function that takes floats floats", () => {
    expect(fix(noOverload("pow"), "float y = pow(x, 2);")).toEqual(
      {code: "float y = pow(x, 2.0);", label: "Change 2 to 2.0"});
    expect(fix(noOverload("smoothstep"), "float y = smoothstep(0, 1, x);")).toEqual(
      {code: "float y = smoothstep(0.0, 1.0, x);", label: "Change 0 and 1 to 0.0 and 1.0"});
    expect(fix(noOverload("max"), "float y = max(f(1, 2), -1);")?.code).toBe("float y = max(f(1, 2), -1.0);");
  });

  it("offers nothing unless the int involved is certain", () => {
    // Two ints that could be the one.
    expect(fix(INT_TO_FLOAT, "float x = 1, y = 2;")).toBeNull();
    expect(fix(operands("*", "highp float", "const int"), "float y = x * 2 + z * 3;")).toBeNull();
    // The int on the right is part of a bigger operand, which stays an int.
    expect(fix(operands("+", "highp float", "const int"), "float y = x + 2 * 3;")).toBeNull();
    expect(fix(operands("*", "highp float", "const int"), "float y = x * N;")).toBeNull();
    // A cascade from another error on the line, with no int given straight to the float.
    expect(fix(INT_TO_FLOAT, "float y = 2 * x;")).toBeNull();
    // Floats, unsigned ints and ints in names aren't the int.
    expect(fix(INT_TO_FLOAT, "float x = 1u;")).toBeNull();
    expect(fix(operands("*", "highp float", "const int"), "float y = x * 2.5 * vec2(1.).x;")).toBeNull();
    // An int to a vector isn't fixed by a float.
    expect(fix("'=' : cannot convert from 'const int' to 'highp 3-component vector of float'", "vec3 c = 1;"))
      .toBeNull();
    // A function of the user's, or a call that isn't the only one on the line.
    expect(fix(noOverload("f"), "float y = f(1);")).toBeNull();
    expect(fix(noOverload("pow"), "float y = pow(x, 2) + pow(z, 3);")).toBeNull();
    expect(fix(noOverload("pow"), "float y = pow(x, y);")).toBeNull();
  });
});

describe("quickFix for a vector of the wrong size", () => {
  const smaller = (from: number, to: number, qualifiers = "highp ") =>
    `'=' : cannot convert from 'lowp ${from}-component vector of float' to '${qualifiers}${to}-component vector of float'`;
  const toOut = "'assign' : cannot convert from 'highp 3-component vector of float' to 'out highp 4-component vector of float'";

  it("cuts a bigger vector down to the size it's given to", () => {
    expect(fix(smaller(4, 3), "  vec3 c = texture(iTexture0, uv);")).toEqual(
      {code: "  vec3 c = texture(iTexture0, uv).xyz;", label: "Add .xyz"});
    expect(fix(smaller(3, 2), "vec2 uv = vec3(1.);")?.code).toBe("vec2 uv = vec3(1.).xy;");
    expect(fix(smaller(4, 3), "fragColor.rgb = a + b;")).toEqual(
      {code: "fragColor.rgb = (a + b).xyz;", label: "Change to (…).xyz"});
  });

  it("gives a vec3 written to fragColor an alpha of 1", () => {
    expect(fix(toOut, "  fragColor = col;")).toEqual(
      {code: "  fragColor = vec4(col, 1.0);", label: "Change to vec4(…, 1.0)"});
  });

  it("offers nothing when the line isn't one plain assignment, or the size to add is unknown", () => {
    expect(fix(smaller(4, 3), "if (x > 0.) c = texture(t, uv);")).toBeNull();
    expect(fix(smaller(4, 3), "vec3 c = texture(t, uv); float a = 1.;")).toBeNull();
    // A vec3 to a vec4 that isn't an out parameter.
    expect(fix(smaller(3, 4), "vec4 c = vec3(1.);")).toBeNull();
    expect(fix("'=' : dimension mismatch", "vec3 c = texture(t, uv);")).toBeNull();
  });
});

describe("quickFix for a missing semicolon", () => {
  const syntax = (token: string) => `'${token}' : syntax error`;

  it("ends the line before with a ;", () => {
    const code = "  float x = 1.\n  fragColor = vec4(x);";
    expect(fix(syntax("fragColor"), code, 1)).toEqual(
      {code: "  float x = 1.;\n  fragColor = vec4(x);", label: "Add ; to the end of line 1"});
    expect(fix(syntax("}"), "  fragColor = vec4(x)  // grey\n}", 1)?.code).toBe("  fragColor = vec4(x);  // grey\n}");
    // Past blank lines and comments.
    expect(fix(syntax("float"), "float x = sin(iTime)\n\n// next\nfloat y = 2.;", 3)?.code)
      .toBe("float x = sin(iTime);\n\n// next\nfloat y = 2.;");
  });

  it("offers nothing when the line before carries on or needs no ;", () => {
    expect(fix(syntax("b"), "float x = a +\nb;", 1)).toBeNull();
    expect(fix(syntax("x"), "if (y > 1.)\nx = 0.;", 1)).toBeNull();
    expect(fix(syntax("float"), "#define N 3\nfloat y;", 1)).toBeNull();
    expect(fix(syntax("float"), "float f(float x)\nfloat y;", 1)).toBeNull();
    expect(fix(syntax("float"), "x = f(a,\nfloat y;", 1)).toBeNull();
    // The error isn't at the start of its line.
    expect(fix(syntax("y"), "float x = 1.;\nfloat z y;", 1)).toBeNull();
    expect(fix(syntax("float"), "float x = 1.;\nfloatx y;", 1)).toBeNull();
  });
});
