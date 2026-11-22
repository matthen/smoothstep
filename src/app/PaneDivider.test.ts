import { describe, expect, it } from 'vitest';

import { clampPreviewWidth, MIN_EDITOR, MIN_PREVIEW, nearerWidePreset } from './PaneDivider';

describe("clampPreviewWidth", () => {
  it("keeps a width that leaves room for both sides", () => {
    expect(clampPreviewWidth(600, 1400)).toBe(600);
  });

  it("keeps each side at least its minimum width", () => {
    expect(1400 - clampPreviewWidth(5000, 1400)).toBe(MIN_EDITOR);
    expect(clampPreviewWidth(0, 1400)).toBe(MIN_PREVIEW);
  });
});

describe("nearerWidePreset", () => {
  it("tells a wide width from a narrow one, on any screen", () => {
    for (const viewport of [1024, 1440, 2560]) {
      expect(nearerWidePreset(MIN_PREVIEW, viewport)).toBe(false);
      expect(nearerWidePreset(viewport, viewport)).toBe(true);
    }
  });
});
