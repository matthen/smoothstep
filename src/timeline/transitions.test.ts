import {describe, expect, it} from "vitest";
import {emptyVariables} from "../lib/document";
import type {Transition} from "../lib/document";
import {
  dragTransition, insertTransition, isInsertable, parseValue, removeTransition, replaceTransition,
  withTransitions,
} from "./transitions";

function t(startDSecs: number, endDSecs: number, startValue = 0, endValue = 1): Transition {
  return {startDSecs, endDSecs, startValue, endValue, type: "smoothstep"};
}

const row = [t(10, 30), t(50, 60), t(80, 100)];

describe("isInsertable", () => {
  it("allows gaps and touching ends", () => {
    expect(isInsertable(row, 30, 50, 120)).toBe(true);
    expect(isInsertable(row, 0, 10, 120)).toBe(true);
    expect(isInsertable(row, 100, 120, 120)).toBe(true);
  });

  it("rejects overlaps", () => {
    expect(isInsertable(row, 29, 31, 120)).toBe(false);
    expect(isInsertable(row, 40, 90, 120)).toBe(false);
    expect(isInsertable(row, 52, 55, 120)).toBe(false);
  });

  it("rejects transitions outside the duration or with no length", () => {
    expect(isInsertable(row, -1, 5, 120)).toBe(false);
    expect(isInsertable(row, 110, 121, 120)).toBe(false);
    expect(isInsertable(row, 40, 40, 120)).toBe(false);
  });

  it("can ignore one transition", () => {
    expect(isInsertable(row, 45, 65, 120, 1)).toBe(true);
  });
});

describe("insert, replace and remove", () => {
  it("inserts in order", () => {
    const {transitions, index} = insertTransition(row, t(35, 45));
    expect(index).toBe(1);
    expect(transitions.map(x => x.startDSecs)).toEqual([10, 35, 50, 80]);
    expect(insertTransition(row, t(0, 5)).index).toBe(0);
    expect(insertTransition(row, t(105, 110)).index).toBe(3);
    expect(insertTransition([], t(0, 5)).index).toBe(0);
  });

  it("doesn't change the original", () => {
    insertTransition(row, t(35, 45));
    replaceTransition(row, 0, t(0, 5));
    removeTransition(row, 0);
    expect(row).toHaveLength(3);
    expect(row[0]!.startDSecs).toBe(10);
  });

  it("replaces and removes by index", () => {
    expect(replaceTransition(row, 1, t(40, 70))[1]!.endDSecs).toBe(70);
    expect(removeTransition(row, 1).map(x => x.startDSecs)).toEqual([10, 80]);
  });

  it("updates one variable", () => {
    const variables = emptyVariables();
    const next = withTransitions(variables, 2, [t(0, 10)]);
    expect(next[2]!.transitions).toHaveLength(1);
    expect(next[1]).toBe(variables[1]);
    expect(variables[2]!.transitions).toHaveLength(0);
  });
});

describe("dragTransition", () => {
  it("moves a transition, keeping its length", () => {
    expect(dragTransition(row, 1, "move", 5, 120)).toMatchObject({startDSecs: 55, endDSecs: 65});
    expect(dragTransition(row, 1, "move", -5, 120)).toMatchObject({startDSecs: 45, endDSecs: 55});
  });

  it("stops at its neighbours", () => {
    expect(dragTransition(row, 1, "move", 50, 120)).toMatchObject({startDSecs: 70, endDSecs: 80});
    expect(dragTransition(row, 1, "move", -50, 120)).toMatchObject({startDSecs: 30, endDSecs: 40});
  });

  it("stops at 0 and the duration without shrinking", () => {
    expect(dragTransition(row, 0, "move", -50, 120)).toMatchObject({startDSecs: 0, endDSecs: 20});
    expect(dragTransition(row, 2, "move", 50, 120)).toMatchObject({startDSecs: 100, endDSecs: 120});
  });

  it("resizes from either end, at least 0.1s long", () => {
    expect(dragTransition(row, 1, "resizeLeft", -7, 120)).toMatchObject({startDSecs: 43, endDSecs: 60});
    expect(dragTransition(row, 1, "resizeLeft", 50, 120)).toMatchObject({startDSecs: 59, endDSecs: 60});
    expect(dragTransition(row, 1, "resizeLeft", -50, 120)).toMatchObject({startDSecs: 30});
    expect(dragTransition(row, 1, "resizeRight", 7, 120)).toMatchObject({startDSecs: 50, endDSecs: 67});
    expect(dragTransition(row, 1, "resizeRight", -50, 120)).toMatchObject({endDSecs: 51});
    expect(dragTransition(row, 1, "resizeRight", 50, 120)).toMatchObject({endDSecs: 80});
    expect(dragTransition(row, 2, "resizeRight", 50, 120)).toMatchObject({endDSecs: 120});
  });

  it("lets a transition past the duration move left or shrink, not grow", () => {
    expect(dragTransition(row, 2, "move", 5, 90)).toMatchObject({startDSecs: 80, endDSecs: 100});
    expect(dragTransition(row, 2, "move", -5, 90)).toMatchObject({startDSecs: 75, endDSecs: 95});
    expect(dragTransition(row, 2, "resizeRight", -5, 90)).toMatchObject({endDSecs: 95});
    expect(dragTransition(row, 2, "resizeRight", 5, 90)).toMatchObject({endDSecs: 100});
  });

  it("keeps values and type", () => {
    const moved = dragTransition([t(10, 20, 3, 4)], 0, "move", 2, 120);
    expect(moved).toEqual({startDSecs: 12, endDSecs: 22, startValue: 3, endValue: 4, type: "smoothstep"});
  });
});

describe("parseValue", () => {
  it("accepts finite numbers", () => {
    expect(parseValue("0.5")).toBe(0.5);
    expect(parseValue("-2")).toBe(-2);
    expect(parseValue("1e3")).toBe(1000);
  });

  it("rejects anything else", () => {
    expect(parseValue("")).toBeNull();
    expect(parseValue("  ")).toBeNull();
    expect(parseValue("abc")).toBeNull();
    expect(parseValue("1e999")).toBeNull();
  });
});
