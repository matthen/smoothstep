import type { AspectRatio } from '../lib/document';

const MAX_RESOLUTION = 1280;
// The preview's drawing is sharp on high-DPI screens, up to this many device pixels along its long side.
const MAX_RATIO = 2;
const MAX_DRAWING = 2048;

// Fits the aspect ratio inside the container, at most MAX_RESOLUTION on either side.
export function fitCanvas(containerWidth: number, containerHeight: number, [aw, ah]: AspectRatio): [number, number] {
  let height = Math.min(MAX_RESOLUTION, containerHeight);
  let width = aw * height / ah;
  const maxWidth = Math.min(MAX_RESOLUTION, containerWidth);
  if (width > maxWidth) {
    height *= maxWidth / width;
    width = maxWidth;
  }
  return [Math.max(1, Math.round(width)), Math.max(1, Math.round(height))];
}

// The size to draw a preview shown at `width` × `height` CSS pixels: more pixels on a high-DPI
// screen, unless `lowRes`, but never fewer than CSS pixels.
export function drawingSize(width: number, height: number, devicePixelRatio: number, lowRes = false): [number, number] {
  const ratio = lowRes ? 1 :
    Math.max(1, Math.min(devicePixelRatio || 1, MAX_RATIO, MAX_DRAWING / Math.max(width, height)));
  return [Math.max(1, Math.round(width * ratio)), Math.max(1, Math.round(height * ratio))];
}

const SLOW_FPS = 27;
const SLOW_MS = 3000;
// Longer than this between frames is a pause, not a slow frame.
const GAP_MS = 500;

// Watches the frame rate while frames are drawn back to back, and says when it has stayed slow long
// enough that the preview should draw at 1×.
export class SlowFrames {
  private last: number | null = null;
  private frameMs = 0;
  private slowSince: number | null = null;

  // A frame was drawn at `now` ms. Returns the smoothed frame rate, or null without one yet.
  frame(now: number): number | null {
    const last = this.last;
    this.last = now;
    if (last === null || now - last > GAP_MS) {
      this.frameMs = 0;
      this.slowSince = null;
      return null;
    }
    this.frameMs = this.frameMs ? 0.9 * this.frameMs + 0.1 * (now - last) : now - last;
    const fps = 1000 / this.frameMs;
    this.slowSince = fps < SLOW_FPS ? this.slowSince ?? now : null;
    return fps;
  }

  // No frame was drawn this time round, so the next one starts a new run.
  idle() {
    this.last = null;
  }

  get slow(): boolean {
    return this.slowSince !== null && this.last !== null && this.last - this.slowSince >= SLOW_MS;
  }
}
