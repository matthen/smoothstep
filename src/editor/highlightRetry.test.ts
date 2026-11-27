import { describe, expect, it, vi } from 'vitest';

describe("loadJsHighlighting", () => {
  it("tries again after the parser failed to load", async () => {
    let attempts = 0;
    vi.doMock('@lezer/javascript', async (importOriginal) => {
      attempts++;
      if (attempts === 1) {
        throw new Error("offline");
      }
      return importOriginal();
    });
    const { jsHighlightingReady, loadJsHighlighting } = await import('./highlight');
    await expect(loadJsHighlighting()).rejects.toThrow();
    expect(jsHighlightingReady()).toBe(false);
    await loadJsHighlighting();
    expect(jsHighlightingReady()).toBe(true);
  });
});
