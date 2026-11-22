// While an animation plays, a shader with state (buffers or iPrevFrame) moves on 60 times a second,
// so a simulation runs at the same speed on any screen and in an export at any frame rate. iFrame
// counts these steps.
import type { FrameInputs } from './Renderer';

export const STEPS_PER_SECOND = 60;

// The step reached `seconds` after the simulation restarted. Steps fall half a step early, so a 60Hz
// screen's slightly uneven frames each still take one step.
export function stepAt(seconds: number): number {
  return Math.floor(seconds * STEPS_PER_SECOND + 0.5);
}

export interface StepRenderer {
  readonly hasState: boolean;
  render(inputs: FrameInputs): void;
}

// The last step drawn (-1 for none since a restart) and the clock when it was drawn.
export interface Steps {
  rendered: number;
  clock: number;
}

export const RESTART: Steps = {rendered: -1, clock: 0};

// Draws the frame at iTime `time`, `clock` seconds after the simulation restarted, and returns the
// steps drawn. A shader with no state is drawn once. One with state takes each step it hasn't drawn,
// at the iTime that step fell at, and draws nothing between steps. At most `maxSteps` are taken in one
// call, so a page that falls behind runs the simulation slower rather than skipping steps. With the
// clock where it was, as when paused and a value changes, it draws once more without counting a step.
export function renderSteps(
  renderer: StepRenderer, steps: Steps, clock: number, time: number,
  inputs: (time: number, frameIndex: number) => FrameInputs, maxSteps = Infinity,
): Steps {
  const target = stepAt(clock);
  const restarted = steps.rendered < 0 || target < steps.rendered;
  if (!renderer.hasState) {
    renderer.render(inputs(time, target));
    return {rendered: target, clock};
  }
  if (!restarted && clock === steps.clock) {
    renderer.render(inputs(time, steps.rendered));
    return steps;
  }
  const from = restarted ? 0 : steps.rendered + 1;
  const to = Math.min(target, from + maxSteps - 1);
  for (let step = from; step <= to; step++) {
    renderer.render(inputs(Math.max(0, time - clock + step / STEPS_PER_SECOND), step));
  }
  return to < from ? {rendered: steps.rendered, clock} : {rendered: to, clock};
}
