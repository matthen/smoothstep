import { describe, expect, it } from 'vitest';

import { endScrub, PAUSED, showsPlaying, startScrub, withPlaying, type PlaybackMode } from './playbackMode';

const PLAYING: PlaybackMode = {kind: "playing"};

describe("playback mode", () => {
  it("a scrub holds playback and goes back to what it was doing on release", () => {
    const scrubPlaying = startScrub(PLAYING);
    expect(scrubPlaying.kind).toBe("scrubbing");
    expect(showsPlaying(scrubPlaying)).toBe(true);
    expect(endScrub(scrubPlaying)).toEqual(PLAYING);
    expect(endScrub(startScrub(PAUSED))).toEqual(PAUSED);
  });

  it("a second scrub starting during one keeps the first one's resume", () => {
    expect(endScrub(startScrub(startScrub(PLAYING)))).toEqual(PLAYING);
  });

  it("playing or pausing during a scrub takes effect when it ends", () => {
    const paused = withPlaying(startScrub(PLAYING), false);
    expect(paused.kind).toBe("scrubbing");
    expect(endScrub(paused)).toEqual(PAUSED);
    expect(endScrub(withPlaying(startScrub(PAUSED), true))).toEqual(PLAYING);
  });

  it("ending a scrub that isn't under way changes nothing", () => {
    expect(endScrub(PLAYING)).toEqual(PLAYING);
    expect(endScrub(PAUSED)).toEqual(PAUSED);
  });
});
