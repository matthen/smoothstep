// The drawing helpers a Canvas2D layer's code can call: nested lists of drawing commands in
// shader-style coordinates, plus clear and seededRandom. makeHelpers runs inside the layer's worker,
// which gets it as source text, so it must not use anything from outside its own body.

// The canvas as the layer's code sees it: `scale` device pixels to a unit, and its size in units.
export interface HelperEnv {
  scale: number;
  width: number;
  height: number;
}

type Context = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
export type DrawCommand = (ctx: Context) => void;
export type DrawList = DrawCommand | null | undefined | false | DrawList[];

// The part of the plane a list is drawn in. With nothing set, y runs from -1 to 1.
export interface View {
  xmin?: number;
  xmax?: number;
  ymin?: number;
  ymax?: number;
}

type Point = readonly number[];

export const HELPER_NAMES = [
  "drawList", "clear", "seededRandom", "Set", "Disk", "Polygon", "Line", "Text", "Rotate", "Translate", "Scale",
  "AbsoluteLineWidth",
] as const;

export function makeHelpers(env: HelperEnv) {
  const NativeSet = Set;
  const TAU = 2 * Math.PI;

  // Device pixels to one unit of the context's current coordinates.
  const zoom = (ctx: Context): number => {
    const m = ctx.getTransform();
    return Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) || 1;
  };
  // A length of `units` canvas units (1080 to the canvas's height), in the current coordinates.
  const absolute = (ctx: Context, units: number): number => units * env.scale / zoom(ctx);

  // The list comes from the layer's code, so it may hold anything.
  const walk = (ctx: Context, list: unknown): void => {
    if (Array.isArray(list)) {
      ctx.save();
      try {
        for (const item of list) {
          walk(ctx, item);
        }
      } finally {
        ctx.restore();
      }
    } else if (typeof list === "function") {
      (list as DrawCommand)(ctx);
    } else if (list !== null && list !== undefined && list !== false) {
      throw new TypeError("drawList takes commands like Disk({...}) and lists of them, but got " + typeof list);
    }
  };

  // Draws a nested list of commands. Each list inside it keeps its styles and transforms to itself.
  // Coordinates are like a shader's uv: y up, from -1 to 1 unless `view` says otherwise, and x on
  // the same scale, with the view's centre in the middle of the canvas.
  function drawList(ctx: Context, list: DrawList, view: View = {}): void {
    const hasX = view.xmin !== undefined && view.xmax !== undefined;
    const hasY = view.ymin !== undefined && view.ymax !== undefined;
    const [xmin, xmax] = hasX ? [view.xmin!, view.xmax!] : [-1, 1];
    const [ymin, ymax] = hasY || !hasX ? [view.ymin ?? -1, view.ymax ?? 1] : [0, 0];
    // One scale for x and y, so circles stay round: the view fits inside the canvas.
    const k = hasX && hasY ? Math.min(env.width / (xmax - xmin), env.height / (ymax - ymin)) :
      hasX ? env.width / (xmax - xmin) : env.height / (ymax - ymin);
    ctx.save();
    ctx.translate(env.width / 2, env.height / 2);
    ctx.scale(k, k);
    ctx.translate(hasX ? -(xmin + xmax) / 2 : 0, (ymin + ymax) / 2);
    ctx.lineWidth = absolute(ctx, 2);
    try {
      walk(ctx, list);
    } finally {
      ctx.restore();
    }
  }

  // Clears the whole canvas, to transparent or to a colour.
  function clear(ctx: Context, colour?: string): void {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    if (colour) {
      ctx.fillStyle = colour;
      ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    }
    ctx.restore();
  }

  // A random number generator that gives the same numbers, from 0 up to 1, for the same seed.
  function seededRandom(seed = 1): () => number {
    let a = (Math.floor(seed) ^ Math.floor((seed - Math.floor(seed)) * 4294967296)) >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Sets context properties, like Set({fillStyle: "red", lineWidth: 0.01}). Called with `new` it's
  // the usual JavaScript Set, which this helper would otherwise hide.
  function SetCommand(values?: unknown): unknown {
    const target = new.target as unknown as (new () => unknown) | undefined;
    if (target) {
      return Reflect.construct(NativeSet, values === undefined ? [] : [values],
        target === (SetCommand as unknown) ? NativeSet : target);
    }
    const styles = (values ?? {}) as Record<string, unknown>;
    return (ctx: Context) => {
      for (const key of Object.keys(styles)) {
        if (key === "lineDash") {
          ctx.setLineDash(styles[key] as number[]);
        } else if (key in ctx) {
          (ctx as unknown as Record<string, unknown>)[key] = styles[key];
        }
      }
    };
  }
  SetCommand.prototype = NativeSet.prototype;

  // A line width in canvas units, whatever the list's scale.
  const AbsoluteLineWidth = (units: number): DrawCommand => ctx => {
    ctx.lineWidth = absolute(ctx, units);
  };

  // A disk, or with fill off and edge on a circle. Angles are anticlockwise from the x axis;
  // `sector` joins the arc's ends to the centre.
  const Disk = ({
    center = [0, 0], radius = 1, fill = true, edge = false, startAngle = 0, endAngle = TAU, sector = false,
    radiusInPixels = false,
  }: {
    center?: Point; radius?: number; fill?: boolean; edge?: boolean; startAngle?: number; endAngle?: number;
    sector?: boolean; radiusInPixels?: boolean;
  } = {}): DrawCommand => ctx => {
    if (!fill && !edge) {
      return;
    }
    const r = radiusInPixels ? absolute(ctx, radius) : radius;
    const [x, y] = center as [number, number];
    ctx.beginPath();
    if (Math.abs(endAngle - startAngle) >= TAU) {
      ctx.arc(x, -y, r, 0, TAU);
    } else {
      if (sector) {
        ctx.moveTo(x, -y);
      }
      ctx.arc(x, -y, r, -startAngle, -endAngle, endAngle > startAngle);
      if (sector) {
        ctx.closePath();
      }
    }
    if (fill) {
      ctx.fill();
    }
    if (edge) {
      ctx.stroke();
    }
  };

  const path = (ctx: Context, pts: readonly Point[], closed: boolean) => {
    ctx.beginPath();
    pts.forEach(([x, y], i) => {
      if (i === 0) {
        ctx.moveTo(x!, -y!);
      } else {
        ctx.lineTo(x!, -y!);
      }
    });
    if (closed) {
      ctx.closePath();
    }
  };

  const Polygon = ({pts, fill = true, edge = false}: {pts: readonly Point[]; fill?: boolean; edge?: boolean}): DrawCommand =>
    ctx => {
      if (pts.length === 0 || (!fill && !edge)) {
        return;
      }
      path(ctx, pts, true);
      if (fill) {
        ctx.fill();
      }
      if (edge) {
        ctx.stroke();
      }
    };

  const Line = ({pts, closed = false}: {pts: readonly Point[]; closed?: boolean}): DrawCommand => ctx => {
    if (pts.length === 0) {
      return;
    }
    path(ctx, pts, closed);
    ctx.stroke();
  };

  // Text at a point. It stays upright and at the context's font size, whatever the list's scale.
  const Text = ({at = [0, 0], text, align, baseline, fill = true, edge = false}: {
    at?: Point; text: unknown; align?: CanvasTextAlign; baseline?: CanvasTextBaseline; fill?: boolean; edge?: boolean;
  }): DrawCommand => ctx => {
    const [x, y] = at as [number, number];
    ctx.save();
    ctx.translate(x, -y);
    const k = absolute(ctx, 1);
    ctx.scale(k, k);
    if (align) {
      ctx.textAlign = align;
    }
    if (baseline) {
      ctx.textBaseline = baseline;
    }
    if (edge) {
      ctx.lineWidth /= k;
      ctx.strokeText(String(text), 0, 0);
    }
    if (fill) {
      ctx.fillText(String(text), 0, 0);
    }
    ctx.restore();
  };

  // Turns what follows in its list anticlockwise by `angle` radians about `center`.
  const Rotate = ({angle, center = [0, 0]}: {angle: number; center?: Point}): DrawCommand => ctx => {
    const [x, y] = center as [number, number];
    ctx.translate(x, -y);
    ctx.rotate(-angle);
    ctx.translate(-x, y);
  };

  const Translate = ({offset}: {offset: Point}): DrawCommand => ctx => {
    ctx.translate(offset[0]!, -offset[1]!);
  };

  const Scale = ({scale = 1, scaleX = scale, scaleY = scale, center = [0, 0]}: {
    scale?: number; scaleX?: number; scaleY?: number; center?: Point;
  }): DrawCommand => ctx => {
    const [x, y] = center as [number, number];
    ctx.translate(x, -y);
    ctx.scale(scaleX, scaleY);
    ctx.translate(-x, y);
  };

  return {
    drawList, clear, seededRandom, Set: SetCommand as (values?: unknown) => DrawCommand, Disk, Polygon, Line, Text,
    Rotate, Translate, Scale, AbsoluteLineWidth,
  };
}

export type Helpers = ReturnType<typeof makeHelpers>;
