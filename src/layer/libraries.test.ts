import { describe, expect, it } from 'vitest';

import { parseImports } from './libraries';

// Runs the code parseImports gives with a stand-in for the worker's library loader, returning what
// the named variables hold.
function run(code: string, names: string[]): Record<string, unknown> {
  const parsed = parseImports(code);
  const lib = (name: string, byDefault = false) => ({name, byDefault, Vec2: "Vec2 of " + name});
  // eslint-disable-next-line @typescript-eslint/no-implied-eval -- the test runs generated code, as the worker does
  const body = new Function("__smoothstep", parsed.code + "\nreturn {" + names.join(", ") + "};") as
    (smoothstep: unknown) => Record<string, unknown>;
  return body({lib});
}

describe("parseImports", () => {
  it("finds the libraries the import lines ask for, by any of their names", () => {
    const parsed = parseImports([
      "// Physics.",
      'import planck from "planck";',
      "import * as Matter from 'matter.js';",
      'import {createNoise2D} from "simplex-noise"; // Noise.',
      'import planck2 from "planck-js";',
      "",
      "function draw(ctx) {}",
    ].join("\n"));
    expect(parsed.errors).toEqual([]);
    expect(parsed.libraries).toEqual(["planck", "matter-js", "simplex-noise"]);
  });

  it("keeps every line where it was, so errors stay on their lines", () => {
    const code = '/* Physics\n   with planck */\nimport planck from "planck";\n\nfunction draw(ctx) {\n  oops();\n}';
    const parsed = parseImports(code);
    expect(parsed.code.split("\n")).toHaveLength(code.split("\n").length);
    expect(parsed.code.split("\n").slice(3)).toEqual(code.split("\n").slice(3));
    expect(parsed.code).not.toContain("import");
  });

  it("declares what default, namespace and named imports name", () => {
    const values = run([
      'import planck from "planck";',
      'import * as noise from "simplex-noise";',
      'import {Vec2, Vec2 as V} from "planck";',
    ].join("\n"), ["planck", "noise", "Vec2", "V"]);
    expect(values.planck).toEqual({name: "planck", byDefault: true, Vec2: "Vec2 of planck"});
    expect(values.noise).toMatchObject({name: "simplex-noise", byDefault: false});
    expect(values.Vec2).toBe("Vec2 of planck");
    expect(values.V).toBe("Vec2 of planck");
  });

  it("puts an error on the line of a library that isn't built in, or an import it can't read", () => {
    const parsed = parseImports('// Libraries.\nimport box2d from "box2d";\nimport planck from "planck"\nimport {a b} from "planck";\n');
    expect(parsed.errors.map(e => e.line)).toEqual([1, 3]);
    expect(parsed.errors[0]!.message).toContain("planck");
    expect(parsed.libraries).toEqual(["planck"]);
  });

  it("stops at the first line of code, so imports go at the top", () => {
    const parsed = parseImports('const x = 1;\nimport planck from "planck";\n');
    expect(parsed.libraries).toEqual([]);
    expect(parsed.errors).toEqual([]);
  });
});
