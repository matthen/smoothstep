// Each part of the worker runtime reaches the worker as source text, so it can't use anything from its
// module. Here each runs from its source in a context holding only a worker's own globals, where a
// reference to its module throws.
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

import { workerParts } from './parts';

// Runs `script` in a fresh context with `part` defined from its source, and returns the result.
function runBare(part: (...args: never[]) => unknown, script: string, globals: Record<string, unknown> = {}): unknown {
  const context = vm.createContext({...globals});
  return vm.runInContext(`const part = (${part.toString()});\n${script}`, context);
}

// The worker globals lockdown takes the originals of.
function workerGlobals() {
  class Event {
    stopImmediatePropagation() {}
  }
  class MessageEvent extends Event {
    get data() {
      return null;
    }
  }
  class MessagePort {
    postMessage() {}
    set onmessage(_: unknown) {}
  }
  return {
    Event, MessageEvent, MessagePort, performance: {now: () => 0}, setTimeout, setInterval, clearTimeout,
    Worker: {},
  };
}

describe("worker runtime parts", () => {
  it("lockdown runs from its source, taking away workers", () => {
    const result = runBare(workerParts.lockdown, `
      const natives = part(globalThis);
      [typeof natives.postMessage, typeof natives.now(), typeof globalThis.Worker];
    `, workerGlobals());
    expect(result).toEqual(["function", "number", "undefined"]);
  });

  it("makeTimers runs from its source", () => {
    const result = runBare(workerParts.makeTimers, `
      const ran = [];
      const timers = part({
        natives: {apply: Reflect.apply, deleteProperty: Reflect.deleteProperty, remove() {},
          setTimeout: callback => { callback(); return 1; }, setInterval: () => 2, clearTimeout() {}},
        now: () => 0,
      });
      const global = {};
      timers.install(global);
      timers.wake();
      global.setTimeout(() => ran.push("timeout"), 0);
      global.setInterval(() => {}, 10);
      global.clearInterval(2);
      timers.sleep();
      ran;
    `);
    expect(result).toEqual(["timeout"]);
  });

  it("makeLogger and installConsole run from their source", () => {
    const logged = runBare(workerParts.makeLogger, `
      const sent = [];
      const logger = part({formatLog: args => args.join(" "), maxLogs: 5, post: m => sent.push(m) > 0,
        setTimeout: () => {}});
      logger.setStep(3, 0.05);
      logger.log("log", ["hi"]);
      logger.flush();
      sent[0].logs.map(l => l.text + "@" + l.frame);
    `);
    expect(logged).toEqual(["hi@3"]);
    const consoleLogged = runBare(workerParts.installConsole, `
      const logged = [];
      const global = {};
      part(global, (level, args) => logged.push(level + " " + args.join(" ")), Reflect.apply);
      global.console.warn("careful");
      logged;
    `);
    expect(consoleLogged).toEqual(["warn careful"]);
  });

  it("makeModules runs from its source", () => {
    const result = runBare(workerParts.makeModules, `
      const modules = part();
      modules.define("lib", module => { module.exports = {__esModule: true, default: 42}; });
      modules.lib("lib", true);
    `);
    expect(result).toBe(42);
  });

  it("makeDeterministic runs from its source, giving clocks the step's time", () => {
    const result = runBare(workerParts.makeDeterministic, `
      const clock = part();
      clock.setTime(2);
      [Date.now(), performance.now(), typeof Math.random()];
    `, {performance: {now: () => 0}});
    expect(result).toEqual([2000, 2000, "number"]);
  });
});
