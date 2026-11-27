import { useRef, type PointerEvent as ReactPointerEvent } from 'react';

import { clampTime, grabMode, roundDuration, rowAt, xToTime } from './geometry';
import {
  extendCreating, liftGesture, moveGesture, newTransitionAt, NO_TOUCHES, startCreating, touchDown, touchUp,
  type Rows,
} from './gestures';
import { replaceTransition } from './transitions';
import type { useGestureState } from './useGestureState';
import type { useTransitionEditor } from './useTransitionEditor';

interface Options {
  gestures: ReturnType<typeof useGestureState>;
  editor: ReturnType<typeof useTransitionEditor>;
  rows: Rows;
  duration: number;
  onSeek(time: number): void;
  onDurationChange(duration: number): void;
}

// What pointers do on the rows, the ruler, the playhead and the duration handle: making, picking and
// dragging transitions, scrubbing, and changing the duration.
export function useTimelinePointer({gestures, editor, rows, duration, onSeek, onDurationChange}: Options) {
  const {gestureRef, setGesture, hover, setHover, cancelCreating} = gestures;
  const {selection, selected, selectedIndex, select} = editor;
  const pps = rows.pxPerSecond;
  const timeAreaRef = useRef<HTMLDivElement>(null);
  const touchesRef = useRef(NO_TOUCHES);

  // Pointer position relative to the rows, which scroll with the timeline.
  function position(event: {clientX: number; clientY: number}) {
    const rect = timeAreaRef.current!.getBoundingClientRect();
    return {x: event.clientX - rect.left, y: event.clientY - rect.top};
  }

  function updateHover(x: number, y: number) {
    if (rowAt(y, rows.transitions.length) === null) {
      return;
    }
    const next = newTransitionAt(rows, x, y);
    if (next?.row !== hover?.row || next?.startDSecs !== hover?.startDSecs) {
      setHover(next);
    }
  }

  function capture(event: ReactPointerEvent) {
    timeAreaRef.current?.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: ReactPointerEvent) {
    const gesture = gestureRef.current;
    const {x, y} = position(event);
    if (gesture.kind === "scrubbing") {
      onSeek(clampTime(xToTime(x, pps), duration));
      return;
    }
    if (gesture.kind === "idle") {
      // A finger has no hover, and its moves are scrolls.
      if (!selected && event.pointerType !== "touch") {
        updateHover(x, y);
      }
      return;
    }
    const next = moveGesture(gesture, rows, x);
    if (next === gesture) {
      return;
    }
    setGesture(next);
    if (next.kind === "duration") {
      onDurationChange(next.latest);
    } else if (next.kind === "dragging") {
      editor.moveSelected(next.row, replaceTransition(next.original, next.index, next.moved), next.moved.startDSecs);
    }
  }

  // Two fingers are a pinch, which neither starts nor ends a transition. Says whether a touch is done with.
  function touchDownHandled(event: ReactPointerEvent): boolean {
    const current = gestureRef.current;
    touchesRef.current = touchDown(touchesRef.current, event.pointerId);
    if (touchesRef.current.pinch) {
      if (current.kind === "creating" && !current.released) {
        cancelCreating();
      }
      return true;
    }
    // The second tap of a two-tap creation counts once it lifts, in case it's the start of a pinch.
    return current.kind === "creating" && current.released;
  }

  function onPointerDown(event: ReactPointerEvent) {
    const current = gestureRef.current;
    if (event.pointerType === "touch" && touchDownHandled(event)) {
      return;
    }
    // The second click of a click-twice creation sets the end where it lands.
    if (current.kind === "creating" && current.released) {
      setGesture(extendCreating(current, rows, position(event).x));
      return;
    }
    if (event.button !== 0 || current.kind !== "idle") {
      return;
    }
    if (selected) {
      if ((event.target as Element).classList.contains("variableRow")) {
        select(null);
      }
      return;
    }
    const {x, y} = position(event);
    const byTouch = event.pointerType === "touch";
    const next = startCreating(rows, x, y, byTouch);
    if (next) {
      if (!byTouch) {
        setHover({row: next.row, startDSecs: next.startDSecs});
      }
      setGesture(next);
      capture(event);
    }
  }

  // Forgets a lifted finger, and says whether it was part of a pinch.
  function liftTouch(event: ReactPointerEvent): boolean {
    const wasPinch = touchesRef.current.pinch;
    touchesRef.current = touchUp(touchesRef.current, event.pointerId);
    return wasPinch;
  }

  function onPointerUp(event: ReactPointerEvent) {
    const gesture = gestureRef.current;
    const byTouch = event.pointerType === "touch";
    if (byTouch && liftTouch(event)) {
      return;
    }
    if (gesture.kind === "duration") {
      onDurationChange(roundDuration(gesture.latest));
    }
    const {x, y} = position(event);
    const lifted = liftGesture(gesture, rows, x, y, byTouch);
    setGesture(lifted.gesture);
    if (lifted.add) {
      editor.create(lifted.add);
    } else if (gesture.kind === "creating" && lifted.gesture.kind === "idle") {
      setHover(null);
    }
  }

  function onPointerCancel(event: ReactPointerEvent) {
    if (event.pointerType === "touch") {
      liftTouch(event);
    }
    // A scroll between a transition's two taps keeps the start waiting for its end.
    const current = gestureRef.current;
    if (!(current.kind === "creating" && current.released)) {
      cancelCreating();
    }
  }

  function onPointerLeave(event: ReactPointerEvent) {
    // Touch pointers leave on every lift, which would cancel a click-twice creation.
    if (event.pointerType === "touch") {
      return;
    }
    // A transition waiting for its end click keeps waiting, wherever the pointer goes.
    const current = gestureRef.current;
    if (current.kind === "idle" || (current.kind === "creating" && !current.released)) {
      cancelCreating();
    }
  }

  function onTransitionPointerDown(event: ReactPointerEvent<HTMLDivElement>, row: number, index: number) {
    const current = gestureRef.current;
    if (event.button !== 0 || (current.kind === "creating" && !current.released)) {
      return;
    }
    // Picking a transition abandons a half-made one.
    if (current.kind === "creating") {
      cancelCreating();
    }
    event.stopPropagation();
    const transitions = rows.transitions[row]!;
    if (!(selection?.row === row && selectedIndex === index)) {
      select({row, startDSecs: transitions[index]!.startDSecs});
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const mode = grabMode(event.clientX - rect.left, rect.width);
    const original = transitions[index]!;
    setGesture({
      kind: "dragging", mode, row, index, original: transitions, startX: position(event).x, moved: original, pxPerSecond: pps,
    });
    capture(event);
  }

  // The playhead, or anywhere on the ruler, seeks and then scrubs as the pointer moves.
  function onScrubberPointerDown(event: ReactPointerEvent) {
    if (event.button !== 0) {
      return;
    }
    event.stopPropagation();
    const current = gestureRef.current;
    // A click on the ruler or playhead ends a transition waiting for its end there.
    if (current.kind === "creating" && current.released && event.pointerType !== "touch") {
      setGesture(extendCreating(current, rows, position(event).x));
      capture(event);  // So the rows hear the lift, which adds it.
      return;
    }
    if (current.kind === "creating") {
      cancelCreating();
    }
    setHover(null);
    onSeek(clampTime(xToTime(position(event).x, pps), duration));
    setGesture({kind: "scrubbing"});
    capture(event);
  }

  function onDurationPointerDown(event: ReactPointerEvent) {
    if (event.button !== 0) {
      return;
    }
    event.stopPropagation();
    select(null);
    setGesture({kind: "duration", startX: position(event).x, startDuration: duration, latest: duration, pxPerSecond: pps});
    capture(event);
  }

  return {
    timeAreaRef,
    rowHandlers: {onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onPointerLeave},
    onTransitionPointerDown, onScrubberPointerDown, onDurationPointerDown,
  };
}
