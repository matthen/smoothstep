// Steps an animation's Canvas2D layer along with its shaders, in the preview and the players: each
// step the shaders draw is queued for the layer too, and the layer starts again when they do.
import type { CanvasLayer } from '../layer/CanvasLayer';
import type { FrameInputs, Renderer } from './Renderer';
import type { StepRenderer } from './steps';

export class LayerSteps implements StepRenderer {
  // The last frame number queued, or -1 for none since the layer restarted.
  private lastFrame = -1;

  constructor(private renderer: Renderer, private layer: CanvasLayer) {}

  get hasState(): boolean {
    return this.renderer.hasState;
  }

  // Whether to skip drawing for now, because the layer has fallen behind.
  get busy(): boolean {
    return this.layer.busy;
  }

  render(inputs: FrameInputs) {
    this.renderer.render(inputs);
    // Drawn again at the same step, as when scrubbing while paused: the layer keeps the frame it drew.
    if (inputs.frameIndex === this.lastFrame) {
      return;
    }
    if (inputs.frameIndex === 0 && this.lastFrame > 0) {
      this.layer.restart();
    }
    this.lastFrame = inputs.frameIndex;
    this.layer.push({
      time: inputs.time, frame: inputs.frameIndex, floats: inputs.variableValues,
      videoFrames: this.layer.needsVideoFrames ? this.renderer.videoFrames() : undefined,
    });
  }

  restart() {
    this.lastFrame = -1;
    this.layer.restart();
  }
}
