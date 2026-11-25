import { describe, expect, it } from 'vitest';

import { analyse } from '../editor/glslDefinitions';
import { guessType, planProbe, sharedCallers, typeFromError, withProbe, type ProbeType } from './probe';

const CODE = `float circle(vec2 p, float r) {
  return length(p) - r;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / iResolution.xy;
  float d = circle(uv - 0.5, 0.3);
  vec3 col = vec3(smoothstep(0.0, 0.01, d));
  for (int i = 0; i < 3; i++) {
    col *= 0.9;
  }
  if (d < 0.1) col.r = 1.0;
  fragColor = vec4(col, 1.0);
}
`;

// Where `text` first appears in the code (or the `nth` time), as a whole word if it starts and ends with one.
function find(text: string, code: string, nth: number): number {
  const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp((/^\w/.test(text) ? "\\b" : "") + escaped + (/\w$/.test(text) ? "\\b" : ""), "g");
  const match = [...code.matchAll(pattern)][nth];
  expect(match).toBeDefined();
  return match!.index;
}

// Plans showing `text` in the code.
function plan(text: string, code = CODE, nth = 0) {
  const from = find(text, code, nth);
  return planProbe(code, from, from + text.length);
}

function sites(text: string, code = CODE, nth = 0): string[] {
  const result = plan(text, code, nth);
  if (!result.ok) throw new Error(result.message);
  return result.sites.map(site => withProbe(code, site, result.expression, null));
}

// The line of `code` holding the call.
const callLine = (code: string) => code.split("\n").find(line => line.includes("smoothstepShow"))!.trim();

