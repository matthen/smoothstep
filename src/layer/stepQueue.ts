// The steps waiting for a Canvas2D layer's worker, sent to it in batches. Steps that won't be
// drawn have their video frames closed, as nothing else will.
import type { LayerInputs } from './runtime';

// Steps waiting to be drawn before whoever is pushing them should wait.
const MAX_WAITING = 12;

function closeVideoFrames(step: LayerInputs) {
  step.videoFrames?.forEach(frame => frame.bitmap.close());
}

export class StepQueue {
  private steps: LayerInputs[] = [];
  private nextBatch = 1;

  // Queues a step, or closes its video frames if the layer isn't `accepting` steps.
  push(step: LayerInputs, accepting: boolean) {
    if (accepting) {
      this.steps.push(step);
    } else {
      closeVideoFrames(step);
    }
  }

  drop() {
    this.steps.forEach(closeVideoFrames);
    this.steps = [];
  }

  get empty(): boolean {
    return this.steps.length === 0;
  }

  get full(): boolean {
    return this.steps.length >= MAX_WAITING;
  }

  // Every waiting step as one batch, with the video frames to transfer with it.
  take(): {id: number; steps: LayerInputs[]; transfer: ImageBitmap[]} | null {
    if (this.empty) {
      return null;
    }
    const steps = this.steps;
    this.steps = [];
    return {id: this.nextBatch++, steps, transfer: steps.flatMap(step => (step.videoFrames ?? []).map(frame => frame.bitmap))};
  }
}
