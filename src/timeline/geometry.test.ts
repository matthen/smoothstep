import {describe, expect, it} from "vitest";
import {emptyVariables} from "../lib/document";
import {
  clampTime, dragDeltaDSecs, draggedDuration, durationDSecs, formatTime, grabMode, headerTicks,
  hoverEndDSecs, hoverStartDSecs, maxTimeFor, roundDuration, rowAt, timeAreaWidth, timeToX, xToTime,
} from "./geometry";

describe("time and pixels", () => {
  it("maps 40px to a second", () => {
    expect(timeToX(2.5)).toBe(100);
    expect(xToTime(100)).toBe(2.5);
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

describe("rows", () => {
  it("finds the row whose bar is under the pointer", () => {
    expect(rowAt(14, 16)).toBe(0);
    expect(rowAt(28 + 4, 16)).toBe(1);
    expect(rowAt(28 + 23, 16)).toBe(1);
    expect(rowAt(28 * 15 + 10, 16)).toBe(15);
  });

  it("ignores the gaps between bars and positions outside the rows", () => {
    expect(rowAt(2, 16)).toBeNull();
    expect(rowAt(28 + 25, 16)).toBeNull();
    expect(rowAt(-5, 16)).toBeNull();
    expect(rowAt(28 * 16 + 10, 16)).toBeNull();
  });
});

describe("snapping", () => {
  it("snaps a new transition's start to the tenth of a second left of the pointer", () => {
    expect(hoverStartDSecs(0)).toBe(0);
    expect(hoverStartDSecs(5)).toBe(0);
    expect(hoverStartDSecs(6)).toBe(1);
    expect(hoverStartDSecs(86)).toBe(21);
  });

  it("snaps a new transition's end, keeping it at least 0.1s long", () => {
    expect(hoverEndDSecs(166, 21)).toBe(42);
    expect(hoverEndDSecs(10, 21)).toBe(22);
  });

  it("rounds drags to whole tenths", () => {
    expect(dragDeltaDSecs(0)).toBe(0);
    expect(dragDeltaDSecs(1)).toBe(0);
    expect(dragDeltaDSecs(3)).toBe(1);
    expect(dragDeltaDSecs(-7)).toBe(-2);
    expect(dragDeltaDSecs(60)).toBe(15);
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

describe("timeline length and ticks", () => {
  it("extends half a second past the duration, rounded up", () => {
    const variables = emptyVariables();
    expect(maxTimeFor(variables, 5)).toBe(6);
    expect(maxTimeFor(variables, 5.6)).toBe(7);
    expect(timeAreaWidth(6)).toBe(260);
  });

  it("extends to transitions past the duration", () => {
    const variables = emptyVariables();
    variables[3]!.transitions = [{startDSecs: 10, endDSecs: 95, startValue: 0, endValue: 1, type: "linear"}];
    expect(maxTimeFor(variables, 5)).toBe(9.5);
  });

  it("labels every second", () => {
    expect(headerTicks(6)).toEqual({labels: [1, 2, 3, 4, 5, 6], tens: false});
    expect(headerTicks(9.5).labels).toHaveLength(10);
  });

  it("labels every ten seconds past 1000 seconds", () => {
    const {labels, tens} = headerTicks(1005);
    expect(tens).toBe(true);
    expect(labels[0]).toBe(10);
    expect(labels[labels.length - 1]).toBe(990);
  });
});

describe("durations", () => {
  it("drags the duration to the hundredth, at least 0.1s", () => {
    expect(draggedDuration(5, 44)).toBe(6.1);
    expect(draggedDuration(5, 1)).toBe(5.03);
    expect(draggedDuration(1, -400)).toBe(0.1);
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
