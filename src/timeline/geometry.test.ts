import {describe, expect, it} from "vitest";
import {emptyVariables} from "../lib/document";
import {
  clampTime, clampZoom, dragDeltaDSecs, draggedDuration, durationDSecs, fitPxPerSecond, formatTime,
  grabMode, hoverEndDSecs, hoverStartDSecs, MAX_PX_PER_SECOND, maxTimeFor, roundDuration, ROW_BAND_BOTTOM,
  ROW_BAND_TOP, ROW_HEIGHT, rowAt, rulerTicks, snapDSecs, timeAreaWidth, timeToX, xToTime,
} from "./geometry";

// Whether x is a whole number of steps, allowing for floating point.
const onStep = (x: number, step: number) => Math.abs(x / step - Math.round(x / step)) < 1e-6;

describe("time and pixels", () => {
  it("maps seconds to pixels and back at any scale", () => {
    for (const scale of [10, 40, 400]) {
      expect(xToTime(timeToX(2.5, scale), scale)).toBe(2.5);
      expect(timeToX(5, scale)).toBe(2 * timeToX(2.5, scale));
    }
    expect(timeToX(1, 100)).toBeGreaterThan(timeToX(1, 40));
  });

  it("clamps times to the duration", () => {
    expect(clampTime(-1, 10)).toBe(0);
    expect(clampTime(11, 10)).toBe(10);
    expect(clampTime(3, 10)).toBe(3);
  });

  it("gives the last tenth of a second within the duration", () => {
    expect(durationDSecs(12)).toBe(120);
    expect(durationDSecs(0.7)).toBe(7);
    expect(durationDSecs(12.34)).toBe(123);
  });
});

describe("fitting and zooming", () => {
  it("fits the whole timeline to the width, however long it is", () => {
    for (const [width, maxTime] of [[1012, 10], [300, 600], [800, 0.5]] as const) {
      expect(timeAreaWidth(maxTime, fitPxPerSecond(width, maxTime))).toBeCloseTo(width);
    }
  });

  it("zooms in from the fit up to the most pixels per second", () => {
    expect(clampZoom(0.5, 40)).toBe(1);
    expect(clampZoom(3, 40)).toBe(3);
    expect(40 * clampZoom(100, 40)).toBe(MAX_PX_PER_SECOND);
  });

  it("doesn't zoom a timeline already fitted past the most pixels per second", () => {
    expect(clampZoom(4, MAX_PX_PER_SECOND * 2)).toBe(1);
  });
});

describe("rows", () => {
  const inBand = (row: number) => row * ROW_HEIGHT + (ROW_BAND_TOP + ROW_BAND_BOTTOM) / 2;

  it("finds the row whose band is under the pointer", () => {
    expect(rowAt(inBand(0), 16)).toBe(0);
    expect(rowAt(inBand(1), 16)).toBe(1);
    expect(rowAt(ROW_HEIGHT + ROW_BAND_TOP, 16)).toBe(1);
    expect(rowAt(ROW_HEIGHT + ROW_BAND_BOTTOM, 16)).toBe(1);
    expect(rowAt(inBand(15), 16)).toBe(15);
  });

  it("ignores the gaps between bands and positions outside the rows", () => {
    expect(rowAt(ROW_BAND_TOP - 1, 16)).toBeNull();
    expect(rowAt(ROW_HEIGHT + ROW_BAND_BOTTOM + 1, 16)).toBeNull();
    expect(rowAt(-5, 16)).toBeNull();
    expect(rowAt(inBand(16), 16)).toBeNull();
  });
});

describe("snapping", () => {
  it("starts a new transition at a tenth of a second at or before the pointer", () => {
    for (const scale of [10, 40, 100]) {
      for (const seconds of [0, 0.05, 1.23, 2.1, 7.99]) {
        const start = hoverStartDSecs(timeToX(seconds, scale), scale);
        expect(Number.isInteger(start)).toBe(true);
        expect(start / 10).toBeLessThanOrEqual(seconds + 1e-9);
        expect(seconds - start / 10).toBeLessThan(0.2);
      }
    }
  });

  it("ends a new transition at the pointer's tenth, keeping it at least 0.1s long", () => {
    expect(hoverEndDSecs(timeToX(4.2, 40), 21, 40)).toBe(42);
    expect(hoverEndDSecs(timeToX(1, 40), 21, 40)).toBe(22);
  });

  it("drags in whole steps that get finer as the timeline zooms in, down to a hundredth of a second", () => {
    let previous = Infinity;
    for (const scale of [10, 40, 100, 200, MAX_PX_PER_SECOND]) {
      const step = snapDSecs(scale);
      expect(step).toBeLessThanOrEqual(previous);
      previous = step;
      for (const deltaX of [-37, -3, 0, 1, 13, 60]) {
        const dsecs = dragDeltaDSecs(deltaX, scale);
        expect(onStep(dsecs, step)).toBe(true);
        expect(Math.abs(dsecs - deltaX * 10 / scale)).toBeLessThanOrEqual(step / 2 + 1e-9);
      }
    }
    expect(snapDSecs(40)).toBe(1);
    expect(snapDSecs(MAX_PX_PER_SECOND)).toBe(0.1);
  });

  it("grabs the edges of a transition to resize it, and the middle to move it", () => {
    const width = 40;
    expect(grabMode(-2, width)).toBe("resizeLeft");
    expect(grabMode(0, width)).toBe("resizeLeft");
    expect(grabMode(width / 2, width)).toBe("move");
    expect(grabMode(width, width)).toBe("resizeRight");
    expect(grabMode(width + 1, width)).toBe("resizeRight");
  });
});

