import { describe, expect, it } from 'vitest';

import { readyOutcome } from './CanvasLayer';

describe("readyOutcome", () => {
  it("draws only when the code set up a draw function", () => {
    expect(readyOutcome({registered: true, hasDraw: true, stoppedEarly: false})).toBe("draws");
    expect(readyOutcome({registered: true, hasDraw: false, stoppedEarly: false})).toBe("no draw");
  });

  it("tells a top-level return apart from an error, which arrives on its own", () => {
    expect(readyOutcome({registered: false, hasDraw: false, stoppedEarly: true})).toBe("stopped early");
    expect(readyOutcome({registered: false, hasDraw: false, stoppedEarly: false})).toBe("threw");
  });

  it("treats fields of the wrong type from the worker as false", () => {
    expect(readyOutcome({registered: "yes" as unknown as boolean, hasDraw: true})).toBe("threw");
    expect(readyOutcome({registered: true, hasDraw: 1 as unknown as boolean})).toBe("no draw");
  });
});
