import { describe, expect, it } from 'vitest';

import { floatsInCode } from './Sliders';

describe("floatsInCode", () => {
  it("lists each iFloat once, in order, ignoring comments", () => {
    const code = "#define size iFloat3\n// iFloat7 isn't used\nfloat a = iFloat0 + size * iFloat3; /* iFloat9 */\niFloat12;";
    expect(floatsInCode(code)).toEqual([0, 3, 12]);
  });
});
