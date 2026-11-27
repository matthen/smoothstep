// Takes from a Canvas2D layer's worker what its code mustn't have, and keeps the originals the
// runtime needs before that code can replace them. The worker gets it as source text, so it must
// not use anything from outside its own body.

type Native = (...args: never[]) => unknown;

export interface Natives {
  apply: typeof Reflect.apply;
  deleteProperty: typeof Reflect.deleteProperty;
  // Deletes a global, or a property of `from`, from it and every prototype it has.
  remove(name: string, from?: object): void;
  postMessage: Native;
  setOnMessage: Native;
  dataOf: Native;
  stopImmediately: Native;
  setTimeout: typeof setTimeout;
  setInterval: typeof setInterval;
  clearTimeout: typeof clearTimeout;
  // The real clock, which the code's own will be the animation's time.
  now(): number;
}

export function lockdown(global: object): Natives {
  const remove = (name: string, from: object = global) => {
    for (let o: object | null = from; o; o = Object.getPrototypeOf(o) as object | null) {
      Reflect.deleteProperty(o, name);
    }
  };
  // The code can't start workers of its own, or loop on frames, messages or timers outside its steps.
  ["Worker", "SharedWorker", "requestAnimationFrame", "cancelAnimationFrame", "MessageChannel",
    "BroadcastChannel", "scheduler", "TaskController"].forEach(name => remove(name));
  if (typeof AbortSignal !== "undefined") {
    remove("timeout", AbortSignal);
  }
  const native = (prototype: object, name: string, part: "value" | "get" | "set") =>
    Object.getOwnPropertyDescriptor(prototype, name)![part] as Native;
  return {
    apply: Reflect.apply, deleteProperty: Reflect.deleteProperty, remove,
    postMessage: native(MessagePort.prototype, "postMessage", "value"),
    setOnMessage: native(MessagePort.prototype, "onmessage", "set"),
    dataOf: native(MessageEvent.prototype, "data", "get"),
    stopImmediately: native(Event.prototype, "stopImmediatePropagation", "value"),
    setTimeout, setInterval, clearTimeout,
    now: performance.now.bind(performance),
  };
}
