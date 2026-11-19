// Pixel layout of the timeline: 40px per second, so 4px per tenth of a second (a "dsec").
import type {Variable} from "../lib/document";

export const PX_PER_SECOND = 40;
export const PX_PER_DSEC = PX_PER_SECOND / 10;
export const ROW_HEIGHT = 28;
// Rows only react to the pointer between these heights, where the transition bars are drawn.
const ROW_BAND_TOP = 4;
const ROW_BAND_BOTTOM = 23;

export function timeToX(seconds: number): number {
  return seconds * PX_PER_SECOND;
}

export function xToTime(x: number): number {
  return x / PX_PER_SECOND;
}

export function clampTime(seconds: number, duration: number): number {
  return Math.max(0, Math.min(duration, seconds));
}

// The last tenth of a second a transition may end at.
export function durationDSecs(duration: number): number {
  return Math.floor(duration * 10 + 1e-6);
}

// The row under a y offset in the rows' box, if it's within that row's bar.
export function rowAt(y: number, numRows: number): number | null {
  const row = Math.floor(y / ROW_HEIGHT);
  const inRow = y - row * ROW_HEIGHT;
  if (row < 0 || row >= numRows || inRow < ROW_BAND_TOP || inRow > ROW_BAND_BOTTOM) {
    return null;
  }
  return row;
}

// Where a new transition starts when the pointer is at x, snapped to a tenth of a second.
export function hoverStartDSecs(x: number): number {
  return Math.max(0, Math.floor((x - 2) / PX_PER_DSEC));
}

// Where a transition being created ends when the pointer is at x; always at least 0.1s long.
export function hoverEndDSecs(x: number, startDSecs: number): number {
  return Math.max(startDSecs + 1, Math.floor((x + 2) / PX_PER_DSEC));
}

// Pointer offsets within a selected transition's bar that grab its edges rather than move it.
export type GrabMode = "move" | "resizeLeft" | "resizeRight";

export function grabMode(offsetX: number, width: number): GrabMode {
  if (offsetX <= 2) {
    return "resizeLeft";
  }
  if (offsetX >= width - 4) {
    return "resizeRight";
  }
  return "move";
}

// Pixels of pointer movement as whole tenths of a second.
export function dragDeltaDSecs(deltaX: number): number {
  return Math.round(deltaX / PX_PER_DSEC);
}

// The timeline extends half a second past the duration, or to the end of the last transition.
export function maxTimeFor(variables: readonly Variable[], duration: number): number {
  let maxTime = Math.ceil(duration + 0.5);
  for (const variable of variables) {
    const last = variable.transitions[variable.transitions.length - 1];
    if (last) {
      maxTime = Math.max(maxTime, 0.1 * last.endDSecs);
    }
  }
  return maxTime;
}

export function timeAreaWidth(maxTime: number): number {
  return PX_PER_SECOND * maxTime + 20;
}

// Labels for the header: every second, or every ten seconds for very long animations.
export function headerTicks(maxTime: number): {labels: number[]; tens: boolean} {
  const count = Math.ceil(maxTime);
  if (maxTime > 1000) {
    const labels: number[] = [];
    for (let s = 10; s <= count; s += 10) {
      labels.push(s);
    }
    labels.pop();
    return {labels, tens: true};
  }
  return {labels: Array.from({length: count}, (_, i) => i + 1), tens: false};
}

// Durations dragged with the timeline's end marker, to the hundredth while dragging.
export function draggedDuration(startDuration: number, deltaX: number): number {
  return Math.max(0.1, Math.round((startDuration + xToTime(deltaX)) * 100) / 100);
}

export function roundDuration(duration: number): number {
  return Math.max(0.1, Math.round(duration * 10) / 10);
}

// m:ss, or h:mm:ss past an hour, rounding down to the second.
export function formatTime(seconds: number): string {
  const sign = seconds < 0 ? "-" : "";
  const total = Math.floor(Math.abs(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = String(total % 60).padStart(2, "0");
  return hours > 0
    ? `${sign}${hours}:${String(minutes).padStart(2, "0")}:${secs}`
    : `${sign}${minutes}:${secs}`;
}
