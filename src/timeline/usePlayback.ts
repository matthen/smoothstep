// The playhead, playing it, and the values the animation's variables have at a time.
import { useCallback, useEffect, useMemo, useState } from 'react';

import { variableValues, type Variable } from '../lib/document';
import { Playhead } from './playhead';
import { endScrub, PAUSED, showsPlaying, startScrub, withPlaying, type PlaybackMode } from './playbackMode';

// `values`, keeping its last answer: each row's value and slider asks for the same time's values every frame.
function lastAnswer(values: (time: number) => number[]): (time: number) => number[] {
  let last: {time: number; values: number[]} | null = null;
  return (time) => {
    if (last?.time !== time) {
      last = {time, values: values(time)};
    }
    return last.values;
  };
}

// `onLoop` hears when playing wraps back to the start, and `onRewind` when the playhead is put there.
export function usePlayback(duration: number, variables: Variable[], onLoop: () => void, onRewind: () => void) {
  const [playhead] = useState(() => new Playhead());
  const restartFrames = useCallback(() => playhead.restartSteps(), [playhead]);
  const [mode, setMode] = useState<PlaybackMode>(PAUSED);
  const isPlaying = showsPlaying(mode);
  const advancing = mode.kind === "playing";
  const setIsPlaying = useCallback((next: boolean | ((playing: boolean) => boolean)) =>
    setMode(m => withPlaying(m, typeof next === "function" ? next(showsPlaying(m)) : next)), []);
  const onScrubStart = useCallback(() => setMode(startScrub), []);
  const onScrubEnd = useCallback(() => setMode(endScrub), []);

  // Animated values held by their sliders, by row, until the animation plays or the playhead moves.
  const [held, setHeld] = useState<ReadonlyMap<number, number>>(new Map());
  // A hold only counts while the row is animated, so deleting its last transition lets it go.
  const heldRows = useMemo(() => new Map([...held].filter(([i]) => variables[i]!.transitions.length > 0)),
    [held, variables]);
  const valuesAt = useMemo(
    () => lastAnswer((time: number) => variableValues(variables, time).map((v, i) => heldRows.get(i) ?? v)),
    [variables, heldRows]);
  const hold = useCallback((row: number, value: number) => setHeld(h => new Map(h).set(row, value)), []);
  const releaseHolds = useCallback(() => setHeld(new Map()), []);
  // Playing hands every held value back to the timeline.
  const [wasPlaying, setWasPlaying] = useState(isPlaying);
  if (isPlaying !== wasPlaying) {
    setWasPlaying(isPlaying);
    if (isPlaying && held.size > 0) {
      setHeld(new Map());
    }
  }

  // Advance time while playing.
  useEffect(() => {
    if (!advancing) {
      return;
    }
    let id = 0;
    let last: number | null = null;
    const step = (now: number) => {
      if (last !== null) {
        const elapsed = Math.max(0, (now - last) / 1000);
        if (playhead.time + elapsed > duration) {
          onLoop();
          playhead.set(0, 0);
        } else {
          playhead.advance(elapsed);
        }
      }
      last = now;
      id = requestAnimationFrame(step);
    };
    id = requestAnimationFrame(step);
    return () => cancelAnimationFrame(id);
  }, [advancing, duration, playhead, onLoop]);

  const seek = useCallback((t: number) => {
    playhead.set(t);
    setHeld(h => h.size > 0 ? new Map() : h);  // Moving the playhead shows the timeline's values again.
    if (t === 0) {
      onRewind();
      restartFrames();
    }
  }, [playhead, restartFrames, onRewind]);

  // Keeps the playhead within a shorter animation.
  const clampTime = useCallback((max: number) => playhead.set(Math.min(playhead.time, max)), [playhead]);

  return {
    playhead, restartFrames, isPlaying, setIsPlaying, advancing, onScrubStart, onScrubEnd, heldRows, valuesAt, hold,
    releaseHolds, seek, clampTime,
  };
}
