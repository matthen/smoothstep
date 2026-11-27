import { useEffect, useRef, useState, type RefObject } from 'react';

import type { SlowFrames } from './layout';
import type { FoundRange } from './probeRange';
import type { CanvasRefs } from './useCanvasLayer';

interface Options {
  refs: CanvasRefs;
  // Set when the canvas draws, so the inspector reads its point again.
  needsReadRef: RefObject<boolean>;
  frames: RefObject<SlowFrames>;
  renderFrame: () => void;
  readIfDue: (now: number) => void;
  // The preview stayed too slow at full resolution.
  onSlow: () => void;
}

// Renders on animation frames when something changed, keeping a smoothed frame rate, and dropping
// to 1× if it stays slow. Returns the frame rate and what Auto found, as last shown.
export function useRenderLoop({refs, needsReadRef, frames, renderFrame, readIfDue, onSlow}: Options) {
  const {rendererRef, needsRender: needsRenderRef, needsPresent: needsPresentRef} = refs;
  const [fps, setFps] = useState<number | null>(null);
  const [found, setFound] = useState<FoundRange>(null);
  const foundRef = useRef<FoundRange>(null);

  useEffect(() => {
    let id = 0;
    let updates = 0;
    const loop = (now: number) => {
      if (!needsRenderRef.current && needsPresentRef.current) {
        rendererRef.current?.refresh();
        needsReadRef.current = true;
      }
      needsPresentRef.current = false;
      if (needsRenderRef.current) {
        needsRenderRef.current = false;
        needsReadRef.current = true;
        renderFrame();
        const rate = frames.current.frame(now);
        if (rate !== null) {
          updates += 1;
          if (updates % 10 === 0) {
            const value = Math.round(rate);
            setFps(value > 20 ? Math.round(value / 3) * 3 : value);
          }
          if (frames.current.slow) {
            onSlow();
          }
        }
      } else {
        frames.current.idle();
        // While nothing new draws, Auto catches up with the last frame.
        if (rendererRef.current?.findRange(now, true)) {
          rendererRef.current.present();
        }
      }
      const nextFound = rendererRef.current?.foundRange ?? null;
      if (nextFound?.[0] !== foundRef.current?.[0] || nextFound?.[1] !== foundRef.current?.[1]) {
        foundRef.current = nextFound;
        setFound(nextFound);
      }
      readIfDue(now);
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, [renderFrame, readIfDue, onSlow, rendererRef, needsRenderRef, needsPresentRef, needsReadRef, frames]);

  return {fps, found};
}
