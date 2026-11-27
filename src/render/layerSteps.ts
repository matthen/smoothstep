// Steps an animation's Canvas2D layer along with its shaders, in the preview and the players: each
// step the shaders draw is queued for the layer too, and the layer starts again when they do.
import type { CanvasLayer } from '../layer/CanvasLayer';
import type { FrameInputs, Renderer } from './Renderer';
import type { StepRenderer } from './steps';

export class LayerSteps implements StepRenderer {
  // The last frame number queued, or -1 for none since the layer restarted.
  private lastFrame = -1;
  // Whether that step's video frames were exactly those at its time, as they are while paused.
  private exact = true;

  constructor(private renderer: Renderer, private layer: CanvasLayer) {}

  get hasState(): boolean {
    return this.renderer.hasState;
  }

  // Whether to skip drawing for now, because the layer has fallen behind.
  get busy(): boolean {
    return this.layer.busy;
  }

  // Whether to wait before drawing, until the videos the layer reads have loaded or moved to their time.
  get waitingForVideos(): boolean {
    return this.layer.needsVideoFrames && !this.renderer.videosSettled;
  }

  render(inputs: FrameInputs) {
    this.renderer.render(inputs);
    this.queue(inputs);
  }

  redraw(inputs: FrameInputs) {
    this.renderer.redraw(inputs);
    this.queue(inputs);
  }

  private queue(inputs: FrameInputs) {
    // Drawn again at the same step, as when scrubbing while paused: the layer keeps the frame it drew,
    // unless its videos have since moved to exactly their frames, as after pausing.
    const videos = this.layer.needsVideoFrames;
    if (inputs.frameIndex === this.lastFrame && (!videos || this.exact || !this.renderer.videosAt(inputs.time))) {
      return;
    }
    if (inputs.frameIndex === 0 && this.lastFrame > 0) {
      this.layer.restart();
    }
    this.lastFrame = inputs.frameIndex;
    this.exact = !videos || this.renderer.videosAt(inputs.time);
    this.layer.push({
      time: inputs.time, frame: inputs.frameIndex, floats: inputs.variableValues,
      videoFrames: videos ? this.renderer.videoFrames() : undefined,
    });
  }

  restart() {
    this.lastFrame = -1;
    this.exact = true;
    this.layer.restart();
  }
}
