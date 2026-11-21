import { describe, expect, it } from 'vitest';

import {
  canonicalJSON, MAX_BUFFERS, newDocument, parseDocument, InvalidDocumentError, sliderRange, variableValue,
  variableValues,
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

  it("keeps buffers and shared code, and leaves them out when there are none", () => {
    const doc = {...newDocument(), buffers: [{code: "a"}, {code: "b", extra: 1}], shared: "float x;"};
    expect(parseDocument(doc)).toEqual({...newDocument(), buffers: [{code: "a"}, {code: "b"}], shared: "float x;"});
    const empty = parseDocument({...newDocument(), buffers: [], shared: ""});
    expect("buffers" in empty || "shared" in empty).toBe(false);
  });

  it("refuses more buffers than the renderer has, and code that isn't text", () => {
    const fiveBuffers = Array.from({length: MAX_BUFFERS + 1}, () => ({code: ""}));
    expect(() => parseDocument({...newDocument(), buffers: fiveBuffers})).toThrow(InvalidDocumentError);
    expect(() => parseDocument({...newDocument(), buffers: [{code: 1}]})).toThrow(InvalidDocumentError);
    expect(() => parseDocument({...newDocument(), shared: 1})).toThrow(InvalidDocumentError);
  });

  it("drops unknown fields, like the old editor's transition state", () => {
    const doc = newDocument();
    const t = {startDSecs: 0, endDSecs: 10, startValue: 0, endValue: 1, type: "linear", row: 0, isHover: false};
    (doc.variables[0]!.transitions as unknown[]).push(t);
    expect(parseDocument(doc).variables[0]!.transitions[0]).toEqual(
      {startDSecs: 0, endDSecs: 10, startValue: 0, endValue: 1, type: "linear"});
  });

  it("keeps a slider's value and range when they're numbers, and leaves them out otherwise", () => {
    const doc = newDocument();
    doc.variables[0] = {transitions: [], value: 0.4, min: -1, max: 2};
    (doc.variables[1] as unknown as Record<string, unknown>).value = "0.4";
    (doc.variables[2] as unknown as Record<string, unknown>).max = Infinity;
    const parsed = parseDocument(JSON.parse(JSON.stringify(doc)));
    expect(parsed.variables[0]).toEqual({transitions: [], value: 0.4, min: -1, max: 2});
    expect(parsed.variables[1]).toEqual({transitions: []});
    expect(parseDocument(doc).variables[2]).toEqual({transitions: []});
  });

  it("reads the old timeline's blank and string values as numbers", () => {
    const doc = newDocument();
    (doc.variables[0]!.transitions as unknown[]).push(
      {startDSecs: 0, endDSecs: 10, startValue: "", endValue: "2.5", type: "linear"});
    const t = parseDocument(doc).variables[0]!.transitions[0]!;
    expect([t.startValue, t.endValue]).toEqual([0, 2.5]);
  });

  it("keeps transition times to a hundredth of a second", () => {
    const doc = newDocument();
    (doc.variables[0]!.transitions as unknown[]).push(
      {startDSecs: 12.5, endDSecs: 20.04, startValue: 0, endValue: 1, type: "linear"});
    const t = parseDocument(doc).variables[0]!.transitions[0]!;
    expect([t.startDSecs, t.endDSecs]).toEqual([12.5, 20]);
  });

  it("keeps a custom aspect ratio", () => {
    const doc = newDocument() as unknown as Record<string, unknown>;
    doc.aspectRatio = [21, 9];
    expect(parseDocument(doc).aspectRatio).toEqual([21, 9]);
  });

  it.each([
    ["a non-numeric value", (d: Record<string, unknown>) => {
      (d.variables as {transitions: unknown[]}[])[0]!.transitions.push(
        {startDSecs: 0, endDSecs: 10, startValue: "abc", endValue: 1, type: "linear"});
    }],
    ["a missing title", (d: Record<string, unknown>) => {delete d.title;}],
    ["a zero duration", (d: Record<string, unknown>) => {d.duration = 0;}],
    ["a fractional aspect ratio", (d: Record<string, unknown>) => {d.aspectRatio = [2.5, 1];}],
    ["an aspect ratio wider than 10:1", (d: Record<string, unknown>) => {d.aspectRatio = [11, 1];}],
    ["an aspect ratio over 100", (d: Record<string, unknown>) => {d.aspectRatio = [200, 100];}],
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

  it("eases in, eases out, and overshoots then settles", () => {
    const at = (type: Transition["type"], time: number) =>
      variableValue([{startDSecs: 0, endDSecs: 10, startValue: 0, endValue: 1, type}], time);
    expect(at("easeIn", 0.5)).toBeCloseTo(0.125, 10);
    expect(at("easeOut", 0.5)).toBeCloseTo(0.875, 10);
    expect(at("overshoot", 0.58)).toBeCloseTo(1.1, 3);
    for (const type of ["easeIn", "easeOut", "overshoot"] as const) {
      expect(at(type, 0)).toBeCloseTo(0, 10);
      expect(at(type, 1)).toBeCloseTo(1, 10);
    }
  });
});

describe("canonicalJSON", () => {
  it("ignores key order", () => {
    expect(canonicalJSON({b: 1, a: [{d: 2, c: 3}]})).toBe(canonicalJSON({a: [{c: 3, d: 2}], b: 1}));
  });
});

describe("variableValues", () => {
  it("uses a slider's value while a variable has no transitions, and the timeline once it has", () => {
    const transition: Transition = {startDSecs: 0, endDSecs: 10, startValue: 2, endValue: 4, type: "linear"};
    const values = variableValues([{transitions: []}, {transitions: [], value: 0.7}, {transitions: [transition], value: 9}], 1);
    expect(values).toEqual([0, 0.7, 4]);
  });
});

describe("sliderRange", () => {
  it("covers 0 to 1, widened to the timeline's values and the slider's value", () => {
    expect(sliderRange({transitions: []})).toEqual([0, 1]);
    expect(sliderRange({transitions: [], value: 3})).toEqual([0, 3]);
    expect(sliderRange({transitions: [{startDSecs: 0, endDSecs: 10, startValue: -1, endValue: 0.5, type: "step"}]}))
      .toEqual([-1, 1]);
  });

  it("uses the ends set for it", () => {
    expect(sliderRange({transitions: [], value: 3, min: 2, max: 10})).toEqual([2, 10]);
    expect(sliderRange({transitions: [], max: 0.5})).toEqual([0, 0.5]);
  });
});
