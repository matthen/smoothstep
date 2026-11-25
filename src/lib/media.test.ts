import { describe, expect, it } from 'vitest';

import { isVideoURL } from './media';

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
