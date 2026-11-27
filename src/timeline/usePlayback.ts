import { useCallback, useEffect, useMemo, useState } from 'react';

import { variableValues, type Variable } from '../lib/document';
import { useLatest } from '../lib/useLatest';

// The playhead, playing it, and the values the animation's variables have there.
// `onLoop` hears when playing wraps back to the start, and `onRewind` when the playhead is put there.
export function usePlayback(duration: number, variables: Variable[], onLoop: () => void, onRewind: () => void) {
  const [time, setTime] = useState(0);
  // Seconds played since the simulation last restarted, which set how many steps it has taken.
  const [stepClock, setStepClock] = useState(0);
  const restartFrames = useCallback(() => setStepClock(0), []);
  const [isPlaying, setIsPlaying] = useState(false);
  const [scrubbing, setScrubbing] = useState(false);
  // Latest time for the play loop, which shouldn't restart every frame.
  const timeRef = useLatest(time);

  // Animated values held by their sliders, by row, until the animation plays or the playhead moves.
  const [held, setHeld] = useState<ReadonlyMap<number, number>>(new Map());
  // A hold only counts while the row is animated, so deleting its last transition lets it go.
  const heldRows = useMemo(() => new Map([...held].filter(([i]) => variables[i]!.transitions.length > 0)),
    [held, variables]);
  const values = useMemo(() => variableValues(variables, time).map((v, i) => heldRows.get(i) ?? v),
    [variables, time, heldRows]);
  const hold = (row: number, value: number) => setHeld(h => new Map(h).set(row, value));
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
    if (!isPlaying || scrubbing) {
      return;
    }
    let id = 0;
    let last: number | null = null;
    const step = (now: number) => {
      if (last !== null) {
        const elapsed = Math.max(0, (now - last) / 1000);
        const next = timeRef.current + elapsed;
        if (next > duration) {
          onLoop();
          setTime(0);
          restartFrames();
        } else {
          setTime(next);
          setStepClock(clock => clock + elapsed);
        }
      }
      last = now;
      id = requestAnimationFrame(step);
    };
    id = requestAnimationFrame(step);
    return () => cancelAnimationFrame(id);
  }, [isPlaying, scrubbing, duration, timeRef, restartFrames, onLoop]);

  const seek = useCallback((t: number) => {
    setTime(t);
    setHeld(new Map());  // Moving the playhead shows the timeline's values again.
    if (t === 0) {
      onRewind();
      restartFrames();
    }
  }, [restartFrames, onRewind]);

  // Keeps the playhead within a shorter animation.
  const clampTime = useCallback((max: number) => setTime(t => Math.min(t, max)), []);

  return {
    time, stepClock, restartFrames, isPlaying, setIsPlaying, scrubbing, setScrubbing, heldRows, values, hold,
    releaseHolds, seek, clampTime,
  };
}
