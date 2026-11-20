import { describe, expect, it } from 'vitest';

import { floatNames } from './names';

describe("floatNames", () => {
  it("names each variable after its #define", () => {
    const names = floatNames("// Rename\n#define colorBlend iFloat0\n  #define radius (iFloat1) // size\nvoid main() {}");
    expect(names.slice(0, 3)).toEqual(["colorBlend", "radius", null]);
    expect(names).toHaveLength(16);
  });

  it("ignores commented-out defines, macros with arguments and other expressions", () => {
    const code = "// #define a iFloat0\n#define b(x) iFloat1\n#define c iFloat2 * 2.\n#define d iFloat20";
    expect(floatNames(code).every(name => name === null)).toBe(true);
  });

  it("keeps the first name for a variable", () => {
    expect(floatNames("#define first iFloat3\n#define second iFloat3")[3]).toBe("first");
  });
});
