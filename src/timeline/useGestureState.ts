// The pointer gesture under way on the timeline, and where a click would start a new transition.
import { useEffect, useRef, useState } from 'react';

import { canHold, holdCreating, HOLD_MS, type Gesture } from './gestures';

// Transitions are identified by their row and start, which are unique as they don't overlap.
export interface Selection {
  row: number;
  startDSecs: number;
}

export function useGestureState() {
  const [gesture, setGestureState] = useState<Gesture>({kind: "idle"});
  // Pointer handlers read the gesture from here, as moves can arrive before React re-renders.
  const gestureRef = useRef<Gesture>(gesture);
  const [hover, setHover] = useState<Selection | null>(null);

  function setGesture(next: Gesture) {
    gestureRef.current = next;
    setGestureState(next);
  }

  // A finger held still on a row drags out the transition from there.
  useEffect(() => {
    if (!canHold(gesture)) {
      return;
    }
    const timer = setTimeout(() => setGesture(holdCreating(gestureRef.current)), HOLD_MS);
    return () => clearTimeout(timer);
  }, [gesture]);

  function cancelCreating() {
    setGesture({kind: "idle"});
    setHover(null);
  }

  return {gesture, gestureRef, setGesture, hover, setHover, cancelCreating};
}
