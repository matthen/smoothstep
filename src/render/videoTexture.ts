// A texture slot's video, kept on the animation's clock: at animation time t it shows the video's
// frame at t, starting again from its first frame each time it ends.
import { videoLoaded } from '../lib/media';

// How far a playing video may drift from the animation before it's moved back into step.
const MAX_DRIFT = 0.15;
// Seeks land this far into a frame, so rounded frame times can't give the frame before.
const SEEK_NUDGE = 0.002;
// Seek targets this close are the same frame.
const SAME_TIME = 1e-4;
const SEEK_TIMEOUT_MS = 10_000;
const HAVE_CURRENT_DATA = 2;

// Where in a video of `duration` seconds the animation's time `t` falls.
export function videoTime(t: number, duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0) {
    return 0;
  }
  return ((t % duration) + duration) % duration;
}

// Where to seek a video of `duration` seconds to show its frame at animation time `t`.
function seekTime(t: number, duration: number): number {
  return videoTime(t + SEEK_NUDGE, duration);
}

// How far apart two times in a looping video are, the short way round.
function apart(a: number, b: number, duration: number): number {
  const d = Math.abs(a - b);
  return Number.isFinite(duration) && duration > 0 ? Math.min(d, duration - d) : d;
}

export class VideoTexture {
  readonly video: HTMLVideoElement;
  private loaded: Promise<void>;
  // Whether the video couldn't be loaded or decoded.
  failed = false;
  // Where the video was last sent while paused, or null while it plays.
  private sought: number | null = null;
  private seekStarted = 0;
  // A frame for the Canvas2D layer, drawn on this canvas and taken off it.
  private canvas: OffscreenCanvas | null = null;

  // `onFrame` is called when the video has a new frame to show while it isn't playing.
  constructor(url: string, onFrame: () => void, video = document.createElement("video")) {
    this.video = video;
    video.crossOrigin = "anonymous";
    video.muted = true;
    video.playsInline = true;
    video.loop = true;
    video.preload = "auto";
    video.addEventListener("seeked", () => {
      if (video.paused) {
        onFrame();
      }
    });
    video.src = url;
    this.loaded = videoLoaded(video).catch((error: unknown) => {
      console.warn(error);
      this.failed = true;
    }).then(onFrame);
  }

  // Whether there's a frame to draw.
  get ready(): boolean {
    return !this.failed && this.video.readyState >= HAVE_CURRENT_DATA && this.video.videoWidth > 0;
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

  // Whether the video has loaded or failed, and isn't moving to another time. A seek that takes
  // too long counts as done, so nothing waits for it for good.
  get settled(): boolean {
    return this.failed || (this.ready &&
      (!this.video.seeking || performance.now() - this.seekStarted > SEEK_TIMEOUT_MS));
  }

  // Whether the paused video shows exactly its frame at animation time `t`, or has failed.
  isAt(t: number): boolean {
    const video = this.video;
    return this.failed || (this.ready && video.paused && !video.seeking && this.sought !== null &&
      apart(this.sought, seekTime(t, video.duration), video.duration) <= SAME_TIME);
  }

  // Keeps the video near animation time `t` for the preview: playing along with it while it plays,
  // which is smooth, and showing exactly the frame at `t` while it's paused.
  follow(t: number, playing: boolean) {
    const video = this.video;
    if (!this.ready) {
      return;
    }
    if (playing) {
      this.sought = null;
      const target = videoTime(t, video.duration);
      if (video.paused) {
        this.moveTo(target);
        video.play().catch(() => {});
      } else if (!video.seeking && apart(video.currentTime, target, video.duration) > MAX_DRIFT) {
        this.moveTo(target);
      }
    } else {
      if (!video.paused) {
        video.pause();
      }
      // Compared with the last target rather than currentTime, which a browser may round.
      const target = seekTime(t, video.duration);
      if (this.sought === null || apart(this.sought, target, video.duration) > SAME_TIME) {
        this.sought = target;
        this.moveTo(target);
      }
    }
  }

  private moveTo(time: number) {
    this.seekStarted = performance.now();
    this.video.currentTime = time;
  }

  // Moves to exactly the frame at animation time `t`, and resolves once that frame can be drawn.
  async seek(t: number): Promise<void> {
    await this.loaded;
    const video = this.video;
    if (!this.ready) {
      throw new Error("A video texture couldn't be loaded.");
    }
    video.pause();
    const target = seekTime(t, video.duration);
    if (this.isAt(t)) {
      return;
    }
    this.sought = target;
    await new Promise<void>((resolve, reject) => {
      const done = (error?: Error) => {
        window.clearTimeout(timer);
        video.removeEventListener("seeked", seeked);
        video.removeEventListener("error", failed);
        if (error) {
          this.sought = null;
          reject(error);
        } else {
          resolve();
        }
      };
      const seeked = () => done();
      const failed = () => done(new Error("A video texture stopped playing."));
      const timer = window.setTimeout(() => done(new Error(
        `A video texture took too long to show its frame at ${t.toFixed(2)} s.`)), SEEK_TIMEOUT_MS);
      video.addEventListener("seeked", seeked);
      video.addEventListener("error", failed);
      this.moveTo(target);
    });
  }

  // The frame the video shows now, as a bitmap the Canvas2D layer's worker can take: black if it
  // hasn't loaded.
  frame(): ImageBitmap {
    const ready = this.ready;
    const [width, height] = ready ? [this.width, this.height] : [Math.max(1, this.width), Math.max(1, this.height)];
    if (this.canvas?.width !== width || this.canvas.height !== height) {
      this.canvas = new OffscreenCanvas(width, height);
    }
    const context = this.canvas.getContext("2d")!;
    if (ready) {
      context.drawImage(this.video, 0, 0);
    } else {
      context.fillStyle = "black";
      context.fillRect(0, 0, width, height);
    }
    return this.canvas.transferToImageBitmap();
  }

  dispose() {
    this.video.pause();
    this.video.removeAttribute("src");
    this.video.load();
  }
}
