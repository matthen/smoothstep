import { afterEach, describe, expect, it, vi } from 'vitest';

import { emptyVariables } from '../lib/document';
import { chooseTip, markTipSeen, seenTips, tipContent, tipsFor, turnOffTips, type TipId } from './tips';

const withTransition = () => {
  const variables = emptyVariables();
  variables[2] = {transitions: [{startDSecs: 0, endDSecs: 10, startValue: 0, endValue: 1, type: "smoothstep"}]};
  return variables;
};

describe("tipsFor", () => {
  it("offers the error tip for a failed build", () => {
    expect(tipsFor({kind: "built", ok: false, code: "iPrevFrame", edited: true})).toEqual(["errors"]);
  });

  it("offers the pickers tip only for edited code that built", () => {
    expect(tipsFor({kind: "built", ok: true, code: "void main() {}", edited: true})).toEqual(["pickers"]);
    expect(tipsFor({kind: "built", ok: true, code: "void main() {}", edited: false})).toEqual([]);
  });

  it("puts iPrevFrame first when the code uses it outside a comment", () => {
    const code = "fragColor = texture(iPrevFrame, uv);";
    expect(tipsFor({kind: "built", ok: true, code, edited: true})).toEqual(["prevFrame", "pickers"]);
    expect(tipsFor({kind: "built", ok: true, code: "// iPrevFrame later", edited: false})).toEqual([]);
  });

  it("offers the transition tip when a transition is added, not removed or changed", () => {
    const empty = emptyVariables();
    const one = withTransition();
    expect(tipsFor({kind: "variablesChanged", before: empty, after: one})).toEqual(["transitions"]);
    expect(tipsFor({kind: "variablesChanged", before: one, after: empty})).toEqual([]);
    expect(tipsFor({kind: "variablesChanged", before: one, after: withTransition()})).toEqual([]);
  });

  it("offers the backup tip after a save", () => {
    expect(tipsFor({kind: "saved"})).toEqual(["backup"]);
  });

  it("has words for every tip", () => {
    const ids: TipId[] = ["pickers", "errors", "prevFrame", "transitions", "backup"];
    for (const id of ids) {
      expect(tipContent(id, false).message).toBeTruthy();
    }
    expect(tipContent("pickers", true).message).toMatch(/^Tap/);
  });
});

describe("chooseTip", () => {
  it("picks the first unseen tip, unless blocked or off", () => {
    expect(chooseTip(["prevFrame", "pickers"], new Set(), false)).toBe("prevFrame");
    expect(chooseTip(["prevFrame", "pickers"], new Set(["prevFrame"]), false)).toBe("pickers");
    expect(chooseTip(["prevFrame"], new Set(["prevFrame"]), false)).toBeNull();
    expect(chooseTip(["pickers"], new Set(), true)).toBeNull();
    expect(chooseTip(["pickers"], "off", false)).toBeNull();
    expect(chooseTip([], new Set(), false)).toBeNull();
  });
});

describe("tip storage", () => {
  afterEach(() => window.localStorage.clear());

  it("remembers which tips were seen", () => {
    expect(seenTips()).toEqual(new Set());
    markTipSeen("errors");
    markTipSeen("backup");
    expect(seenTips()).toEqual(new Set(["errors", "backup"]));
  });

  it("can turn tips off for good", () => {
    markTipSeen("errors");
    turnOffTips();
    markTipSeen("backup");
    expect(seenTips()).toBe("off");
  });

  it("remembers for the visit when storage is blocked", () => {
    const blocked = () => {
      throw new DOMException("blocked", "SecurityError");
    };
    const get = vi.spyOn(Storage.prototype, "getItem").mockImplementation(blocked);
    const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(blocked);
    try {
      markTipSeen("errors");
      expect(seenTips()).toEqual(new Set(["errors"]));
      turnOffTips();
      expect(seenTips()).toBe("off");
    } finally {
      get.mockRestore();
      set.mockRestore();
    }
  });

  it("reads bad stored values as nothing seen", () => {
    window.localStorage.setItem("smoothstep.tips", "{not json");
    expect(seenTips()).toEqual(new Set());
    window.localStorage.setItem("smoothstep.tips", "{}");
    expect(seenTips()).toEqual(new Set());
  });
});
