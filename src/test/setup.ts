// IndexedDB and object URLs for jsdom.
/* eslint-disable @typescript-eslint/no-unnecessary-condition -- jsdom lacks these, though the DOM types say they exist */
import 'fake-indexeddb/auto';

let nextURL = 0;
URL.createObjectURL ??= () => "blob:test/" + (nextURL++);
URL.revokeObjectURL ??= () => {};

// Mantine reads media queries and observes element sizes, which jsdom doesn't provide.
if (typeof window !== "undefined") {
  window.matchMedia ??= (query: string) => ({
    matches: false, media: query, onchange: null,
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- MediaQueryList still has them, and older code calls them
    addListener: () => {}, removeListener: () => {},
    addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
  });
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.scrollIntoView ??= () => {};
  // jsdom's play() logs "not implemented" and returns nothing, where browsers return a promise.
  HTMLMediaElement.prototype.play = () => Promise.resolve();
  HTMLMediaElement.prototype.pause = () => {};
}