describe("planProbe", () => {
  it("shows a variable after the statement that declares it, so it's in scope", () => {
    const [after, before] = sites("d");
    expect(callLine(after!)).toBe("float d = circle(uv - 0.5, 0.3); smoothstepShow((d));");
    expect(callLine(before!)).toBe("smoothstepShow((d)); float d = circle(uv - 0.5, 0.3);");
  });

  it("shows part of a return statement before it, where it still runs", () => {
    const result = sites("length(p) - r");
    expect(result).toHaveLength(1);
    expect(callLine(result[0]!)).toBe("smoothstepShow((length(p) - r)); return length(p) - r;");
  });

  it("shows a for loop's condition inside the loop first, where its variable is known", () => {
    const [inside, before] = sites("i < 3");
    expect(inside).toContain("i++) { smoothstepShow((i < 3));");
    expect(callLine(before!)).toMatch(/^smoothstepShow\(\(i < 3\)\); for/);
  });

  it("shows an if's condition before the if", () => {
    const [before] = sites("d < 0.1");
    expect(callLine(before!)).toBe("smoothstepShow((d < 0.1)); if (d < 0.1) col.r = 1.0;");
  });

  it("never puts the call between else and its if, but in braces around the if", () => {
    const code = "void f() {\n  if (a) { x = 1; } else if (b > 2.) { x = 2; }\n}\n";
    const [before, inside] = sites("b > 2.", code);
    expect(callLine(before!)).toMatch(/else +\{ +smoothstepShow\(\(b > 2\.\)\); +if \(b > 2\.\) \{ x = 2; \} +\}$/);
    expect(inside).toMatch(/\{ smoothstepShow\(\(b > 2\.\)\); +x = 2; \}/);
  });

  // The call goes before the statement unless the selection is what the statement sets.
  it.each([
    ["p = abs(p) - 0.5;", "abs(p)"],
    ["d += d * 2.;", "d * 2."],
    ["uv = uv * 2. - 1.;", "uv * 2. - 1."],
    ["float e = abs(d) * 2.;", "abs(d)"],
  ])("shows part of %s before it, with the values it reads", (statement, text) => {
    const code = `void f(vec2 p, float d, vec2 uv) {\n  ${statement}\n}\n`;
    expect(callLine(sites(text, code)[0]!)).toBe(`smoothstepShow((${text})); ${statement}`);
  });

  it.each([
    ["float e = d * 2.;", "e"],
    ["float e = d * 2.;", "d * 2."],
    ["float a = 1., e = d * 2.;", "e"],
    ["d += 1.;", "d"],
    ["uv.x = 2.;", "uv.x"],
  ])("shows what %s sets, %s, after it", (statement, text) => {
    const code = `void f(float d, vec2 uv) {\n  ${statement}\n}\n`;
    const from = code.indexOf(statement) + statement.indexOf(text);
    const result = planProbe(code, from, from + text.length);
    if (!result.ok) throw new Error(result.message);
    const [first] = result.sites;
    expect(first!.at).toBe(code.indexOf(statement) + statement.length);
  });

  it("puts the call in braces with the body of an if, so it runs only when the body does", () => {
    const [after, before] = sites("col.r");
    expect(callLine(after!)).toMatch(/^if \(d < 0\.1\) +\{ +col\.r = 1\.0; smoothstepShow\(\(col\.r\)\); +\}$/);
    expect(callLine(before!)).toMatch(/^if \(d < 0\.1\) +\{ +smoothstepShow\(\(col\.r\)\); col\.r = 1\.0; +\}$/);
    expect(callLine(sites("1.0")[0]!)).toMatch(/^if \(d < 0\.1\) +\{ +smoothstepShow\(\(1\.0\)\); col\.r/);
  });

  it("keeps an if's else after the braces it adds to its body", () => {
    const code = "void f(float a) {\n  float x;\n  if (a > 0.) x = a * 2.; else x = a * 3.;\n}\n";
    const [inIf] = sites("a * 2.", code);
    expect(callLine(inIf!)).toMatch(/^if \(a > 0\.\) +\{ +smoothstepShow\(\(a \* 2\.\)\); x = a \* 2\.; +\} +else x = a \* 3\.;$/);
    const [inElse] = sites("a * 3.", code);
    expect(callLine(inElse!)).toMatch(/^if \(a > 0\.\) x = a \* 2\.; else +\{ +smoothstepShow\(\(a \* 3\.\)\); x = a \* 3\.; +\}$/);
  });

  it("puts the call in braces with the body of a for loop", () => {
    const code = "void f() {\n  float s = 0.;\n  for (int i = 0; i < 3; i++) s += float(i);\n}\n";
    expect(callLine(sites("float(i)", code)[0]!))
      .toMatch(/^for \(int i = 0; i < 3; i\+\+\) +\{ +smoothstepShow\(\(float\(i\)\)\); s \+= float\(i\); +\}$/);
  });

  it("widens a selection to whole names, and trims spaces", () => {
    const code = "void f() {\n  float value = 2.0;\n}\n";
    const from = code.indexOf("alue");
    const result = planProbe(code, from - 1 - 1, from + 2);
    expect(result).toMatchObject({ok: true, expression: "value"});
  });

  it("names the function the expression is in", () => {
    expect(plan("length(p)")).toMatchObject({ok: true, functionName: "circle"});
    expect(plan("uv", CODE, 1)).toMatchObject({ok: true, functionName: "mainImage"});
  });

  it.each([
    ["float d", "a declaration"],
    ["col *= 0.9", "an assignment"],
    ["col *= 0.9;", "a statement"],
    ["0.5, 0.3", "two arguments"],
    ["circle(uv - 0.5", "an unclosed bracket"],
    ["fragCoord /", "a trailing operator"],
    ["return length(p)", "a return"],
  ])("refuses %s (%s)", text => {
    expect(plan(text).ok).toBe(false);
  });

  it("refuses code outside a function", () => {
    const code = "const float R = 2.0;\nvoid mainImage(out vec4 c, in vec2 p) { c = vec4(R); }\n";
    expect(plan("2.0", code)).toEqual({ok: false, message: "Select an expression inside a function."});
  });

  it("refuses an empty selection or one in a #define", () => {
    expect(planProbe(CODE, 5, 5).ok).toBe(false);
    expect(plan("0.5", "#define H 0.5\nvoid f() {}\n").ok).toBe(false);
  });
});

describe("withProbe", () => {
  it("keeps the code's lines, so errors in the rest still point at the right line", () => {
    const code = "void f(float a) {\n  float x;\n  if (a > 0.) x = a;\n  g(x);\n}\n";
    const result = planProbe(code, code.indexOf("x = a") + 4, code.indexOf("x = a") + 5);
    if (!result.ok) throw new Error(result.message);
    for (const site of result.sites) {
      const lines = withProbe(code, site, result.expression, "float").split("\n");
      expect(lines).toHaveLength(code.split("\n").length);
      expect(lines[3]).toBe("  g(x);");
    }
  });
});

describe("typeFromError", () => {
  it.each<[string, ProbeType | null]>([
    ["ERROR: 0:4: '=' : cannot convert from 'const 3-component vector of float' to 'highp float'", "vec3"],
    ["ERROR: 0:4: '=' : cannot convert from 'highp 2-component vector of int' to 'highp float'", "ivec2"],
    ["ERROR: 0:4: '=' : cannot convert from 'const bool' to 'highp float'", "bool"],
    ["ERROR: 0:4: '=' : cannot convert from 'const 3-component vector of uint' to 'highp float'", null],
    ["ERROR: 0:4: 'z' : undeclared identifier", null],
  ])("reads the expression's type from %s", (log, type) => {
    expect(typeFromError(log)).toBe(type);
  });
});

describe("sharedCallers", () => {
  it("follows calls between helpers, but not to ones that don't reach the function", () => {
    const shared = "float a(float x) { return x; }\nfloat b(float x) { return a(x) * 2.; }\n" +
      "float c(float x) { return b(x) + 1.; }\nfloat other(float x) { return x; }\n";
    expect(sharedCallers(shared, "a").sort()).toEqual(["a", "b", "c"]);
    expect(sharedCallers(shared, "c")).toEqual(["c"]);
  });
});

describe("guessType", () => {
  const guess = (text: string, code = CODE, nth = 0) => {
    const from = find(text, code, nth);
    return guessType(analyse(code), from, from + text.length);
  };

  it.each<[string, ProbeType, number?]>([
    ["d", "float", 1],
    ["uv", "vec2", 1],
    ["col", "vec3", 1],
    ["fragColor", "vec4", 1],
    ["fragCoord", "vec2", 1],
    ["iResolution.xy", "vec2"],
    ["col.r", "float"],
    ["length(p)", "float"],
    ["length(p) - r", "float"],
    ["circle(uv - 0.5, 0.3)", "float"],
    ["vec3(smoothstep(0.0, 0.01, d))", "vec3"],
    ["i", "int", 1],
    ["d < 0.1", "bool"],
    ["fragCoord / iResolution.xy", "vec2"],
    ["iTime", "float"],
  ])("guesses %s is a %s", (text, type, nth = 0) => {
    const code = CODE.replace("vec2 uv =", "float t = iTime; vec2 uv =");
    expect(guess(text, code, nth)).toBe(type);
  });

  it("puts the guess first in the plan's types, then the rest", () => {
    const result = plan("uv", CODE, 1);
    expect(result.ok && result.types[0]).toBe("vec2");
    expect(result.ok && new Set(result.types).size).toBe(10);
  });
});
