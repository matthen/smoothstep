// While an animation plays, a shader with state (buffers or iPrevFrame) moves on 60 times a second,
// so a simulation runs at the same speed on any screen and in an export at any frame rate. iFrame
// counts these steps.
import type { FrameInputs } from './Renderer';

export const STEPS_PER_SECOND = 60;

// The step reached `seconds` after the simulation restarted. Steps fall half a step early, so a 60Hz
// screen's slightly uneven frames each still take one.
export function stepAt(seconds: number): number {
  return Math.floor(seconds * STEPS_PER_SECOND + 0.5);
}

export interface StepRenderer {
  readonly hasState: boolean;
  render(inputs: FrameInputs): void;
}

export interface Steps {
  // The last step drawn, or -1 for none since a restart.
  rendered: number;
  // The clock when it was drawn.
  clock: number;
  // How many steps of the clock's were dropped, when frames came too slowly to take them all.
  dropped: number;
}

export const RESTART: Steps = {rendered: -1, clock: 0, dropped: 0};

// Whether the clock has gone back before the last step drawn, so the simulation starts again.
export function restarts(steps: Steps, clock: number): boolean {
  return stepAt(clock) - steps.dropped < steps.rendered;
}

// Draws the frame at iTime `time`, `clock` seconds after the simulation restarted, and returns the
// steps drawn.
// - A shader with no state is drawn once.
// - One with state takes each step that's due, at the iTime it fell at, and draws nothing between
//   steps. After a restart it draws only step 0, so set-up runs however late the first frame is.
// - It takes at most `maxSteps` in one call, and drops the rest, so a page that falls behind runs the
//   simulation slower rather than skipping ahead or catching up later.
// - With the clock where it was, as when paused and a value changes, it draws again at the same step.
export function renderSteps(
  renderer: StepRenderer, steps: Steps, clock: number, time: number,
  inputs: (time: number, frameIndex: number) => FrameInputs, maxSteps = Infinity,
): Steps {
  if (!renderer.hasState) {
    const step = stepAt(clock);
    renderer.render(inputs(time, step));
    return {rendered: step, clock, dropped: 0};
  }
  const due = stepAt(clock) - steps.dropped;
  if (steps.rendered < 0 || restarts(steps, clock)) {
    renderer.render(inputs(time, 0));
    return {rendered: 0, clock, dropped: stepAt(clock)};
  }
  if (clock === steps.clock) {
    renderer.render(inputs(time, steps.rendered));
    return steps;
  }
  const to = Math.min(due, steps.rendered + maxSteps);
  const timeOf = (step: number) => Math.max(0, time - clock + (step + steps.dropped) / STEPS_PER_SECOND);
  for (let step = steps.rendered + 1; step <= to; step++) {
    renderer.render(inputs(timeOf(step), step));
  }
  return {rendered: to, clock, dropped: steps.dropped + due - to};
}
