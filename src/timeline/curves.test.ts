import {describe, expect, it} from "vitest";
import type {Transition} from "../lib/document";
import {rowPaths, valueToY} from "./curves";

const rise: Transition = {startDSecs: 10, endDSecs: 30, startValue: 0, endValue: 1, type: "linear"};
const fall: Transition = {startDSecs: 50, endDSecs: 60, startValue: 1, endValue: 0.5, type: "step"};

describe("valueToY", () => {
  it("puts the row's lowest value at the bottom and its highest at the top", () => {
    const y = valueToY([rise, fall]);
    expect(y(0)).toBe(23);
    expect(y(1)).toBe(7);
    expect(y(0.5)).toBe(15);
  });

  it("draws a row whose values are all the same across the middle", () => {
    const y = valueToY([{...rise, endValue: 0}]);
    expect(y(0)).toBe(15);
  });
});

describe("rowPaths", () => {
  it("draws a line for linear transitions and a jump halfway for steps", () => {
    const {curves} = rowPaths([rise, fall], 100, 1012);
    expect(curves).toEqual(["M100 23L300 7", "M500 7H550V15H600"]);
  });

  it("follows a smoothstep's curve, slow at each end", () => {
    const {curves} = rowPaths([{...rise, type: "smoothstep"}], 100, 1012);
    const points = curves[0]!.slice(1).split("L").map(p => p.split(" ").map(Number));
    expect(points[0]).toEqual([100, 23]);
    expect(points[points.length - 1]).toEqual([300, 7]);
    const middle = points[Math.floor(points.length / 2)]!;
    expect(middle[1]).toBeCloseTo(15, 0);
    // Moves less in its first step than a straight line would.
    expect(23 - points[1]![1]!).toBeLessThan(16 / (points.length - 1));
  });

  it("holds the value before, between and after the transitions", () => {
    const {held} = rowPaths([rise, fall], 100, 1012);
    expect(held).toBe("M0 23H100M300 7H500M600 15H1012");
  });

  it("draws nothing for a row without transitions", () => {
    expect(rowPaths([], 100, 1012)).toEqual({curves: [], held: ""});
  });
});
