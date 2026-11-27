// Whether the animation is playing. A scrub holds the playhead still under the pointer, and on release
// goes back to playing if it was playing before.
export type PlaybackMode =
  | {kind: "paused"}
  | {kind: "playing"}
  | {kind: "scrubbing"; resume: boolean};

export const PAUSED: PlaybackMode = {kind: "paused"};

// What the play button shows: playing, or going back to playing once a scrub ends.
export function showsPlaying(mode: PlaybackMode): boolean {
  return mode.kind === "playing" || (mode.kind === "scrubbing" && mode.resume);
}

export function withPlaying(mode: PlaybackMode, playing: boolean): PlaybackMode {
  if (mode.kind === "scrubbing") {
    return mode.resume === playing ? mode : {kind: "scrubbing", resume: playing};
  }
  return playing ? {kind: "playing"} : PAUSED;
}

export function startScrub(mode: PlaybackMode): PlaybackMode {
  return mode.kind === "scrubbing" ? mode : {kind: "scrubbing", resume: mode.kind === "playing"};
}

export function endScrub(mode: PlaybackMode): PlaybackMode {
  if (mode.kind !== "scrubbing") {
    return mode;
  }
  return mode.resume ? {kind: "playing"} : PAUSED;
}
