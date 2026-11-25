import {describe, expect, it} from "vitest";
import type {Transition} from "../lib/document";
import {ROW_BAND_BOTTOM, ROW_BAND_TOP, ROW_HEIGHT, timeToX} from "./geometry";
import {
  awaitingEnd, extendCreating, holdCreating, liftGesture, moveGesture, NO_TOUCHES, shownCreating, startCreating,
  SWIPE_PX, touchDown, touchUp,
} from "./gestures";
import type {Creating, Gesture, Rows} from "./gestures";

function t(startDSecs: number, endDSecs: number): Transition {
  return {startDSecs, endDSecs, startValue: 0, endValue: 1, type: "smoothstep"};
}

// Zoomed in far enough that each tenth of a second is many pixels wide.
const PPS = 400;
const rows: Rows = {transitions: [[], [t(40, 60)]], maxDSecs: 100, pxPerSecond: PPS};
// The middle of a tenth of a second, and of a row's band.
const x = (dsecs: number) => timeToX((dsecs + 0.5) / 10, PPS);
const y = (row: number) => row * ROW_HEIGHT + (ROW_BAND_TOP + ROW_BAND_BOTTOM) / 2;

function press(dsecs: number, row: number, byTouch: boolean): Creating {
  const gesture = startCreating(rows, x(dsecs), y(row), byTouch);
  if (!gesture) {
    throw new Error("no room to start a transition");
  }
  return gesture;
}

const lift = (gesture: Gesture, dsecs: number, row: number, byTouch: boolean) =>
  liftGesture(gesture, rows, x(dsecs), y(row), byTouch);

describe("adding a transition with the mouse", () => {
  it("adds one dragged out with the button held, from the press to the release", () => {
    const dragged = moveGesture(press(10, 0, false), rows, x(30));
    const {gesture, add} = lift(dragged, 30, 0, false);
    expect(add).toMatchObject({row: 0, startDSecs: 10, endDSecs: 30});
    expect(gesture.kind).toBe("idle");
  });

  it("adds nothing for a click without dragging, and waits for a second click to set the end", () => {
    const first = lift(press(10, 0, false), 10, 0, false);
    expect(first.add).toBeNull();
    expect(first.gesture).toMatchObject({kind: "creating", released: true});
    const second = extendCreating(first.gesture as Creating, rows, x(30));
    expect(lift(second, 30, 0, false).add).toMatchObject({startDSecs: 10, endDSecs: 30});
  });

  it("is shown as soon as the button goes down", () => {
    expect(shownCreating(press(10, 0, false))).not.toBeNull();
  });
});

