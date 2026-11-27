import { describe, expect, it } from 'vitest';

import { releasedCode, type PickerDrag } from './usePickerDrag';

const UNIFORM: PickerDrag = {kind: "uniform", startCode: "x = 0.2;"};

describe("releasedCode", () => {
  it("hands over the value a uniform drag was let go at", () => {
    expect(releasedCode(UNIFORM, "x = 0.5;", "x = 0.2;")).toBe("x = 0.5;");
  });

  it("hands over nothing when let go where it started, or with nothing held", () => {
    expect(releasedCode(UNIFORM, "x = 0.2;", "x = 0.2;")).toBeNull();
    expect(releasedCode(UNIFORM, null, "x = 0.2;")).toBeNull();
  });

  it("drops the edit when another animation opened during the drag", () => {
    expect(releasedCode(UNIFORM, "x = 0.5;", "y = 1.0;")).toBeNull();
  });

  it("hands over nothing for a drag whose edits already reached the document", () => {
    expect(releasedCode({kind: "rebuild", startCode: "x = 0.2;"}, "x = 0.5;", "x = 0.2;")).toBeNull();
    expect(releasedCode({kind: "idle"}, "x = 0.5;", "x = 0.2;")).toBeNull();
  });
});
