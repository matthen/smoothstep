import { ensureSyntaxTree } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';

import { HELPER_NAMES } from '../layer/helpers';
import { CANVAS2D_REFERENCE } from './canvas2dReference';
import { canvas2dNames, javascriptClicks, javascriptExtensions } from './javascript';

const CODE = `let time0 = 0;
function setup({width, height}) { return {sides: 5}; }
function draw(ctx, {time, frame: f, data}) {
  clear(ctx);
  ctx.fillStyle = "#bbeafe";
  drawList(ctx, [Set({fillStyle: "rgb(255, 0, 0)", lineWidth: 0.01}), Disk({center: [0, 0], radius: 0.3})]);
  ctx.fillText("Hi " + time0, 60, 110);
  // 0.5 and "#fff" in a comment
}`;

function stateOf(code: string) {
  const state = EditorState.create({doc: code, extensions: javascriptExtensions()});
  ensureSyntaxTree(state, state.doc.length, 5000);
  return state;
}

const state = stateOf(CODE);
const offset = (text: string, nth = 0) => {
  let at = -1;
  for (let i = 0; i <= nth; i++) at = CODE.indexOf(text, at + 1);
  return at;
};

describe("Canvas2D highlighting", () => {
  it("marks the layer's helpers, inputs, setup, draw and ctx, not other names", () => {
    const marked = canvas2dNames(state).map(r => CODE.slice(r.from, r.to));
    expect(new Set(marked)).toEqual(new Set([
      "setup", "width", "height", "draw", "ctx", "time", "frame", "data", "clear", "drawList", "Set", "Disk",
    ]));
    expect(marked).not.toContain("time0");
    expect(marked).not.toContain("sides");
    expect(marked).not.toContain("fillStyle");
  });
});

describe("Canvas2D definitions", () => {
  const at = (text: string, nth = 0) => {
    const from = offset(text, nth);
    return javascriptClicks.definitionAt(state, from, text);
  };

  it("has an entry for every helper", () => {
    const names = new Set(CANVAS2D_REFERENCE.filter(e => e.kind === "helper").map(e => e.name));
    expect(names).toEqual(new Set(HELPER_NAMES));
  });

  it("explains helpers with their defaults, and inputs", () => {
    expect(at("Disk")?.signatures[0]).toContain("radius = 1");
    expect(at("time", 1)?.oneLiner).toMatch(/seconds/);
    expect(at("time0")).toBeNull();
  });

  it("explains ctx's members with a link to MDN, but not other objects' properties", () => {
    expect(at("fillText")?.helpUrl).toMatch(/developer\.mozilla\.org.*fillText$/);
    expect(at("fillStyle")?.helpUrl).toMatch(/fillStyle$/);
    // In Set({...}) a context property is explained too.
    expect(at("fillStyle", 1)?.functionName).toBe("fillStyle");
    expect(at("sides")).toBeNull();
    const other = stateOf("thing.fillText(1);");
    expect(javascriptClicks.definitionAt(other, 6, "fillText")).toBeNull();
  });
});

describe("Canvas2D pickers", () => {
  const pickerAt = (text: string, nth = 0) => {
    const pos = offset(text, nth) + 1;
    const line = state.doc.lineAt(pos);
    return javascriptClicks.pickerAt(state, line, pos - line.from);
  };

  it("opens on colour strings and numbers in code", () => {
    expect(pickerAt("#bbeafe")).toMatchObject({kind: "cssColor", text: "#bbeafe"});
    expect(pickerAt("rgb(")).toMatchObject({kind: "cssColor", text: "rgb(255, 0, 0)"});
    expect(pickerAt("0.3")).toMatchObject({kind: "number", text: "0.3"});
    expect(pickerAt("110")).toMatchObject({kind: "number", text: "110"});
  });

  it("doesn't open on numbers in strings or anything in comments", () => {
    expect(pickerAt("0.5")).toBeNull();
    expect(pickerAt("#fff")).toBeNull();
    expect(pickerAt("Hi")).toBeNull();
  });
});
