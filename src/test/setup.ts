// IndexedDB and object URLs for jsdom.
import 'fake-indexeddb/auto';

let nextURL = 0;
URL.createObjectURL ??= () => "blob:test/" + (nextURL++);
URL.revokeObjectURL ??= () => {};

// Mantine reads media queries and observes element sizes, which jsdom doesn't provide.
if (typeof window !== "undefined") {
  window.matchMedia ??= (query: string) => ({
    matches: false, media: query, onchange: null,
    addListener: () => {}, removeListener: () => {},
    addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
  });
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.scrollIntoView ??= () => {};
}
