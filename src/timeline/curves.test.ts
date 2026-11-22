import {describe, expect, it} from "vitest";
import type {Transition} from "../lib/document";
import {rowPaths, valueToY} from "./curves";
import {ROW_BAND_BOTTOM, ROW_BAND_TOP, timeToX} from "./geometry";

const rise: Transition = {startDSecs: 10, endDSecs: 30, startValue: 0, endValue: 1, type: "linear"};
const fall: Transition = {startDSecs: 50, endDSecs: 60, startValue: 1, endValue: 0.5, type: "step"};
const SCALE = 100;
const END_X = 1000;

// The points an SVG path made of M, L, H and V commands passes through, one list per M.
function polylines(path: string): [number, number][][] {
  const lines: [number, number][][] = [];
  let x = 0;
  let y = 0;
  for (const [, command, args] of path.matchAll(/([MLHV])([^MLHV]*)/g)) {
    const values = args!.trim().split(/\s+/).map(Number);
    if (command === "H") {
      x = values[0]!;
    } else if (command === "V") {
      y = values[0]!;
    } else {
      [x, y] = values as [number, number];
    }
    if (command === "M") {
      lines.push([]);
    }
    lines[lines.length - 1]!.push([x, y]);
  }
  return lines;
}

const at = (seconds: number) => timeToX(seconds, SCALE);

describe("valueToY", () => {
  it("draws higher values higher up, within the row's band", () => {
    const y = valueToY([rise, fall]);
    expect(y(1)).toBeLessThan(y(0.5));
    expect(y(0.5)).toBeLessThan(y(0));
    for (const value of [0, 0.5, 1]) {
      expect(y(value)).toBeGreaterThan(ROW_BAND_TOP);
      expect(y(value)).toBeLessThan(ROW_BAND_BOTTOM);
    }
  });

  it("keeps an overshoot's peak inside the band", () => {
    const plain = valueToY([rise]);
    const overshoot = valueToY([{...rise, type: "overshoot"}]);
    // The end value moves down to make room for the peak above it.
    expect(overshoot(1)).toBeGreaterThan(plain(1));
    expect(overshoot(1.1)).toBeGreaterThan(ROW_BAND_TOP);
  });

  it("draws a row whose values are all the same across the middle", () => {
    const y = valueToY([rise]);
    expect(valueToY([{...rise, endValue: 0}])(0)).toBeCloseTo((y(0) + y(1)) / 2);
  });
});

describe("rowPaths", () => {
  const y = valueToY([rise, fall]);

  it("draws each transition from its start value to its end value", () => {
    const transitions = [rise, fall, {...rise, startDSecs: 70, endDSecs: 90, type: "smoothstep" as const}];
    const {curves} = rowPaths(transitions, SCALE, END_X);
    for (const [i, t] of transitions.entries()) {
      const points = polylines(curves[i]!).flat();
      expect(points[0]![0]).toBeCloseTo(at(t.startDSecs / 10), 0);
      expect(points[0]![1]).toBeCloseTo(y(t.startValue), 0);
      expect(points[points.length - 1]![0]).toBeCloseTo(at(t.endDSecs / 10), 0);
      expect(points[points.length - 1]![1]).toBeCloseTo(y(t.endValue), 0);
    }
  });

  it("draws a step as a jump halfway through", () => {
    const points = polylines(rowPaths([fall], SCALE, END_X).curves[0]!).flat();
    const jumps = points.slice(1).filter(([x, py], i) => x === points[i]![0] && py !== points[i]![1]);
    expect(jumps).toHaveLength(1);
    expect(jumps[0]![0]).toBeCloseTo(at(5.5), 0);
  });

  it("follows a smoothstep's curve, slow at each end", () => {
    const points = polylines(rowPaths([{...rise, type: "smoothstep"}], SCALE, END_X).curves[0]!).flat();
    const rises = points.slice(1).map(([, py], i) => points[i]![1] - py);
    const middle = rises[Math.floor(rises.length / 2)]!;
    expect(rises[0]).toBeLessThan(middle);
    expect(rises[rises.length - 1]).toBeLessThan(middle);
  });

  it("holds the value before, between and after the transitions", () => {
    const held = polylines(rowPaths([rise, fall], SCALE, END_X).held);
    expect(held.map(line => [line[0]![0], line[line.length - 1]![0]])).toEqual(
      [[0, at(1)], [at(3), at(5)], [at(6), END_X]]);
    const levels = held.map(line => line[0]![1]);
    expect(levels[0]).toBeCloseTo(y(0), 0);
    expect(levels[1]).toBeCloseTo(y(1), 0);
    expect(levels[2]).toBeCloseTo(y(0.5), 0);
  });

  it("draws nothing for a row without transitions", () => {
    expect(rowPaths([], SCALE, END_X)).toEqual({curves: [], held: ""});
  });
});
