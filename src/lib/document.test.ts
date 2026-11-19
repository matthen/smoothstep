import { describe, expect, it } from 'vitest';

import {
  canonicalJSON, newDocument, parseDocument, InvalidDocumentError, variableValue,
  type Transition,
} from './document';

describe("parseDocument", () => {
  it("accepts a new document and returns an equal copy", () => {
    const doc = newDocument();
    expect(parseDocument(JSON.parse(JSON.stringify(doc)))).toEqual(doc);
  });

  it("gives documents saved before aspect ratios a square one", () => {
    const doc: Record<string, unknown> = {...newDocument()};
    delete doc.aspectRatio;
    expect(parseDocument(doc).aspectRatio).toEqual([1, 1]);
  });

  it("drops unknown fields, like the old editor's transition state", () => {
    const doc = newDocument();
    const t = {startDSecs: 0, endDSecs: 10, startValue: 0, endValue: 1, type: "linear", row: 0, isHover: false};
    (doc.variables[0]!.transitions as unknown[]).push(t);
    expect(parseDocument(doc).variables[0]!.transitions[0]).toEqual(
      {startDSecs: 0, endDSecs: 10, startValue: 0, endValue: 1, type: "linear"});
  });

  it.each([
    ["a missing title", (d: Record<string, unknown>) => {delete d.title;}],
    ["a zero duration", (d: Record<string, unknown>) => {d.duration = 0;}],
    ["an unknown aspect ratio", (d: Record<string, unknown>) => {d.aspectRatio = [2, 1];}],
    ["string aspect ratios", (d: Record<string, unknown>) => {d.aspectRatio = ["1", "1"];}],
    ["15 variables", (d: Record<string, unknown>) => {(d.variables as unknown[]).pop();}],
    ["a misnumbered texture", (d: Record<string, unknown>) => {
      (d.textures as {id: string}[])[1]!.id = "iTexture7";
    }],
    ["a backwards transition", (d: Record<string, unknown>) => {
      (d.variables as {transitions: unknown[]}[])[0]!.transitions.push(
        {startDSecs: 10, endDSecs: 10, startValue: 0, endValue: 1, type: "linear"});
    }],
    ["an unknown transition type", (d: Record<string, unknown>) => {
      (d.variables as {transitions: unknown[]}[])[0]!.transitions.push(
        {startDSecs: 0, endDSecs: 10, startValue: 0, endValue: 1, type: "bounce"});
    }],
  ])("rejects %s", (_, change) => {
    const doc = JSON.parse(JSON.stringify(newDocument())) as Record<string, unknown>;
    change(doc);
    expect(() => parseDocument(doc)).toThrow(InvalidDocumentError);
  });
});

describe("variableValue", () => {
  const transitions: Transition[] = [
    {startDSecs: 10, endDSecs: 20, startValue: 0, endValue: 1, type: "linear"},
    {startDSecs: 30, endDSecs: 40, startValue: 5, endValue: 7, type: "smoothstep"},
    {startDSecs: 50, endDSecs: 60, startValue: 2, endValue: 3, type: "step"},
  ];

  it("is 0 with no transitions", () => {
    expect(variableValue([], 3)).toBe(0);
  });

  it.each([
    [0, 0],     // before the first transition: its start value
    [1.5, 0.5], // linear, halfway
    [2.5, 1],   // between transitions: the previous end value
    [3.5, 6],   // smoothstep at t = 0.5
    [3.25, 5 + 2 * (0.25 * 0.25 * (3 - 0.5))],
    [5.4, 2],   // step, before halfway
    [5.6, 3],   // step, after halfway
    [9, 3],     // after the last transition
  ])("at %s seconds is %s", (time, expected) => {
    expect(variableValue(transitions, time)).toBeCloseTo(expected, 10);
  });
});

describe("canonicalJSON", () => {
  it("ignores key order", () => {
    expect(canonicalJSON({b: 1, a: [{d: 2, c: 3}]})).toBe(canonicalJSON({a: [{c: 3, d: 2}], b: 1}));
  });
});
