import { describe, expect, it } from 'vitest';

import { ConsoleStore, MAX_ENTRIES } from './consoleStore';

// A store whose updates run when the test says, as the next animation frame would.
function store(max?: number) {
  const due: (() => void)[] = [];
  const console = new ConsoleStore(max, callback => due.push(callback));
  let updates = 0;
  console.subscribe(() => updates++);
  return {
    console,
    frame() {
      due.splice(0).forEach(callback => callback());
    },
    get updates() {
      return updates;
    },
    texts: () => console.getSnapshot().entries.map(e => e.count > 1 ? `${e.text} ×${e.count}` : e.text),
  };
}

describe("ConsoleStore", () => {
  it("folds an entry that repeats the one before into one with a count, keeping the latest step", () => {
    const s = store();
    for (let frame = 0; frame < 240; frame++) {
      s.console.add({level: "log", text: "drawing", tab: "canvas", line: 3, frame, time: frame / 60});
    }
    s.console.add({level: "log", text: "done", tab: "canvas", line: 4, frame: 240, time: 4});
    s.console.add({level: "log", text: "drawing", tab: "canvas", line: 3, frame: 241, time: 241 / 60});
    s.frame();
    expect(s.texts()).toEqual(["drawing ×240", "done", "drawing"]);
    expect(s.console.getSnapshot().entries[0]!.frame).toBe(239);
  });

  it("doesn't fold the same text from another line or level", () => {
    const s = store();
    s.console.add({level: "log", text: "x", tab: "canvas", line: 1});
    s.console.add({level: "log", text: "x", tab: "canvas", line: 2});
    s.console.add({level: "warn", text: "x", tab: "canvas", line: 2});
    s.frame();
    expect(s.texts()).toEqual(["x", "x", "x"]);
  });

  it("adds counts that arrive already folded", () => {
    const s = store();
    s.console.add({level: "log", text: "tick", count: 10});
    s.console.add({level: "log", text: "tick", count: 5});
    s.frame();
    expect(s.texts()).toEqual(["tick ×15"]);
  });

  it("keeps only the newest entries past its cap", () => {
    const s = store();
    const total = MAX_ENTRIES * 4;
    for (let i = 0; i < total; i++) {
      s.console.add({level: "log", text: String(i)});
    }
    s.frame();
    const texts = s.texts();
    expect(texts).toHaveLength(MAX_ENTRIES);
    expect(texts[0]).toBe(String(total - MAX_ENTRIES));
    expect(texts.at(-1)).toBe(String(total - 1));
  });

  it("drops logged lines before errors, warnings and notes when full, and the dot only counts errors still listed", () => {
    const s = store(10);
    s.console.add({level: "note", text: "Built"});
    s.console.add({level: "error", text: "broken", tab: "image", line: 2});
    s.console.add({level: "warn", text: "black texture"});
    for (let frame = 0; frame < 100; frame++) {
      s.console.add({level: "log", text: `tick ${frame}`, tab: "canvas", line: 3, frame});
    }
    s.frame();
    expect(s.texts()).toEqual(["Built", "broken", "black texture", ...Array.from({length: 7}, (_, i) => `tick ${93 + i}`)]);
    expect(s.console.getSnapshot().unseenErrors).toBe(true);

    // With nothing logged left to drop, the oldest goes, and an unseen error with it.
    for (let i = 0; i < 10; i++) {
      s.console.add({level: "note", text: `Restarted ${i}`});
    }
    s.frame();
    expect(s.texts()).toHaveLength(10);
    expect(s.texts()).not.toContain("broken");
    expect(s.console.getSnapshot().unseenErrors).toBe(false);
  });

  it("tells listeners once a frame, however many entries arrive", () => {
    const s = store();
    for (let i = 0; i < 100; i++) {
      s.console.add({level: "log", text: String(i)});
    }
    expect(s.updates).toBe(0);
    expect(s.console.getSnapshot().entries).toHaveLength(0);
    s.frame();
    expect(s.updates).toBe(1);
    expect(s.console.getSnapshot().entries).toHaveLength(100);
  });

  it("marks errors unseen until the console is in view, and clearing forgets them", () => {
    const s = store();
    s.console.add({level: "warn", text: "slow"});
    s.frame();
    expect(s.console.getSnapshot().unseenErrors).toBe(false);
    s.console.add({level: "error", text: "broken", tab: "image", line: 2});
    s.frame();
    expect(s.console.getSnapshot().unseenErrors).toBe(true);
    s.console.setViewing(true);
    s.frame();
    expect(s.console.getSnapshot().unseenErrors).toBe(false);
    s.console.add({level: "error", text: "while looking"});
    s.frame();
    expect(s.console.getSnapshot().unseenErrors).toBe(false);
    s.console.setViewing(false);
    s.console.add({level: "error", text: "later"});
    s.console.clear();
    s.frame();
    expect(s.console.getSnapshot()).toEqual({entries: [], unseenErrors: false});
  });
});
