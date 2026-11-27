import { describe, expect, it, vi } from 'vitest';

import { newDocument } from './document';
import { init, saveDocument } from './localStore';

describe("localStore", () => {
  it("asks the browser to keep saved animations once, after the first save", async () => {
    const persist = vi.fn(() => Promise.resolve(true));
    Object.defineProperty(navigator, "storage", {value: {persist}, configurable: true});
    await init();
    expect(persist).not.toHaveBeenCalled();
    await saveDocument(null, newDocument(), null);
    await saveDocument(null, newDocument(), null);
    expect(persist).toHaveBeenCalledOnce();
  });
});
