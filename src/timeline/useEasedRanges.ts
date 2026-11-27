import { useEffect, useRef, useState } from 'react';

import type { ValueRange } from './curves';

const DURATION_MS = 350;

const flat = (r: ValueRange) => !(r.hi - r.lo > 1e-9);
const same = (a: ValueRange, b: ValueRange) => a.lo === b.lo && a.hi === b.hi;
const lerp = (a: number, b: number, s: number) => a + (b - a) * s;

// Each row's value range as drawn: when a row's range changes, such as when its end value is
// stepped up, the drawing eases to the new one, so the curve visibly moves before it rescales.
// A row going to or from a single value jumps, since there's no scale to ease between.
export function useEasedRanges(targets: readonly ValueRange[]): readonly ValueRange[] {
  const [shown, setShownState] = useState(targets);
  // The effect reads what's drawn from here, mid-ease included.
  const shownRef = useRef(shown);
  const setShown = (next: readonly ValueRange[]) => {
    shownRef.current = next;
    setShownState(next);
  };
  const key = targets.map(r => r.lo + "," + r.hi).join(";");

  useEffect(() => {
    const from = shownRef.current;
    const easing = targets.map((to, i) => {
      const old = from[i];
      return old !== undefined && !same(old, to) && !flat(old) && !flat(to);
    });
    if (!easing.some(Boolean)) {
      setShown(targets);
      return;
    }
    const start = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / DURATION_MS);
      const s = 1 - (1 - t) ** 3;
      setShown(targets.map((to, i) => easing[i] ? {lo: lerp(from[i]!.lo, to.lo, s), hi: lerp(from[i]!.hi, to.hi, s)} : to));
      if (t < 1) {
        frame = requestAnimationFrame(step);
      }
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` stands for `targets`, which is a new array each render
  }, [key]);

  // Rows added or removed since the last change are drawn at their own range.
  return targets.map((to, i) => shown[i] ?? to);
}
