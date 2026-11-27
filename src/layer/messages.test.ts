import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FakeBitmap } from './fakeHost';
import { checkFromWorker, readyOutcome } from './messages';

describe("checkFromWorker", () => {
  beforeEach(() => vi.stubGlobal("ImageBitmap", FakeBitmap));
  afterEach(() => vi.unstubAllGlobals());

  it("rejects what isn't a message of a known kind", () => {
    for (const data of [null, undefined, "frame", 3, {}, {type: "steal"}]) {
      expect(checkFromWorker(data)).toBeNull();
    }
  });

  it("treats ready fields of the wrong type as false", () => {
    expect(checkFromWorker({type: "ready", registered: "yes", hasDraw: 1})).toEqual(
      {type: "ready", registered: false, hasDraw: false, stoppedEarly: false});
  });

  it("needs a whole step number for drawing", () => {
    expect(checkFromWorker({type: "drawing", frame: 4})).toEqual({type: "drawing", frame: 4});
    expect(checkFromWorker({type: "drawing", frame: 1.5})).toBeNull();
    expect(checkFromWorker({type: "drawing", frame: "4"})).toBeNull();
  });

  it("needs a real bitmap and a batch number for a frame", () => {
    const bitmap = new FakeBitmap(1, 1);
    expect(checkFromWorker({type: "frame", id: 2, bitmap})).toEqual({type: "frame", id: 2, bitmap});
    expect(checkFromWorker({type: "frame", id: 2, bitmap: {width: 1, height: 1}})).toBeNull();
    expect(checkFromWorker({type: "frame", id: "2", bitmap})).toBeNull();
  });

  it("keeps an error with missing or oversized fields, cut down", () => {
    expect(checkFromWorker({type: "error"})).toEqual({type: "error", message: "", stack: "", line: null});
    const checked = checkFromWorker({type: "error", message: "x".repeat(10_000), stack: 5, line: "3"});
    expect(checked).toMatchObject({stack: "", line: null});
    expect(checked?.type === "error" && checked.message.length).toBeLessThan(10_000);
  });

  it("drops malformed console calls and tidies the rest", () => {
    expect(checkFromWorker({
      type: "logs",
      logs: [
        {level: "log", text: "hi", frame: 3, time: 0.05, lines: [5, "x", 12], count: 2},
        {level: "shout", text: "no", frame: 0, time: 0, lines: [], count: 1},
        {level: "warn", text: 42, lines: []},
        null,
        {level: "error", text: "bare", frame: Infinity, count: -3},
      ],
      dropped: 7.5,
    })).toEqual({
      type: "logs",
      logs: [
        {level: "log", text: "hi", frame: 3, time: 0.05, lines: [5, 12], count: 2},
        {level: "error", text: "bare", frame: null, time: null, lines: [], count: 1},
      ],
      dropped: 7,
    });
    expect(checkFromWorker({type: "logs", logs: "lots", dropped: -1})).toEqual({type: "logs", logs: [], dropped: 0});
  });
});

describe("readyOutcome", () => {
  it("draws only when the code set up a draw function", () => {
    expect(readyOutcome({type: "ready", registered: true, hasDraw: true, stoppedEarly: false})).toBe("draws");
    expect(readyOutcome({type: "ready", registered: true, hasDraw: false, stoppedEarly: false})).toBe("no draw");
  });

  it("tells a top-level return apart from an error, which arrives on its own", () => {
    expect(readyOutcome({type: "ready", registered: false, hasDraw: false, stoppedEarly: true})).toBe("stopped early");
    expect(readyOutcome({type: "ready", registered: false, hasDraw: false, stoppedEarly: false})).toBe("threw");
  });
});
