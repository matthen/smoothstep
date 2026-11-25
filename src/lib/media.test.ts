import { describe, expect, it } from 'vitest';

import { formatDuration, isVideoURL } from './media';

describe("formatDuration", () => {
  it("gives short videos in seconds, to a tenth", () => {
    expect(formatDuration(6.5065)).toBe("6.5 s");
    expect(formatDuration(6)).toBe("6 s");
    expect(formatDuration(0.04)).toBe("0.04 s");
    expect(formatDuration(59.9)).toBe("59.9 s");
  });

  it("gives longer videos in minutes and whole seconds", () => {
    expect(formatDuration(59.96)).toBe("1 min");
    expect(formatDuration(72.4)).toBe("1 min 12 s");
    expect(formatDuration(120)).toBe("2 min");
    expect(formatDuration(3599.6)).toBe("60 min");
  });

  it("gives nothing when the length isn't known", () => {
    expect(formatDuration(undefined)).toBeNull();
    expect(formatDuration(Infinity)).toBeNull();
    expect(formatDuration(NaN)).toBeNull();
    expect(formatDuration(0)).toBeNull();
  });
});

describe("isVideoURL", () => {
  it("knows built-in videos by their extension, wherever the app is served", () => {
    expect(isVideoURL("/images/textures/videos/waves.mp4")).toBe(true);
    expect(isVideoURL("https://example.com/sub/images/textures/videos/clip.webm?v=2")).toBe(true);
    expect(isVideoURL("/images/textures/photos/cats1.jpg")).toBe(false);
  });

  it("knows uploaded videos by their data URL's type, not by any extension", () => {
    expect(isVideoURL("data:video/mp4;base64,AAAA")).toBe(true);
    expect(isVideoURL("data:image/png;base64,AAAA")).toBe(false);
    expect(isVideoURL("blob:http://localhost/abc.mp4")).toBe(false);
  });
});
