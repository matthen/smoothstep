import { describe, expect, it } from 'vitest';

import type { FrameInputs } from './Renderer';
import { renderSteps, RESTART, stepAt, STEPS_PER_SECOND, type Steps } from './steps';

interface Draw {
  frame: number;
  time: number;
  frameIndex: number;
}

// Plays frames at the given times, from a restart, and records each draw and the frame it was in.
function play(frameTimes: readonly number[], hasState = true, maxSteps = Infinity) {
  const draws: Draw[] = [];
  let frame = 0;
  const renderer = {hasState, render: (inputs: FrameInputs) => draws.push({frame, ...inputs})};
  let steps: Steps = RESTART;
  for (; frame < frameTimes.length; frame++) {
    const time = frameTimes[frame]!;
    steps = renderSteps(renderer, steps, time, time,
      (t, frameIndex) => ({time: t, duration: 10, frameIndex, variableValues: []}), maxSteps);
  }
  return draws;
}

const frames = (fps: number, seconds: number) => Array.from({length: seconds * fps + 1}, (_, i) => i / fps);

describe("a shader with state", () => {
  it("steps at the same rate whatever the frame rate, so a preview and an export match", () => {
    for (const fps of [15, 24, 30, 60, 120, 144]) {
      expect(play(frames(fps, 2)).map(d => d.frameIndex), String(fps)).toEqual(
        Array.from({length: stepAt(2) + 1}, (_, i) => i));
    }
  });

  it("gives each step the time it fell at", () => {
    for (const draw of play(frames(24, 1))) {
      expect(draw.time).toBeCloseTo(draw.frameIndex / STEPS_PER_SECOND, 6);
    }
  });

  it("takes one step a frame on a 60Hz screen, even when frames come unevenly", () => {
    const uneven = frames(60, 3).map((t, i) => t + (i % 3 - 1) * 0.002);
    const draws = play(uneven);
    expect(new Set(draws.map(d => d.frame)).size).toBe(uneven.length);
    expect(draws).toHaveLength(uneven.length);
  });

  it("draws nothing between steps when frames come faster", () => {
    const draws = play(frames(120, 1));
    expect(draws.map(d => d.frameIndex)).toEqual(Array.from({length: stepAt(1) + 1}, (_, i) => i));
  });

  it("starts from the first step however late the first frame after a restart is", () => {
    expect(play([0.5]).map(d => d.frameIndex)).toEqual([0]);
  });

  it("runs slower when frames come too slowly, without skipping steps or catching up later", () => {
    const slow = [0, 0.5, 1];
    const fast = [1 + 1 / 60, 1 + 2 / 60, 1 + 3 / 60];
    const draws = play([...slow, ...fast], true, 4);
    expect(draws.map(d => d.frameIndex)).toEqual(Array.from({length: draws.length}, (_, i) => i));
    const perFrame = [...slow, ...fast].map((_, frame) => draws.filter(d => d.frame === frame).length);
    expect(perFrame.slice(1, 3)).toEqual([4, 4]);
    expect(perFrame.slice(3)).toEqual([1, 1, 1]);
  });

  it("steps at the times they fell at when it restarted partway through the animation", () => {
    const times: number[] = [];
    const renderer = {hasState: true, render: (inputs: FrameInputs) => times.push(inputs.time)};
    const inputs = (time: number, frameIndex: number) => ({time, duration: 10, frameIndex, variableValues: []});
    // Restarted at 4 s, then a frame for each step.
    let steps = RESTART;
    for (let step = 0; step < 4; step++) {
      steps = renderSteps(renderer, steps, step / STEPS_PER_SECOND, 4 + step / STEPS_PER_SECOND, inputs);
    }
    expect(times).toHaveLength(4);
    times.forEach((time, step) => expect(time - 4).toBeCloseTo(step / STEPS_PER_SECOND, 6));
  });

  it("draws again at the same step when the clock hasn't moved, as when paused", () => {
    const draws: number[] = [];
    const renderer = {hasState: true, render: (inputs: FrameInputs) => draws.push(inputs.frameIndex)};
    const inputs = (time: number, frameIndex: number) => ({time, duration: 10, frameIndex, variableValues: []});
    const started = renderSteps(renderer, RESTART, 0, 0, inputs);
    const steps = renderSteps(renderer, started, 0.1, 0.1, inputs);
    renderSteps(renderer, steps, 0.1, 0.1, inputs);
    expect(draws.slice(-2)).toEqual([stepAt(0.1), stepAt(0.1)]);
  });

  it("starts again from the first step when the clock goes back", () => {
    const draws = play([0, 0.05, 0.1, 0, 0.02]);
    const restartAt = draws.findIndex((d, i) => i > 0 && d.frameIndex === 0);
    expect(restartAt).toBeGreaterThan(0);
    expect(draws.slice(restartAt).map(d => d.frameIndex)).toEqual([0, 1]);
  });
});

describe("a shader without state", () => {
  it("draws once every frame, at the frame's time", () => {
    const times = frames(120, 1);
    const draws = play(times, false);
    expect(draws.map(d => d.time)).toEqual(times);
  });
});
