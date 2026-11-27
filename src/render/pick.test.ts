import { describe, expect, it } from 'vitest';

import { PICK_UNIFORM, pickedRequest, pickedSources, pickRange, pickValue, type Pick } from './pick';
import { fragmentSource } from './Renderer';

describe("pickValue", () => {
  it("types a literal by what it is, and spreads a vec's one value to each component", () => {
    expect(pickValue("0.5")).toEqual({type: "float", values: [0.5]});
    expect(pickValue("-.25")).toEqual({type: "float", values: [-0.25]});
    expect(pickValue("2.")).toEqual({type: "float", values: [2]});
    expect(pickValue(" -0.3")).toEqual({type: "float", values: [-0.3]});
    expect(pickValue("vec2(0.1, -0.2)")).toEqual({type: "vec2", values: [0.1, -0.2]});
    expect(pickValue("vec3(1., 0.5, 0.)")).toEqual({type: "vec3", values: [1, 0.5, 0]});
    expect(pickValue("vec4(0.5)")).toEqual({type: "vec4", values: [0.5, 0.5, 0.5, 0.5]});
  });

  it("refuses anything that isn't a literal", () => {
    for (const text of ["", "3", "1e3", "x", "vec3(1., 2.)", "vec3(a, 1., 2.)"]) {
      expect(pickValue(text)).toBeNull();
    }
  });
});

describe("pickRange", () => {
  const built = "float a = 0.5; float b = 0.5;";

  it("finds the edited literal in the code as built, whatever its new length", () => {
    const edited = "float a = 0.5; float b = 0.71234;";
    expect(pickRange(built, edited, 25, 32)).toEqual({from: 25, to: 28});
    expect(built.slice(25, 28)).toBe("0.5");
  });

  it("refuses code that differs outside the range", () => {
    expect(pickRange(built, "float a = 0.6; float b = 0.71234;", 25, 32)).toBeNull();
    expect(pickRange(built, "float a = 0.5; float b = 0.71234;", 10, 13)).toBeNull();
  });
});

describe("pickedSources", () => {
  const sources = {code: "image 0.5", buffers: ["buffer 0.5", "buffer 0.5"], shared: "shared 0.5"};

  it("swaps only the picked literal, leaving the same text in other tabs", () => {
    const pick: Pick = {tab: 1, from: 7, to: 10, type: "float"};
    expect(pickedSources(sources, pick)).toEqual({...sources, buffers: ["buffer 0.5", `buffer ${PICK_UNIFORM}`]});
    expect(pickedSources(sources, {...pick, tab: "shared"}).shared).toBe(`shared ${PICK_UNIFORM}`);
    expect(pickedSources(sources, null)).toBe(sources);
  });
});

describe("pickedRequest", () => {
  const built = "float d = 0.5; c = vec4(d * 0.5);";
  const pick: Pick = {tab: "image", from: 10, to: 13, type: "float"};
  const shift = PICK_UNIFORM.length - 3;

  it("moves an expression after the literal, and keeps one before it", () => {
    const after = pickedRequest({tab: "image", code: built, from: 24, to: 31}, pick, built);
    expect(after.code.slice(after.from, after.to)).toBe("d * 0.5");
    expect([after.from, after.to]).toEqual([24 + shift, 31 + shift]);
    const before = pickedRequest({tab: "image", code: built, from: 6, to: 7}, pick, built);
    expect(before.code.slice(before.from, before.to)).toBe("d");
  });

  it("takes in the uniform when the expression holds the literal", () => {
    const whole = pickedRequest({tab: "image", code: built, from: 6, to: 13}, pick, built);
    expect(whole.code.slice(whole.from, whole.to)).toBe(`d = ${PICK_UNIFORM}`);
  });

  it("leaves a request in another tab, in other code or inside the literal as it is", () => {
    for (const request of [
      {tab: 0, code: built, from: 24, to: 31}, {tab: "image" as const, code: built + " ", from: 24, to: 31},
      {tab: "image" as const, code: built, from: 11, to: 12},
    ]) {
      expect(pickedRequest(request, pick, built)).toBe(request);
    }
  });
});

describe("the picked shader's source", () => {
  it("declares the uniform without moving the user's code down", () => {
    const plain = fragmentSource("code", 2, false, "shared").split("\n");
    const picked = fragmentSource("code", 2, false, "shared", "vec3").split("\n");
    expect(picked.indexOf("code")).toBe(plain.indexOf("code"));
    expect(picked.join("\n")).toContain(`uniform vec3 ${PICK_UNIFORM};`);
  });
});
