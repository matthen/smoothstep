import { describe, expect, it, vi } from 'vitest';

import { Playhead } from './playhead';

describe("Playhead", () => {
  it("plays on both clocks, and restarting the steps keeps the time", () => {
    const playhead = new Playhead();
    playhead.set(2, 1);
    playhead.advance(0.5);
    expect([playhead.time, playhead.stepClock]).toEqual([2.5, 1.5]);
    playhead.restartSteps();
    expect([playhead.time, playhead.stepClock]).toEqual([2.5, 0]);
  });

  it("tells listeners about changes only, until they stop listening", () => {
    const playhead = new Playhead();
    const listener = vi.fn();
    const stop = playhead.subscribe(listener);
    playhead.set(1);
    playhead.set(1);
    expect(listener).toHaveBeenCalledOnce();
    stop();
    playhead.set(2);
    expect(listener).toHaveBeenCalledOnce();
  });
});
