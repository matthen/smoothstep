import { afterEach, describe, expect, it, vi } from 'vitest';

import { VideoTexture, videoTime } from './videoTexture';

describe("videoTime", () => {
  it("follows the animation's time, starting the video again each time it ends", () => {
    expect(videoTime(0.5, 2)).toBe(0.5);
    expect(videoTime(2.5, 2)).toBe(0.5);
    expect(videoTime(4, 2)).toBe(0);
  });

  it("stays on the first frame until the video's length is known", () => {
    expect(videoTime(3, NaN)).toBe(0);
    expect(videoTime(3, Infinity)).toBe(0);
  });
});

// A loaded 2 second video at 30fps, whose frame times are rounded to whole milliseconds as in a WebM.
// Seeks wait for finishSeek, which snaps currentTime to the frame shown.
class FakeVideo extends EventTarget {
  readyState = 4;
  videoWidth = 64;
  videoHeight = 48;
  duration = 2;
  paused = true;
  seeking = false;
  seeks: number[] = [];
  crossOrigin = "";
  muted = false;
  playsInline = false;
  loop = false;
  preload = "";
  src = "";
  private time = 0;

  get currentTime() {
    return this.time;
  }

  set currentTime(time: number) {
    this.time = time;
    this.seeking = true;
    this.seeks.push(time);
  }

  // The frame shown at `time`.
  static frameAt(time: number): number {
    let frame = 0;
    while (Math.round((frame + 1) * 1000 / 30) / 1000 <= time) {
      frame++;
    }
    return frame;
  }

  finishSeek() {
    this.time = Math.round(FakeVideo.frameAt(this.time) * 1000 / 30) / 1000;
    this.seeking = false;
    this.dispatchEvent(new Event("seeked"));
  }

  play() {
    this.paused = false;
    return Promise.resolve();
  }

  pause() {
    this.paused = true;
  }

  removeAttribute() {}
  load() {}
}

async function videoTexture() {
  const video = new FakeVideo();
  const onFrame = vi.fn();
  const texture = new VideoTexture("blob:video", onFrame, video as unknown as HTMLVideoElement);
  await texture.whenLoaded();
  onFrame.mockClear();
  return {video, texture, onFrame};
}

afterEach(() => {
  vi.useRealTimers();
});

describe("VideoTexture", () => {
  it("while paused, seeks once to the frame at the animation's time, however the browser rounds it", async () => {
    const {video, texture, onFrame} = await videoTexture();
    texture.follow(0.52, false);
    expect(video.seeks).toHaveLength(1);
    expect(texture.isAt(0.52)).toBe(false);
    video.finishSeek();
    expect(onFrame).toHaveBeenCalled();
    expect(video.currentTime).not.toBe(0.52);
    texture.follow(0.52, false);
    texture.follow(0.52, false);
    expect(video.seeks).toHaveLength(1);
    expect(texture.isAt(0.52)).toBe(true);
    expect(texture.isAt(0.75)).toBe(false);
    texture.follow(2.75, false);
    expect(video.seeks).toHaveLength(2);
  });

  it("while playing, plays along and only seeks when it drifts too far", async () => {
    const {video, texture} = await videoTexture();
    texture.follow(1, true);
    expect(video.paused).toBe(false);
    expect(video.seeks).toHaveLength(1);
    texture.follow(1.05, true);
    expect(video.seeks).toHaveLength(1);  // Still seeking.
    video.finishSeek();
    texture.follow(1.1, true);
    expect(video.seeks).toHaveLength(1);
    expect(texture.settled).toBe(true);
    expect(texture.isAt(1.1)).toBe(false);
    texture.follow(1.5, true);
    expect(video.seeks).toHaveLength(2);
    expect(texture.settled).toBe(false);
  });

  it("on pausing, stops and seeks to exactly the frame at that time", async () => {
    const {video, texture} = await videoTexture();
    texture.follow(1, true);
    video.finishSeek();
    texture.follow(1.1, true);
    texture.follow(1.1, false);
    expect(video.paused).toBe(true);
    expect(video.seeks).toHaveLength(2);
    video.finishSeek();
    expect(texture.isAt(1.1)).toBe(true);
  });

  it("seeks into each frame for an export at the video's own frame rate, never the frame before", async () => {
    const {video, texture} = await videoTexture();
    for (let i = 0; i < 60; i++) {
      const seeked = texture.seek(i / 30);
      while (!video.seeking) {
        await Promise.resolve();
      }
      video.finishSeek();
      await seeked;
      expect(FakeVideo.frameAt(video.seeks.at(-1)!), `frame ${i}`).toBe(i);
    }
  });

  it("gives up on a seek that never finishes, saying so", async () => {
    vi.useFakeTimers();
    const {texture} = await videoTexture();
    const seeked = texture.seek(1);
    const failed = expect(seeked).rejects.toThrow(/took too long/);
    await vi.advanceTimersByTimeAsync(60_000);
    await failed;
  });
});
