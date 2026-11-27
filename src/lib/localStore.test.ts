import { beforeEach, describe, expect, it, vi } from 'vitest';

import { newDocument } from './document';

// A fresh page load: the module asks at most once.
async function freshStore() {
  vi.resetModules();
  return import('./localStore');
}

describe("localStore", () => {
  const persist = vi.fn(() => Promise.resolve(true));
  beforeEach(() => {
    persist.mockClear();
    Object.defineProperty(navigator, "storage", {value: {persist}, configurable: true});
  });

  it("asks the browser to keep saved animations once, after the first save or upload", async () => {
    const store = await freshStore();
    await store.init();
    expect(persist).not.toHaveBeenCalled();
    await store.putImage({id: "eeee00000001", filename: "a.png", width: 1, height: 1, created: 0, blob: new Blob(["x"])});
    await store.saveDocument(null, newDocument(), null);
    expect(persist).toHaveBeenCalledOnce();
    // fake-indexeddb doesn't give a blob back as one.
    await store.deleteImage("eeee00000001");
  });

  it("asks on start when the browser already holds saved animations", async () => {
    const first = await freshStore();
    await first.saveDocument(null, newDocument(), null);
    const store = await freshStore();
    persist.mockClear();
    await store.init();
    expect(persist).toHaveBeenCalledOnce();
  });
});
