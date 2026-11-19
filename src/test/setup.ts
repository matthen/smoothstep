// IndexedDB and object URLs for jsdom.
import 'fake-indexeddb/auto';

let nextURL = 0;
URL.createObjectURL ??= () => "blob:test/" + (nextURL++);
URL.revokeObjectURL ??= () => {};
