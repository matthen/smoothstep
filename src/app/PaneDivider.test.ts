import { describe, expect, it } from 'vitest';

import { clampPreviewWidth } from './PaneDivider';

describe("clampPreviewWidth", () => {
  it("keeps a width that leaves room for both sides", () => {
    expect(clampPreviewWidth(600, 1400)).toBe(600);
  });

  it("leaves the code side room, and doesn't shrink the canvas side to nothing", () => {
    const workspace = 1400;
    const widest = clampPreviewWidth(5000, workspace);
    const narrowest = clampPreviewWidth(0, workspace);
    expect(widest).toBeLessThan(workspace);
    expect(workspace - widest).toBeGreaterThan(200);
    expect(narrowest).toBeGreaterThan(200);
    expect(clampPreviewWidth(widest - 1, workspace)).toBe(widest - 1);
    expect(clampPreviewWidth(narrowest + 1, workspace)).toBe(narrowest + 1);
  });
});
