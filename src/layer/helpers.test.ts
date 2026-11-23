import { describe, expect, it } from 'vitest';

import { FakeContext } from './fakeContext';
import { HELPER_NAMES, makeHelpers } from './helpers';

// A 16:9 canvas at half size: 960×540 pixels for 1920×1080 units.
const env = {scale: 0.5, width: 1920, height: 1080};
const h = makeHelpers(env);
const {drawList, Disk, Polygon, Line, Text, Rotate, Translate, Scale, AbsoluteLineWidth} = h;

function context(): FakeContext {
  const ctx = new FakeContext(960, 540);
  ctx.setTransform(env.scale, 0, 0, env.scale, 0, 0);
  return ctx;
}

function near(point: readonly number[] | undefined, expected: readonly number[]) {
  expect(point).toBeDefined();
  point!.forEach((value, i) => expect(value).toBeCloseTo(expected[i]!, 6));
}

const triangle = [[0, 0], [1, 1], [-1, -1]];

describe("drawList", () => {
  it("puts the origin in the middle, with y up and x on the same scale as y", () => {
    const ctx = context();
    drawList(ctx.asContext, [Polygon({pts: triangle})]);
    const [origin, topRight, bottomLeft] = ctx.drawn[0]!.points;
    near(origin, [480, 270]);
    near(topRight, [750, 0]);
    near(bottomLeft, [210, 540]);
  });

  it("gives each nested list its own styles and transforms", () => {
    const ctx = context();
    drawList(ctx.asContext, [
      h.Set({fillStyle: "red"}),
      [Translate({offset: [1, 0]}), h.Set({fillStyle: "blue"}), Polygon({pts: triangle})],
      Polygon({pts: triangle}),
    ]);
    expect(ctx.drawn.map(d => d.fillStyle)).toEqual(["blue", "red"]);
    near(ctx.drawn[0]!.points[0], [750, 270]);
    near(ctx.drawn[1]!.points[0], [480, 270]);
    expect(ctx.depth).toBe(0);
    expect(ctx.fillStyle).toBe("#000");
  });

  it("fits a view inside the canvas without stretching it", () => {
    const ctx = context();
    drawList(ctx.asContext, [Polygon({pts: [[0, 0], [2, 2]]})], {xmin: -2, xmax: 2, ymin: -2, ymax: 2});
    near(ctx.drawn[0]!.points[1], [750, 0]);
    // A view off-centre keeps its own centre in the middle of the canvas.
    const shifted = context();
    drawList(shifted.asContext, [Polygon({pts: [[5, 1]]})], {xmin: 4, xmax: 6, ymin: 0, ymax: 2});
    near(shifted.drawn[0]!.points[0], [480, 270]);
  });

  it("skips empty items, takes plain functions, and refuses anything else", () => {
    const ctx = context();
    let called = false;
    drawList(ctx.asContext, [null, false, undefined, () => {called = true;}]);
    expect(called).toBe(true);
    expect(() => drawList(ctx.asContext, [[42 as unknown as null]])).toThrow(TypeError);
    // The context is left as it was, even after the error.
    expect(ctx.depth).toBe(0);
  });
});

