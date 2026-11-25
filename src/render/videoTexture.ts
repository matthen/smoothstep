// A texture slot's video, kept on the animation's clock: at animation time t it shows the video's
// frame at t, starting again from its first frame each time it ends.

// How far a playing video may drift from the animation before it's moved back into step.
const MAX_DRIFT = 0.15;

// Where in a video of `duration` seconds the animation's time `t` falls.
export function videoTime(t: number, duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0) {
    return 0;
  }
  return ((t % duration) + duration) % duration;
}

// How far apart two times in a looping video are, the short way round.
function apart(a: number, b: number, duration: number): number {
  const d = Math.abs(a - b);
  return Number.isFinite(duration) && duration > 0 ? Math.min(d, duration - d) : d;
}

export class VideoTexture {
  readonly video = document.createElement("video");
  private loaded: Promise<void>;
  // A frame for the Canvas2D layer, drawn on this canvas and taken off it.
  private canvas: OffscreenCanvas | null = null;

  // `onFrame` is called when the video has a new frame to show while it isn't playing.
  constructor(url: string, onFrame: () => void) {
    const video = this.video;
    video.crossOrigin = "anonymous";
    video.muted = true;
    video.playsInline = true;
    video.loop = true;
    video.preload = "auto";
    this.loaded = new Promise(resolve => {
      video.addEventListener("loadeddata", () => resolve(), {once: true});
      video.addEventListener("error", () => resolve(), {once: true});
    });
    video.addEventListener("loadeddata", onFrame);
    video.addEventListener("seeked", () => {
      if (video.paused) {
        onFrame();
      }
    });
    video.src = url;
  }

  // Whether there's a frame to draw.
  get ready(): boolean {
    return this.video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && this.video.videoWidth > 0;
  }

  get width(): number {
    return this.video.videoWidth;
  }

  get height(): number {
    return this.video.videoHeight;
  }

  // Resolves once the first frame has loaded, or the video failed to.
  whenLoaded(): Promise<void> {
    return this.loaded;
  }

  // Keeps the video near animation time `t` for the preview: playing along with it while it plays,
  // which is smooth, and showing exactly the frame at `t` while it's paused.
  follow(t: number, playing: boolean) {
    const video = this.video;
    if (!this.ready) {
      return;
    }
    const target = videoTime(t, video.duration);
    if (playing) {
      if (video.paused) {
        video.currentTime = target;
        video.play().catch(() => {});
      } else if (!video.seeking && apart(video.currentTime, target, video.duration) > MAX_DRIFT) {
        video.currentTime = target;
      }
    } else {
      if (!video.paused) {
        video.pause();
      }
      if (video.currentTime !== target) {
        video.currentTime = target;
      }
    }
  }

  // Moves to exactly the frame at animation time `t`, and resolves once that frame can be drawn.
  async seek(t: number): Promise<void> {
    await this.loaded;
    const video = this.video;
    if (!this.ready) {
      return;
    }
    video.pause();
    const target = videoTime(t, video.duration);
    if (video.currentTime === target && !video.seeking) {
      return;
    }
    await new Promise<void>(resolve => {
      const done = () => {
        video.removeEventListener("seeked", done);
        video.removeEventListener("error", done);
        resolve();
      };
      video.addEventListener("seeked", done);
      video.addEventListener("error", done);
      video.currentTime = target;
    });
  }

  // The frame the video shows now, as a bitmap the Canvas2D layer's worker can take.
  frame(): ImageBitmap | null {
    if (!this.ready) {
      return null;
    }
    if (this.canvas?.width !== this.width || this.canvas.height !== this.height) {
      this.canvas = new OffscreenCanvas(this.width, this.height);
    }
    const context = this.canvas.getContext("2d");
    if (!context) {
      return null;
    }
    context.drawImage(this.video, 0, 0);
    return this.canvas.transferToImageBitmap();
  }

  dispose() {
    this.video.pause();
    this.video.removeAttribute("src");
    this.video.load();
  }
}