describe("timeline length", () => {
  it("extends a little past the duration, to a tenth of a second", () => {
    const variables = emptyVariables();
    for (const duration of [0.5, 1, 5, 9, 100]) {
      const maxTime = maxTimeFor(variables, duration);
      expect(maxTime).toBeGreaterThan(duration);
      expect(maxTime).toBeLessThan(duration * 1.1 + 0.3);
      expect(onStep(maxTime, 0.1)).toBe(true);
    }
  });

  it("extends to transitions past the duration", () => {
    const variables = emptyVariables();
    variables[3]!.transitions = [{startDSecs: 10, endDSecs: 95, startValue: 0, endValue: 1, type: "linear"}];
    expect(maxTimeFor(variables, 5)).toBe(9.5);
  });
});

describe("ruler", () => {
  it("spaces labels further apart in time as the timeline zooms out", () => {
    const steps = [400, 100, 20, 2].map(scale => rulerTicks(scale, 0, 600, 600).step);
    expect(steps).toEqual([...steps].sort((a, b) => a - b));
    expect(new Set(steps).size).toBe(steps.length);
  });

  it("labels evenly spaced ticks from the start of the range, with unlabelled ticks between", () => {
    const ruler = rulerTicks(100, 0, 10, 10);
    const times = ruler.major.map(t => t.time);
    expect(times[0]).toBe(0);
    for (const time of times) {
      expect(onStep(time, ruler.step)).toBe(true);
    }
    expect(ruler.minor.length).toBeGreaterThan(0);
    for (const time of ruler.minor) {
      expect(onStep(time, ruler.step)).toBe(false);
    }
  });

  it("labels tenths of a second when zoomed in", () => {
    const ruler = rulerTicks(MAX_PX_PER_SECOND, 1, 2, 10);
    expect(ruler.step).toBeLessThan(1);
    expect(ruler.major.map(t => t.label)).toContain("1.0");
    expect(ruler.major.every(t => /^\d+\.\d$/.test(t.label))).toBe(true);
  });

  it("only gives ticks in the range asked for", () => {
    const ruler = rulerTicks(100, 50.5, 52, 100);
    for (const time of [...ruler.major.map(t => t.time), ...ruler.minor]) {
      expect(time).toBeGreaterThanOrEqual(50.5 - ruler.step);
      expect(time).toBeLessThanOrEqual(52);
    }
  });

  it("labels minutes and seconds for timelines a minute or longer", () => {
    const ruler = rulerTicks(2, 0, 600, 600);
    expect(ruler.major.every(t => /^\d+:\d\d$/.test(t.label))).toBe(true);
    expect(ruler.major.map(t => t.label)).toContain("1:00");
  });
});

describe("durations", () => {
  it("drags the duration by the time the pointer moved, to the hundredth, at least 0.1s", () => {
    expect(draggedDuration(5, timeToX(1.1, 40), 40)).toBe(6.1);
    expect(draggedDuration(5, 1, 40)).toBe(5.03);
    expect(draggedDuration(1, -400, 40)).toBe(0.1);
  });

  it("rounds a dragged duration to the tenth", () => {
    expect(roundDuration(6.03)).toBe(6);
    expect(roundDuration(6.06)).toBe(6.1);
    expect(roundDuration(0.02)).toBe(0.1);
  });
});

describe("formatTime", () => {
  it("formats minutes and seconds, rounding down", () => {
    expect(formatTime(0)).toBe("0:00");
    expect(formatTime(1.99)).toBe("0:01");
    expect(formatTime(75)).toBe("1:15");
    expect(formatTime(3725)).toBe("1:02:05");
    expect(formatTime(-3)).toBe("-0:03");
  });
});