describe("commands", () => {
  it("rotates anticlockwise, about a centre", () => {
    const ctx = context();
    drawList(ctx.asContext, [
      [Rotate({angle: Math.PI / 2}), Line({pts: [[0, 0], [1, 0]]})],
      [Rotate({angle: Math.PI, center: [0.5, 0]}), Line({pts: [[0, 0]]})],
    ]);
    near(ctx.drawn[0]!.points[1], [480, 0]);
    near(ctx.drawn[1]!.points[0], [750, 270]);
  });

  it("scales about a centre", () => {
    const ctx = context();
    drawList(ctx.asContext, [Scale({scale: 2, center: [1, 0]}), Line({pts: [[0, 0]]})]);
    near(ctx.drawn[0]!.points[0], [210, 270]);
  });

  it("keeps text upright and at the font's size, whatever the list's scale", () => {
    const ctx = context();
    ctx.font = "48px Inter";
    drawList(ctx.asContext, [Scale({scale: 3}), Rotate({angle: 0.3}), Text({at: [0, 0], text: 12.5})]);
    const text = ctx.drawn[0]!;
    expect(text.text).toBe("12.5");
    near(text.points[0], [480, 270]);
    // 48 units at half size.
    expect(text.fontPixels).toBeCloseTo(24, 6);
    // Above the origin is higher up the canvas.
    const above = context();
    drawList(above.asContext, [Text({at: [0, 0.5], text: "up"})]);
    near(above.drawn[0]!.points[0], [480, 135]);
  });

  it("draws a disk's radius in canvas units when asked, the same each time it's drawn", () => {
    const ctx = context();
    const dot = Disk({center: [0, 0], radius: 16, radiusInPixels: true});
    drawList(ctx.asContext, [[Scale({scale: 3}), dot], dot, dot]);
    // The arc starts one radius to the right of the centre: 16 units at half size.
    for (const drawn of ctx.drawn) {
      expect(drawn.points[0]![0] - 480).toBeCloseTo(8, 6);
    }
  });

  it("draws a sector from its centre, anticlockwise", () => {
    const ctx = context();
    drawList(ctx.asContext, [Disk({center: [0, 0.5], radius: 0.25, startAngle: 0, endAngle: Math.PI / 2, sector: true})]);
    const [centre, start, end] = ctx.drawn[0]!.points;
    near(centre, [480, 135]);
    near(start, [547.5, 135]);
    near(end, [480, 67.5]);
  });

  it("fills and outlines only what's asked for", () => {
    const ctx = context();
    drawList(ctx.asContext, [
      Disk({radius: 0.1}), Disk({radius: 0.1, fill: false, edge: true}), Disk({radius: 0.1, fill: false}),
      Polygon({pts: triangle, edge: true}),
    ]);
    expect(ctx.drawn.map(d => d.op)).toEqual(["fill", "stroke", "fill", "stroke"]);
  });

  it("sets a line width in canvas units, whatever the scale", () => {
    const ctx = context();
    drawList(ctx.asContext, [
      Line({pts: [[0, 0], [1, 0]]}),
      [Scale({scale: 5}), AbsoluteLineWidth(4), Line({pts: [[0, 0], [1, 0]]})],
    ]);
    // Two units by default, then four: at half size, 1 and 2 pixels.
    expect(ctx.drawn[0]!.lineWidth).toBeCloseTo(1, 6);
    expect(ctx.drawn[1]!.lineWidth).toBeCloseTo(2, 6);
  });

  it("sets styles and dashes with Set, which is still JavaScript's Set with new", () => {
    const ctx = context();
    h.Set({strokeStyle: "green", lineDash: [4, 2], notAProperty: 1})(ctx.asContext);
    expect(ctx.strokeStyle).toBe("green");
    expect(ctx.lineDash).toEqual([4, 2]);
    expect("notAProperty" in ctx).toBe(false);
    const NativeSet = Set;
    const HelperSet = h.Set as unknown as SetConstructor;
    const set = new HelperSet([1, 1, 2]);
    expect(set).toBeInstanceOf(NativeSet);
    expect(set.size).toBe(2);
    expect(set instanceof HelperSet).toBe(true);
  });
});

describe("clear and seededRandom", () => {
  it("clears the whole canvas whatever the transform, to a colour if given", () => {
    const ctx = context();
    ctx.translate(100, 100);
    h.clear(ctx.asContext, "navy");
    expect(ctx.drawn.map(d => d.op)).toEqual(["clearRect", "fillRect"]);
    expect(ctx.drawn[0]!.points).toEqual([[0, 0], [960, 540]]);
    expect(ctx.drawn[1]!.fillStyle).toBe("navy");
    expect(ctx.depth).toBe(0);
    expect(ctx.fillStyle).toBe("#000");
  });

  it("gives the same numbers for the same seed", () => {
    const take = (seed: number) => {
      const random = h.seededRandom(seed);
      return Array.from({length: 50}, random);
    };
    expect(take(7)).toEqual(take(7));
    expect(take(7)).not.toEqual(take(8));
    expect(take(0.25)).not.toEqual(take(0.5));
    expect(take(7).every(x => x >= 0 && x < 1)).toBe(true);
    expect(new Set(take(7)).size).toBeGreaterThan(40);
  });
});

it("lists every helper by name, for the layer's code to use", () => {
  expect(Object.keys(h).sort()).toEqual([...HELPER_NAMES].sort());
});
