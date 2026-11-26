// What the Console tab shows: the Canvas2D code's console calls, every tab's errors, a line for each
// build, and problems the app notices. It lives outside React, so a draw function logging 60 times
// a second doesn't re-render the app: the view hears of changes at most once an animation frame.
import type { ShaderId } from '../render/Renderer';

// "note" is the app's own quiet line, such as "Built in 40 ms".
type ConsoleLevel = "log" | "info" | "warn" | "error" | "note";

export interface ConsoleEntry {
  id: number;
  level: ConsoleLevel;
  text: string;
  // The code tab and line (from 0) it's about, which clicking it goes to.
  tab?: ShaderId;
  line?: number | null;
  // The Canvas2D step it was logged on and its time in seconds, for console calls.
  frame?: number | null;
  time?: number | null;
  // Logged while rendering a video, rather than by the preview.
  render?: boolean;
  // How many times in a row it was logged.
  count: number;
}

export type NewEntry = Omit<ConsoleEntry, "id" | "count"> & {count?: number};

export interface ConsoleSnapshot {
  entries: readonly ConsoleEntry[];
  // Errors have arrived since the console was last in view.
  unseenErrors: boolean;
}

// Entries kept before the oldest go.
const MAX_ENTRIES = 500;

const sameEntry = (a: ConsoleEntry, b: NewEntry) =>
  a.level === b.level && a.text === b.text && a.tab === b.tab && (a.line ?? null) === (b.line ?? null) &&
  (a.render ?? false) === (b.render ?? false);

function nextFrame(callback: () => void) {
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(callback);
  } else {
    setTimeout(callback, 16);
  }
}

export class ConsoleStore {
  private entries: ConsoleEntry[] = [];
  private nextId = 1;
  private unseenErrors = false;
  private viewing = false;
  private snapshot: ConsoleSnapshot = {entries: [], unseenErrors: false};
  private listeners = new Set<() => void>();
  private due = false;

  // `schedule` runs the update for listeners; tests pass their own.
  constructor(private max = MAX_ENTRIES, private schedule: (callback: () => void) => void = nextFrame) {}

  // Adds an entry, or counts it on the last one when it's the same.
  add(entry: NewEntry) {
    const count = entry.count ?? 1;
    const last = this.entries[this.entries.length - 1];
    if (last && sameEntry(last, entry)) {
      // The latest step's frame and time, with the count so far.
      this.entries[this.entries.length - 1] = {...last, ...entry, id: last.id, count: last.count + count};
    } else {
      this.entries.push({...entry, id: this.nextId++, count});
      if (this.entries.length > this.max) {
        this.entries.splice(0, this.entries.length - this.max);
      }
    }
    if (entry.level === "error" && !this.viewing) {
      this.unseenErrors = true;
    }
    this.changed();
  }

  clear() {
    this.entries = [];
    this.unseenErrors = false;
    this.changed();
  }

  // Whether the console is in view, which counts its errors as seen.
  setViewing(viewing: boolean) {
    this.viewing = viewing;
    if (viewing && this.unseenErrors) {
      this.unseenErrors = false;
      this.changed();
    }
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): ConsoleSnapshot => this.snapshot;

  private changed() {
    if (this.due) {
      return;
    }
    this.due = true;
    this.schedule(() => {
      this.due = false;
      this.snapshot = {entries: [...this.entries], unseenErrors: this.unseenErrors};
      this.listeners.forEach(listener => listener());
    });
  }
}
