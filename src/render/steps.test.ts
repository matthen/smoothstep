import { describe, expect, it } from 'vitest';

import type { FrameInputs } from './Renderer';
import { renderSteps, stepAt, STEPS_PER_SECOND } from './steps';

// Plays `seconds` at `fps` frames a second, and records each draw.
function play(fps: number, seconds: number, maxSteps = Infinity) {
  const draws: {time: number; frameIndex: number; step: boolean}[] = [];
  const renderer = {render: (inputs: FrameInputs, step = true) => draws.push({...inputs, step})};
  let rendered = -1;
  for (let i = 0; i <= seconds * fps; i++) {
    const time = i / fps;
    rendered = renderSteps(renderer, rendered, time, time,
      (t, frameIndex) => ({time: t, duration: seconds, frameIndex, variableValues: []}), maxSteps);
  }
  return {draws, steps: draws.filter(d => d.step)};
}

describe("simulation steps", () => {
  it("run at the same rate whatever the frame rate, so a preview and an export match", () => {
    for (const fps of [15, 24, 30, 60, 120, 144]) {
      const {steps} = play(fps, 2);
      expect(steps.map(s => s.frameIndex), String(fps)).toEqual(
        Array.from({length: 2 * STEPS_PER_SECOND + 1}, (_, i) => i));
    }
  });

  it("give each step the time it fell at", () => {
    for (const step of play(24, 1).steps) {
      expect(step.time).toBeCloseTo(step.frameIndex / STEPS_PER_SECOND, 6);
    }
  });

  it("step at the times they fell at when the simulation restarted partway through", () => {
    const times: number[] = [];
    const renderer = {render: (inputs: FrameInputs, step = true) => step && times.push(inputs.time)};
    const inputs = (time: number, frameIndex: number) => ({time, duration: 10, frameIndex, variableValues: []});
    // Restarted at 4 s: 3 steps later it's 4.05 s.
    renderSteps(renderer, -1, 3 / STEPS_PER_SECOND, 4 + 3 / STEPS_PER_SECOND, inputs);
    expect(times).toHaveLength(4);
    times.forEach((time, step) => expect(time - 4).toBeCloseTo(step / STEPS_PER_SECOND, 6));
  });

  it("redraw the image without stepping when frames come faster than steps", () => {
    const {draws, steps} = play(120, 1);
    expect(draws.length).toBeGreaterThan(steps.length);
    for (const draw of draws.filter(d => !d.step)) {
      expect(draw.frameIndex).toBe(stepAt(draw.time));
    }
  });

  it("start again from the first step when the step count goes back", () => {
    const steps: number[] = [];
    const renderer = {render: (inputs: FrameInputs, step = true) => step && steps.push(inputs.frameIndex)};
    const inputs = (time: number, frameIndex: number) => ({time, duration: 1, frameIndex, variableValues: []});
    const rendered = renderSteps(renderer, -1, 5 / STEPS_PER_SECOND, 5 / STEPS_PER_SECOND, inputs);
    renderSteps(renderer, rendered, 1 / STEPS_PER_SECOND, 1 / STEPS_PER_SECOND, inputs);
    expect(steps).toEqual([0, 1, 2, 3, 4, 5, 0, 1]);
  });

  it("catch up at most so many steps in one frame", () => {
    const {draws} = play(2, 1, 4);
    expect(draws.filter(d => d.step).length).toBeLessThan(STEPS_PER_SECOND);
    expect(draws.at(-1)!.frameIndex).toBe(STEPS_PER_SECOND);
  });
});
