import { describe, expect, it } from 'vitest';

import { clampPreviewWidth, MIN_EDITOR, MIN_PREVIEW } from './PaneDivider';

describe("clampPreviewWidth", () => {
  it("keeps a width that leaves room for both sides", () => {
    expect(clampPreviewWidth(600, 1400)).toBe(600);
  });

  it("keeps each side at least its minimum width", () => {
    expect(1400 - clampPreviewWidth(5000, 1400)).toBe(MIN_EDITOR);
    expect(clampPreviewWidth(0, 1400)).toBe(MIN_PREVIEW);
  });
});
