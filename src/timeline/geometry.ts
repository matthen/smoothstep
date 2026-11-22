// Pixel layout of the timeline. The scale, in pixels per second, fits the timeline to the panel's
// width and grows as it's zoomed in; a "dsec" is a tenth of a second.
import type {Variable} from "../lib/document";

// The scale before the panel's width is known.
export const DEFAULT_PX_PER_SECOND = 40;
// The furthest zoom in, unless fitting the timeline needs more.
export const MAX_PX_PER_SECOND = 400;
// Room after the timeline's end, so its last tick and the end marker aren't at the edge.
const END_PADDING = 12;
export const ROW_HEIGHT = 30;
// Rows only react to the pointer between these heights, where the transitions are drawn.
export const ROW_BAND_TOP = 3;
export const ROW_BAND_BOTTOM = 27;

export function timeToX(seconds: number, pxPerSecond: number): number {
  return seconds * pxPerSecond;
}

export function xToTime(x: number, pxPerSecond: number): number {
  return x / pxPerSecond;
}

export function clampTime(seconds: number, duration: number): number {
  return Math.max(0, Math.min(duration, seconds));
}

// The last tenth of a second a transition may end at.
export function durationDSecs(duration: number): number {
  return Math.floor(duration * 10 + 1e-6);
}

// The row under a y offset in the rows' box, if it's within that row's band.
export function rowAt(y: number, numRows: number): number | null {
  const row = Math.floor(y / ROW_HEIGHT);
  const inRow = y - row * ROW_HEIGHT;
  if (row < 0 || row >= numRows || inRow < ROW_BAND_TOP || inRow > ROW_BAND_BOTTOM) {
    return null;
  }
  return row;
}

// Up to 2px of slack when snapping the pointer to a tenth of a second, less when tenths are narrow.
function slack(pxPerSecond: number): number {
  return Math.min(2, pxPerSecond / 20);
}

// Where a new transition starts when the pointer is at x, snapped to a tenth of a second.
export function hoverStartDSecs(x: number, pxPerSecond: number): number {
  return Math.max(0, Math.floor((x - slack(pxPerSecond)) * 10 / pxPerSecond));
}

// Where a transition being created ends when the pointer is at x; always at least 0.1s long.
export function hoverEndDSecs(x: number, startDSecs: number, pxPerSecond: number): number {
  return Math.max(startDSecs + 1, Math.floor((x + slack(pxPerSecond)) * 10 / pxPerSecond));
}

// Pointer offsets within a selected transition's block that grab its edges rather than move it.
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

// Times are kept to a hundredth of a second: tenths of a second with one decimal place.
export function roundDSecs(dsecs: number): number {
  return Math.round(dsecs * 10) / 10;
}

// The step a drag moves in, in tenths of a second: 0.1s, or as fine as 0.01s when zoomed in far
// enough that each step is still a few pixels.
export function snapDSecs(pxPerSecond: number): number {
  return [0.1, 0.2, 0.5].find(step => step * pxPerSecond / 10 >= 4) ?? 1;
}

// Pixels of pointer movement in tenths of a second, in steps of snapDSecs.
export function dragDeltaDSecs(deltaX: number, pxPerSecond: number): number {
  const step = snapDSecs(pxPerSecond);
  return roundDSecs(step * Math.round(deltaX * 10 / pxPerSecond / step));
}

// The timeline extends a little past the duration (a twentieth, at least 0.2s, rounded up to a
// tenth), or to the end of the last transition.
export function maxTimeFor(variables: readonly Variable[], duration: number): number {
  let maxTime = Math.ceil((duration + Math.max(0.2, duration / 20)) * 10 - 1e-6) / 10;
  for (const variable of variables) {
    const last = variable.transitions[variable.transitions.length - 1];
    if (last) {
      maxTime = Math.max(maxTime, 0.1 * last.endDSecs);
    }
  }
  return maxTime;
}

export function timeAreaWidth(maxTime: number, pxPerSecond: number): number {
  return pxPerSecond * maxTime + END_PADDING;
}

// The scale that shows the whole timeline in `width` pixels.
export function fitPxPerSecond(width: number, maxTime: number): number {
  return Math.max(0.01, (width - END_PADDING) / maxTime);
}

// Zoom is a multiple of the fitted scale: 1 fits, and it goes up to MAX_PX_PER_SECOND.
export function clampZoom(zoom: number, fitScale: number): number {
  return Math.max(1, Math.min(zoom, MAX_PX_PER_SECOND / fitScale));
}

// Tick spacings in seconds, with the finer spacings each can be split into.
const STEPS: readonly [number, number[]][] = [
  [0.1, []], [0.2, [0.1]], [0.5, [0.1]], [1, [0.1, 0.2, 0.5]], [2, [0.5, 1]], [5, [1]],
  [10, [1, 2, 5]], [15, [5]], [30, [5, 10]], [60, [10, 30]], [120, [30, 60]], [300, [60]],
  [600, [60, 120, 300]], [900, [300]], [1800, [300, 600]], [3600, [600, 1800]],
];
// The closest labelled ticks may be, and the closest unlabelled ones.
const MIN_LABEL_SPACING = 56;
const MIN_MINOR_SPACING = 8;

export interface Ruler {
  // Seconds between labelled ticks, which the rows' grid lines follow.
  step: number;
  major: {time: number; label: string}[];
  minor: number[];
}

// The ruler's ticks between `from` and `to` seconds, as far apart as the scale needs.
export function rulerTicks(pxPerSecond: number, from: number, to: number, maxTime: number): Ruler {
  const [step, splits] = STEPS.find(([s]) => s * pxPerSecond >= MIN_LABEL_SPACING) ?? STEPS[STEPS.length - 1]!;
  const minorStep = splits.find(s => s * pxPerSecond >= MIN_MINOR_SPACING);
  const decimals = step < 1 ? 1 : 0;
  const minutes = maxTime >= 60;
  const major: Ruler["major"] = [];
  const minor: number[] = [];
  const unit = minorStep ?? step;
  const per = Math.round(step / unit);
  for (let i = Math.max(0, Math.floor(from / unit)); i * unit <= to + 1e-9; i++) {
    const time = Math.round(i * unit * 10) / 10;
    if (i % per === 0) {
      major.push({time, label: tickLabel(time, decimals, minutes)});
    } else {
      minor.push(time);
    }
  }
  return {step, major, minor};
}

function tickLabel(time: number, decimals: number, minutes: boolean): string {
  if (!minutes) {
    return time.toFixed(decimals);
  }
  const fraction = decimals > 0 ? (time % 1).toFixed(decimals).slice(1) : "";
  return formatTime(time) + fraction;
}

// Durations dragged with the timeline's end marker, to the hundredth while dragging.
export function draggedDuration(startDuration: number, deltaX: number, pxPerSecond: number): number {
  return Math.max(0.1, Math.round((startDuration + xToTime(deltaX, pxPerSecond)) * 100) / 100);
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
