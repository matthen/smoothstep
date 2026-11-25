// How pointer presses, moves and lifts on the timeline's rows add, move and resize transitions.
import type {Transition} from "../lib/document";
import {dragDeltaDSecs, draggedDuration, hoverEndDSecs, hoverStartDSecs, ROW_HEIGHT, rowAt, snapDSecs} from "./geometry";
import type {GrabMode} from "./geometry";
import {dragTransition, isInsertable} from "./transitions";

export type Gesture =
  | {kind: "idle"}
  // A new transition: dragged out with the button held, or clicked twice (`released` after the first).
  | Creating
  // The scale stays put while dragging, though the timeline's length can change.
  | {kind: "dragging"; mode: GrabMode; row: number; index: number; original: Transition[]; startX: number;
     moved: Transition; pxPerSecond: number}
  | {kind: "scrubbing"}
  | {kind: "duration"; startX: number; startDuration: number; latest: number; pxPerSecond: number};

export interface Span {
  row: number;
  startDSecs: number;
  endDSecs: number;
}

export interface Creating extends Span {
  kind: "creating";
  released: boolean;
  byTouch: boolean;
  // Where the press began, and for a finger, whether it moved far enough sideways to be a swipe or
  // was held still long enough to drag out the transition instead of scrolling.
  startX: number;
  swiped: boolean;
  held: boolean;
}

// How far a finger moves sideways before it's a swipe, about where browsers decide it's a scroll.
export const SWIPE_PX = 16;

// The shown rows' transitions, the last tenth of a second they may reach, and the scale.
export interface Rows {
  transitions: readonly (readonly Transition[])[];
  maxDSecs: number;
  pxPerSecond: number;
}

function fits(rows: Rows, {row, startDSecs, endDSecs}: Span): boolean {
  const transitions = rows.transitions[row];
  return transitions !== undefined && isInsertable(transitions, startDSecs, endDSecs, rows.maxDSecs);
}

// Where a press at (x, y) would start a new transition, if there's room for one there.
export function newTransitionAt(rows: Rows, x: number, y: number): {row: number; startDSecs: number} | null {
  const row = rowAt(y, rows.transitions.length);
  if (row === null) {
    return null;
  }
  const startDSecs = hoverStartDSecs(x, rows.pxPerSecond);
  return fits(rows, {row, startDSecs, endDSecs: startDSecs + 1}) ? {row, startDSecs} : null;
}

export function startCreating(rows: Rows, x: number, y: number, byTouch: boolean): Creating | null {
  const at = newTransitionAt(rows, x, y);
  return at && {
    kind: "creating", ...at, endDSecs: at.startDSecs + 1, released: false, byTouch, startX: x, swiped: false,
    held: false,
  };
}

// Moves a new transition's end to x, if it fits there.
export function extendCreating(gesture: Creating, rows: Rows, x: number): Creating {
  const swiped = gesture.swiped || Math.abs(x - gesture.startX) > SWIPE_PX;
  const endDSecs = hoverEndDSecs(x, gesture.startDSecs, rows.pxPerSecond);
  const moved = endDSecs !== gesture.endDSecs && fits(rows, {...gesture, endDSecs}) ? {...gesture, endDSecs} : gesture;
  return swiped === moved.swiped ? moved : {...moved, swiped};
}

// How long a finger stays still on a row before it drags out a transition instead of scrolling.
export const HOLD_MS = 300;

// Whether a finger is still down near where it pressed, so holding it there would start a drag.
export function canHold(gesture: Gesture): gesture is Creating {
  return gesture.kind === "creating" && gesture.byTouch && !gesture.released && !gesture.held && !gesture.swiped;
}

export function holdCreating(gesture: Gesture): Gesture {
  return canHold(gesture) ? {...gesture, held: true} : gesture;
}

// A finger's transition that has its start but not yet its end: tapped once, or held without dragging.
export function awaitingEnd(gesture: Gesture): boolean {
  return gesture.kind === "creating" && gesture.byTouch && (gesture.released || (gesture.held && !gesture.swiped));
}

// The gesture after the pointer moves to x; the same object if nothing changed.
export function moveGesture(gesture: Gesture, rows: Rows, x: number): Gesture {
  switch (gesture.kind) {
    case "creating":
      return extendCreating(gesture, rows, x);
    case "dragging": {
      const {original, index, mode, pxPerSecond} = gesture;
      const moved = dragTransition(original, index, mode, dragDeltaDSecs(x - gesture.startX, pxPerSecond),
        rows.maxDSecs, snapDSecs(pxPerSecond));
      return moved.startDSecs !== gesture.moved.startDSecs || moved.endDSecs !== gesture.moved.endDSecs ?
        {...gesture, moved} : gesture;
    }
    case "duration": {
      const latest = draggedDuration(gesture.startDuration, x - gesture.startX, gesture.pxPerSecond);
      return latest !== gesture.latest ? {...gesture, latest} : gesture;
    }
    default:
      return gesture;
  }
}

// The gesture after the pointer lifts at (x, y), and the transition to add, if any.
export function liftGesture(
  gesture: Gesture, rows: Rows, x: number, y: number, byTouch: boolean,
): {gesture: Gesture; add: Span | null} {
  const idle = {kind: "idle"} as const;
  if (gesture.kind !== "creating") {
    return {gesture: idle, add: null};
  }
  // A finger can't hover, so a second tap ends the transition where it lifts, if that's in the same row.
  if (byTouch && gesture.released) {
    const span = {...gesture, endDSecs: hoverEndDSecs(x, gesture.startDSecs, rows.pxPerSecond)};
    const add = Math.floor(y / ROW_HEIGHT) === gesture.row && fits(rows, span) ? span : null;
    return {gesture: idle, add};
  }
  // A click or tap without dragging waits for a second one to set the end. A finger counts as dragging
  // only once it's moved further than a wobble.
  const dragged = byTouch ? gesture.swiped : gesture.endDSecs > gesture.startDSecs + 1;
  if (!gesture.released && !dragged) {
    return {gesture: {...gesture, released: true}, add: null};
  }
  return {gesture: idle, add: fits(rows, gesture) ? gesture : null};
}

// The new transition to draw. A finger's shows once it's held, lifted as a tap, or swiped further than a
// scroll would start, so a scroll doesn't flash one.
export function shownCreating(gesture: Gesture): Creating | null {
  return gesture.kind === "creating" &&
    (!gesture.byTouch || gesture.released || gesture.held || gesture.swiped) ? gesture : null;
}

// The fingers down on the rows, and whether two were down at once since all were last lifted.
export interface Touches {
  down: ReadonlySet<number>;
  pinch: boolean;
}

export const NO_TOUCHES: Touches = {down: new Set(), pinch: false};

export function touchDown(touches: Touches, id: number): Touches {
  const down = new Set(touches.down).add(id);
  return {down, pinch: touches.pinch || down.size > 1};
}

export function touchUp(touches: Touches, id: number): Touches {
  const down = new Set(touches.down);
  down.delete(id);
  return {down, pinch: touches.pinch && down.size > 0};
}
