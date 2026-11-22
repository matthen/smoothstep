// Buffers and iPrevFrame move on at a fixed rate, so a simulation runs at the same speed on any screen
// and in an export at any frame rate. iFrame counts these steps.
import type { FrameInputs } from './Renderer';

export const STEPS_PER_SECOND = 60;

// The step reached after `seconds` of playing since the simulation restarted.
export function stepAt(seconds: number): number {
  return Math.floor(seconds * STEPS_PER_SECOND + 1e-6);
}

export interface StepRenderer {
  render(inputs: FrameInputs, step?: boolean): void;
}

// Draws the frame at iTime `time`, `clock` seconds after the simulation restarted. First it takes the
// steps after `rendered`, the last step drawn, each at the iTime it fell at, so the simulation doesn't
// depend on the frame rate. Then it redraws the image at `time` if that's later than the last step.
// Taking at most `maxSteps` keeps a slow or hidden page from catching up all at once. Returns the last
// step drawn.
export function renderSteps(
  renderer: StepRenderer, rendered: number, clock: number, time: number,
  inputs: (time: number, frameIndex: number) => FrameInputs, maxSteps = Infinity,
): number {
  const target = stepAt(clock);
  const from = target < rendered ? 0 : Math.max(rendered + 1, target - maxSteps + 1);
  const timeOf = (step: number) => Math.max(0, time - clock + step / STEPS_PER_SECOND);
  for (let step = from; step <= target; step++) {
    renderer.render(inputs(timeOf(step), step), true);
  }
  if (from > target || time > timeOf(target) + 1e-9) {
    renderer.render(inputs(time, target), false);
  }
  return target < rendered ? target : Math.max(rendered, target);
}
