import { describe, expect, it } from 'vitest';

import { holdsBack } from './layerSteps';
import { RESTART, STEPS_PER_SECOND } from './steps';

describe("holdsBack", () => {
  const busy = {busy: true, waitingForVideos: false};
  const midway = {rendered: 2 * STEPS_PER_SECOND, clock: 2, dropped: 0};

  it("waits on a layer that has fallen behind", () => {
    expect(holdsBack(busy, midway, 2.5)).toBe(true);
    expect(holdsBack({busy: false, waitingForVideos: false}, midway, 2.5)).toBe(false);
  });

  it("lets a restart through a busy layer, whether just restarted or with the clock gone back", () => {
    expect(holdsBack(busy, RESTART, 0)).toBe(false);
    expect(holdsBack(busy, midway, 0)).toBe(false);
  });

  it("waits for the videos the layer reads, even to restart", () => {
    const videos = {busy: false, waitingForVideos: true};
    expect(holdsBack(videos, midway, 2.5)).toBe(true);
    expect(holdsBack(videos, RESTART, 0)).toBe(true);
  });

  it("never waits without a layer", () => {
    expect(holdsBack(undefined, midway, 2.5)).toBe(false);
  });
});
