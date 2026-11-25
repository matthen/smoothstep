import { describe, expect, it } from 'vitest';

import { videoTime } from './videoTexture';

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