describe("adding a transition on a touch screen", () => {
  it("adds one from the first tap to where the second tap lifts", () => {
    const first = lift(press(10, 0, true), 10, 0, true);
    expect(first.add).toBeNull();
    const second = lift(first.gesture, 30, 0, true);
    expect(second.add).toMatchObject({row: 0, startDSecs: 10, endDSecs: 30});
    expect(second.gesture.kind).toBe("idle");
  });

  it("shows nothing while the finger moves less than a scroll would, so a scroll doesn't flash one", () => {
    const start = press(10, 0, true);
    expect(shownCreating(start)).toBeNull();
    expect(shownCreating(moveGesture(start, rows, start.startX + SWIPE_PX - 1))).toBeNull();
    const swiped = moveGesture(start, rows, start.startX + SWIPE_PX + 1);
    expect(shownCreating(swiped)).not.toBeNull();
    expect(lift(moveGesture(swiped, rows, x(30)), 30, 0, true).add).toMatchObject({startDSecs: 10, endDSecs: 30});
  });

  it("shows the start, waiting for the end, after a tap lifts", () => {
    const tapped = lift(press(10, 0, true), 10, 0, true).gesture;
    expect(shownCreating(tapped)).not.toBeNull();
    expect(awaitingEnd(tapped)).toBe(true);
  });

  it("drags out a transition from a held finger, which waits for a tap if it lifts without moving", () => {
    const held = holdCreating(press(10, 0, true));
    expect(shownCreating(held)).not.toBeNull();
    expect(awaitingEnd(held)).toBe(true);
    const dragged = moveGesture(held, rows, x(30));
    expect(awaitingEnd(dragged)).toBe(false);
    expect(lift(dragged, 30, 0, true).add).toMatchObject({startDSecs: 10, endDSecs: 30});
    expect(awaitingEnd(lift(held, 10, 0, true).gesture)).toBe(true);
  });

  it("treats a wobble shorter than a swipe as still: a tap waits for its end, and a hold still starts", () => {
    // Zoomed out, where a wobble crosses several tenths of a second.
    const wide: Rows = {...rows, pxPerSecond: 60};
    const start = startCreating(wide, 100, y(0), true)!;
    const wobbled = moveGesture(start, wide, start.startX + SWIPE_PX - 1) as Creating;
    expect(wobbled.endDSecs).toBeGreaterThan(start.endDSecs);
    const tapped = liftGesture(wobbled, wide, wobbled.startX + SWIPE_PX - 1, y(0), true);
    expect(tapped.add).toBeNull();
    expect(awaitingEnd(tapped.gesture)).toBe(true);
    expect(awaitingEnd(holdCreating(wobbled))).toBe(true);
  });

  it("doesn't hold once the finger has swiped", () => {
    const swiped = moveGesture(press(10, 0, true), rows, x(30));
    expect(holdCreating(swiped)).toBe(swiped);
  });

  it("cancels when the second tap is in another row", () => {
    const first = lift(press(10, 0, true), 10, 0, true);
    const second = lift(first.gesture, 30, 1, true);
    expect(second.add).toBeNull();
    expect(second.gesture.kind).toBe("idle");
  });

  it("cancels when the second tap is where the transition can't end", () => {
    const first = lift(press(30, 1, true), 30, 1, true);
    expect(lift(first.gesture, 70, 1, true).add).toBeNull();
    expect(lift(first.gesture, rows.maxDSecs + 10, 1, true).add).toBeNull();
  });
});

describe("where a transition can start and end", () => {
  it("starts only where there's room for one", () => {
    expect(startCreating(rows, x(50), y(1), false)).toBeNull();
    expect(startCreating(rows, x(rows.maxDSecs), y(0), false)).toBeNull();
    expect(startCreating(rows, x(10), y(rows.transitions.length), false)).toBeNull();
    expect(startCreating(rows, x(10), y(1), false)).not.toBeNull();
  });

  it("keeps its end before the next transition when dragged past it", () => {
    const upTo = extendCreating(press(10, 1, false), rows, x(40));
    const past = extendCreating(upTo, rows, x(70));
    expect(past.endDSecs).toBe(40);
  });

  it("can't be dragged past the duration", () => {
    const dragged = extendCreating(press(10, 0, false), rows, x(rows.maxDSecs + 10));
    expect(dragged.endDSecs).toBeLessThanOrEqual(rows.maxDSecs);
  });
});

describe("dragging a transition", () => {
  // Moving the transition in row 1, grabbed at x = 0.
  function dragging(): Gesture {
    const original = rows.transitions[1]!.slice();
    return {kind: "dragging", mode: "move", row: 1, index: 0, original, startX: 0, moved: original[0]!, pxPerSecond: PPS};
  }

  it("moves it at the scale the drag started at, even if the timeline rescales", () => {
    const moved = moveGesture(dragging(), {...rows, pxPerSecond: PPS / 2}, timeToX(1, PPS));
    expect(moved).toMatchObject({moved: {startDSecs: 50, endDSecs: 70}});
  });

  it("leaves the gesture as it was when the pointer hasn't moved a step", () => {
    const gesture = dragging();
    expect(moveGesture(gesture, rows, 1)).toBe(gesture);
  });
});

describe("pinching", () => {
  it("counts as a pinch from the second finger until every finger has lifted", () => {
    const one = touchDown(NO_TOUCHES, 1);
    expect(one.pinch).toBe(false);
    const two = touchDown(one, 2);
    expect(two.pinch).toBe(true);
    const oneLeft = touchUp(two, 2);
    expect(oneLeft.pinch).toBe(true);
    const none = touchUp(oneLeft, 1);
    expect(none.pinch).toBe(false);
    expect(touchDown(none, 3).pinch).toBe(false);
  });
});
