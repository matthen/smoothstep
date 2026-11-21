import {describe, expect, it} from "vitest";
import {emptyVariables} from "../lib/document";
import {
  clampTime, clampZoom, dragDeltaDSecs, draggedDuration, durationDSecs, END_PADDING, fitPxPerSecond, formatTime,
  grabMode, hoverEndDSecs, hoverStartDSecs, MAX_PX_PER_SECOND, maxTimeFor, roundDuration, rowAt, rulerTicks,
  timeAreaWidth, timeToX, xToTime,
} from "./geometry";

describe("time and pixels", () => {
  it("maps seconds to pixels at a scale", () => {
    expect(timeToX(2.5, 40)).toBe(100);
    expect(xToTime(100, 40)).toBe(2.5);
    expect(timeToX(2.5, 100)).toBe(250);
    expect(xToTime(250, 100)).toBe(2.5);
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
  it("fits the whole timeline to the width", () => {
    const scale = fitPxPerSecond(1012, 10);
    expect(scale).toBe(100);
    expect(timeAreaWidth(10, scale)).toBe(1012);
  });

  it("fits a long timeline into a narrow panel", () => {
    const scale = fitPxPerSecond(300, 600);
    expect(timeAreaWidth(600, scale)).toBeCloseTo(300);
  });

  it("zooms in from the fit up to the most pixels per second", () => {
    expect(clampZoom(0.5, 40)).toBe(1);
    expect(clampZoom(3, 40)).toBe(3);
    expect(clampZoom(100, 40)).toBe(MAX_PX_PER_SECOND / 40);
  });

  it("doesn't zoom a timeline already fitted past the most pixels per second", () => {
    expect(clampZoom(4, 1000)).toBe(1);
  });
});

describe("rows", () => {
  it("finds the row whose band is under the pointer", () => {
    expect(rowAt(14, 16)).toBe(0);
    expect(rowAt(30 + 3, 16)).toBe(1);
    expect(rowAt(30 + 27, 16)).toBe(1);
    expect(rowAt(30 * 15 + 10, 16)).toBe(15);
  });

  it("ignores the gaps between bands and positions outside the rows", () => {
    expect(rowAt(1, 16)).toBeNull();
    expect(rowAt(30 + 29, 16)).toBeNull();
    expect(rowAt(-5, 16)).toBeNull();
    expect(rowAt(30 * 16 + 10, 16)).toBeNull();
  });
});

describe("snapping", () => {
  it("snaps a new transition's start to the tenth of a second left of the pointer", () => {
    expect(hoverStartDSecs(0, 40)).toBe(0);
    expect(hoverStartDSecs(5, 40)).toBe(0);
    expect(hoverStartDSecs(6, 40)).toBe(1);
    expect(hoverStartDSecs(86, 40)).toBe(21);
  });

  it("snaps at other scales, with less slack when tenths are narrow", () => {
    expect(hoverStartDSecs(250, 100)).toBe(24);
    expect(hoverStartDSecs(253, 100)).toBe(25);
    expect(hoverStartDSecs(50, 10)).toBe(49);
    expect(hoverStartDSecs(51, 10)).toBe(50);
  });

  it("snaps a new transition's end, keeping it at least 0.1s long", () => {
    expect(hoverEndDSecs(166, 21, 40)).toBe(42);
    expect(hoverEndDSecs(10, 21, 40)).toBe(22);
    expect(hoverEndDSecs(409, 21, 100)).toBe(41);
  });

  it("rounds drags to whole tenths", () => {
    expect(dragDeltaDSecs(0, 40)).toBe(0);
    expect(dragDeltaDSecs(1, 40)).toBe(0);
    expect(dragDeltaDSecs(3, 40)).toBe(1);
    expect(dragDeltaDSecs(-7, 40)).toBe(-2);
    expect(dragDeltaDSecs(60, 40)).toBe(15);
    expect(dragDeltaDSecs(60, 200)).toBe(3);
    // Zoomed in, a drag moves in finer steps, down to a hundredth of a second.
    expect(dragDeltaDSecs(13, 200)).toBe(0.5);
    expect(dragDeltaDSecs(9, 400)).toBe(0.2);
    expect(dragDeltaDSecs(7, 800)).toBe(0.1);
    expect(dragDeltaDSecs(-7, 800)).toBe(-0.1);
  });

  it("grabs the edges of a transition to resize it", () => {
    expect(grabMode(-2, 40)).toBe("resizeLeft");
    expect(grabMode(2, 40)).toBe("resizeLeft");
    expect(grabMode(3, 40)).toBe("move");
    expect(grabMode(35, 40)).toBe("move");
    expect(grabMode(36, 40)).toBe("resizeRight");
    expect(grabMode(41, 40)).toBe("resizeRight");
  });
});

describe("timeline length", () => {
  it("extends a little past the duration, rounded up to a tenth", () => {
    const variables = emptyVariables();
    expect(maxTimeFor(variables, 5)).toBe(5.3);
    expect(maxTimeFor(variables, 1)).toBe(1.2);
    expect(maxTimeFor(variables, 9)).toBe(9.5);
    expect(maxTimeFor(variables, 100)).toBe(105);
    expect(timeAreaWidth(6, 40)).toBe(240 + END_PADDING);
  });

  it("extends to transitions past the duration", () => {
    const variables = emptyVariables();
    variables[3]!.transitions = [{startDSecs: 10, endDSecs: 95, startValue: 0, endValue: 1, type: "linear"}];
    expect(maxTimeFor(variables, 5)).toBe(9.5);
  });
});

describe("ruler", () => {
  it("labels every second, with ticks between, at a fitted scale", () => {
    const ruler = rulerTicks(100, 0, 10, 10);
    expect(ruler.step).toBe(1);
    expect(ruler.major.map(t => t.label)).toEqual(["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10"]);
    expect(ruler.minor).toContain(0.1);
    expect(ruler.minor).not.toContain(1);
  });

  it("labels less often when zoomed out", () => {
    const ruler = rulerTicks(20, 0, 30, 30);
    expect(ruler.step).toBe(5);
    expect(ruler.major.map(t => t.time)).toEqual([0, 5, 10, 15, 20, 25, 30]);
    expect(ruler.minor).toContain(1);
  });

  it("labels tenths of a second when zoomed in", () => {
    const ruler = rulerTicks(400, 1, 2, 10);
    expect(ruler.step).toBe(0.2);
    expect(ruler.major.map(t => t.label)).toEqual(["1.0", "1.2", "1.4", "1.6", "1.8", "2.0"]);
    expect(ruler.minor).toEqual([1.1, 1.3, 1.5, 1.7, 1.9]);
  });

  it("only gives ticks in the range asked for", () => {
    const ruler = rulerTicks(100, 50.5, 52, 100);
    expect(ruler.major.map(t => t.time)).toEqual([51, 52]);
  });

  it("labels minutes and seconds for timelines a minute or longer", () => {
    const ruler = rulerTicks(2, 0, 600, 600);
    expect(ruler.step).toBe(30);
    expect(ruler.major.slice(0, 4).map(t => t.label)).toEqual(["0:00", "0:30", "1:00", "1:30"]);
  });
});

describe("durations", () => {
  it("drags the duration to the hundredth, at least 0.1s", () => {
    expect(draggedDuration(5, 44, 40)).toBe(6.1);
    expect(draggedDuration(5, 1, 40)).toBe(5.03);
    expect(draggedDuration(1, -400, 40)).toBe(0.1);
    expect(draggedDuration(5, 50, 100)).toBe(5.5);
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
