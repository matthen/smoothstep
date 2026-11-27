import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { makeTimers } from './timers';

type Timer = (callback: () => void, ms?: number) => number;

// The layer code's timers, on vitest's fake clock.
function codeTimers() {
  const global: Record<string, unknown> = {};
  const removed: string[] = [];
  const timers = makeTimers({
    natives: {
      apply: Reflect.apply, deleteProperty: Reflect.deleteProperty, remove: name => removed.push(name),
      setTimeout, setInterval, clearTimeout,
    },
    now: () => performance.now(),
  });
  timers.install(global);
  return {
    timers, removed,
    setTimeout: global.setTimeout as Timer, setInterval: global.setInterval as Timer,
    clearTimeout: global.clearTimeout as (id: number) => void,
  };
}

describe("makeTimers", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("takes the worker's own timers away", () => {
    expect(codeTimers().removed).toEqual(expect.arrayContaining(["setTimeout", "setInterval", "clearTimeout", "clearInterval"]));
  });

  it("runs timers while a step is drawn, and for a while after", () => {
    const {timers, setTimeout} = codeTimers();
    const ran: string[] = [];
    timers.wake();
    setTimeout(() => ran.push("drawing"), 10);
    vi.advanceTimersByTime(20);
    timers.sleep();
    setTimeout(() => ran.push("just after"), 10);
    vi.advanceTimersByTime(20);
    expect(ran).toEqual(["drawing", "just after"]);
  });

  it("holds a timer that comes due long after the last step until the next one", () => {
    const {timers, setTimeout} = codeTimers();
    const ran: string[] = [];
    setTimeout(() => ran.push("held"), 10);
    vi.advanceTimersByTime(60_000);
    expect(ran).toEqual([]);
    timers.wake();
    expect(ran).toEqual(["held"]);
  });

  it("doesn't run a held timer that's cleared, or one an earlier held timer clears", () => {
    const {timers, setTimeout, clearTimeout} = codeTimers();
    const ran: string[] = [];
    const cleared = setTimeout(() => ran.push("cleared"), 10);
    let b = 0;
    setTimeout(() => {
      ran.push("a");
      clearTimeout(b);
    }, 20);
    b = setTimeout(() => ran.push("b"), 20);
    vi.advanceTimersByTime(60_000);
    clearTimeout(cleared);
    timers.wake();
    expect(ran).toEqual(["a"]);
  });

  it("holds an interval while idle, and starts it again on the next step", () => {
    const {timers, setInterval} = codeTimers();
    let ticks = 0;
    setInterval(() => ticks++, 100);
    vi.advanceTimersByTime(60_000);
    expect(ticks).toBe(0);
    timers.wake();
    expect(ticks).toBe(1);
    vi.advanceTimersByTime(300);
    expect(ticks).toBe(4);
  });
});
