// SVG paths that draw a row's value over time: each transition's curve, and the level held between.
import {transitionValue} from "../lib/document";
import type {Transition} from "../lib/document";
import {ROW_BAND_BOTTOM, ROW_BAND_TOP} from "./geometry";

// Space between the curves and the top and bottom of the transitions' blocks.
const INSET = 4;

export interface RowPaths {
  // One per transition, from its start value to its end value.
  curves: string[];
  // The value held before, between and after the transitions.
  held: string;
}

// The y in a row for each value, with the row's lowest value at the bottom of its band and the
// highest at the top. A row whose values are all the same is drawn across the middle.
export function valueToY(transitions: readonly Transition[]): (value: number) => number {
  // An overshoot goes past its end value, so its peak counts too.
  const values = transitions.flatMap(t => t.type === "overshoot" ?
    [t.startValue, t.endValue, transitionValue(t, (t.startDSecs + 0.58 * (t.endDSecs - t.startDSecs)) / 10)] :
    [t.startValue, t.endValue]).filter(Number.isFinite);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const top = ROW_BAND_TOP + INSET;
  const bottom = ROW_BAND_BOTTOM - INSET;
  if (!(hi - lo > 1e-9)) {
    return () => (top + bottom) / 2;
  }
  return value => bottom - (value - lo) / (hi - lo) * (bottom - top);
}

const round = (x: number) => Math.round(x * 10) / 10;

export function rowPaths(transitions: readonly Transition[], pxPerSecond: number, endX: number): RowPaths {
  if (transitions.length === 0) {
    return {curves: [], held: ""};
  }
  const y = valueToY(transitions);
  const pxPerDSec = pxPerSecond / 10;
  const curves = transitions.map(t => {
    const x0 = t.startDSecs * pxPerDSec;
    const x1 = t.endDSecs * pxPerDSec;
    const y0 = round(y(t.startValue));
    const y1 = round(y(t.endValue));
    switch (t.type) {
      case "step": {
        const mid = round((x0 + x1) / 2);
        return `M${round(x0)} ${y0}H${mid}V${y1}H${round(x1)}`;
      }
      case "linear":
        return `M${round(x0)} ${y0}L${round(x1)} ${y1}`;
      default: {
        // Enough points for the curve to look smooth at its width.
        const n = Math.max(2, Math.min(32, Math.round((x1 - x0) / 3)));
        const points: string[] = [];
        for (let i = 0; i <= n; i++) {
          const dsecs = t.startDSecs + (t.endDSecs - t.startDSecs) * i / n;
          points.push(`${round(dsecs * pxPerDSec)} ${round(y(transitionValue(t, dsecs / 10)))}`);
        }
        return "M" + points.join("L");
      }
    }
  });
  let held = "";
  let x = 0;
  let value = transitions[0]!.startValue;
  for (const t of transitions) {
    const start = t.startDSecs * pxPerDSec;
    if (start > x) {
      held += `M${round(x)} ${round(y(value))}H${round(start)}`;
    }
    x = t.endDSecs * pxPerDSec;
    value = t.endValue;
  }
  if (endX > x) {
    held += `M${round(x)} ${round(y(value))}H${round(endX)}`;
  }
  return {curves, held};
}
