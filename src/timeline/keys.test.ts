import {describe, expect, it} from "vitest";
import {keyAction, keySeekTime, shortcutsAllowed} from "./keys";

const key = (k: string, mods: Partial<{ctrlKey: boolean; metaKey: boolean; altKey: boolean}> = {}) =>
  ({key: k, ctrlKey: false, metaKey: false, altKey: false, ...mods});

describe("keyAction", () => {
  it("maps the playback and timeline shortcuts", () => {
    expect(keyAction(key(" "))).toEqual({type: "playPause"});
    expect(keyAction(key("0"))).toEqual({type: "seekFraction", fraction: 0});
    expect(keyAction(key("7"))).toEqual({type: "seekFraction", fraction: 0.7});
    expect(keyAction(key("ArrowRight"))).toMatchObject({type: "step", seconds: 0.1});
    expect(keyAction(key("ArrowLeft"))).toMatchObject({type: "step", seconds: -0.1});
    expect(keyAction(key("."))).toMatchObject({type: "step", seconds: 1 / 60});
    expect(keyAction(key(","))).toMatchObject({type: "step", seconds: -1 / 60});
    expect(keyAction(key("Backspace"))).toEqual({type: "deleteTransition"});
    expect(keyAction(key("Delete"))).toEqual({type: "deleteTransition"});
  });

  it("ignores other keys and modified keys", () => {
    expect(keyAction(key("a"))).toBeNull();
    expect(keyAction(key("Enter"))).toBeNull();
    expect(keyAction(key("0", {metaKey: true}))).toBeNull();
    expect(keyAction(key(" ", {ctrlKey: true}))).toBeNull();
    expect(keyAction(key("ArrowLeft", {altKey: true}))).toBeNull();
  });
});

describe("keySeekTime", () => {
  it("jumps to a fraction of the duration", () => {
    expect(keySeekTime({type: "seekFraction", fraction: 0.5}, 3, 12)).toBe(6);
  });

  it("steps by a tenth, rounding to the tenth and staying within the duration", () => {
    const right = keyAction(key("ArrowRight"))!;
    const left = keyAction(key("ArrowLeft"))!;
    expect(keySeekTime(right, 1.234, 12)).toBe(1.3);
    expect(keySeekTime(left, 0.05, 12)).toBe(0);
    expect(keySeekTime(right, 11.95, 12)).toBe(12);
    expect(keySeekTime(right, 12.3, 12.36)).toBe(12.36);
  });

  it("steps by a frame without rounding", () => {
    expect(keySeekTime(keyAction(key("."))!, 1, 12)).toBeCloseTo(1 + 1 / 60);
    expect(keySeekTime(keyAction(key(","))!, 0, 12)).toBe(0);
  });

  it("has no time for other actions", () => {
    expect(keySeekTime({type: "playPause"}, 1, 12)).toBeNull();
  });
});

describe("shortcutsAllowed", () => {
  function el(html: string, selector: string): Element {
    const div = document.createElement("div");
    div.innerHTML = html;
    return div.querySelector(selector)!;
  }

  it("applies on the page", () => {
    expect(shortcutsAllowed(document.body, " ")).toBe(true);
    expect(shortcutsAllowed(null, " ")).toBe(true);
    expect(shortcutsAllowed(el("<canvas></canvas>", "canvas"), "ArrowLeft")).toBe(true);
  });

  it("leaves typing targets alone", () => {
    expect(shortcutsAllowed(el("<input>", "input"), "1")).toBe(false);
    expect(shortcutsAllowed(el("<textarea></textarea>", "textarea"), " ")).toBe(false);
    expect(shortcutsAllowed(el("<select></select>", "select"), "ArrowLeft")).toBe(false);
    expect(shortcutsAllowed(el('<div class="cm-editor"><div class="cm-content" contenteditable="true"><span>x</span></div></div>', "span"), " ")).toBe(false);
  });

  it("leaves space to buttons but takes other keys", () => {
    expect(shortcutsAllowed(el("<button><svg></svg></button>", "svg"), " ")).toBe(false);
    expect(shortcutsAllowed(el("<button></button>", "button"), "ArrowRight")).toBe(true);
  });
});
