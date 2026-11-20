// One-time tips shown while you work, each the first time something happens. Which tips have been
// seen, or that tips are turned off, is kept in this browser; if storage is blocked, tips can repeat.
import type { Variable } from '../lib/document';
import { uses } from '../tutorial/lessons';

const KEY = "smoothstep.tips";

export type TipId = "pickers" | "errors" | "prevFrame" | "transitions" | "backup";

export interface Tip {
  title: string;
  // Code is marked with backticks.
  message: string;
}

export function tipContent(id: TipId, phone: boolean): Tip {
  const click = phone ? "Tap" : "Click";
  switch (id) {
    case "pickers":
      return {
        title: "Change values with pickers",
        message: click + " a number, colour or `vec2` in your code for a picker. Dragging it updates the canvas " +
          "as you go.",
      };
    case "errors":
      return {
        title: "Your code didn't build",
        message: "The error is shown under the line it's on, and the canvas keeps the last version that built. " +
          "Fix it and build again.",
      };
    case "prevFrame":
      return {
        title: "Building on the last frame",
        message: "`iPrevFrame` holds the frame drawn just before. `iFrame` goes back to 0 when you build and when " +
          "the animation loops, so use `if (iFrame == 0)` to set things up.",
      };
    case "transitions":
      return {
        title: "Your first transition",
        message: "Set the values it moves between, and choose smoothstep, linear or step. In your code, " +
          "`#define size iFloat0` gives the input a name, and the timeline shows it.",
      };
    case "backup":
      return {
        title: "Saved in this browser",
        message: "Your animations are kept in this browser only. File → Download animation file saves a copy " +
          "you can back up, and Share gives you a link to send to people.",
      };
  }
}

// What just happened, and the tips it could show, most useful first.
export type TipEvent =
  | {kind: "built"; ok: boolean; code: string; edited: boolean}
  | {kind: "variablesChanged"; before: readonly Variable[]; after: readonly Variable[]}
  | {kind: "saved"};

function transitionCount(variables: readonly Variable[]): number {
  return variables.reduce((sum, variable) => sum + variable.transitions.length, 0);
}

export function tipsFor(event: TipEvent): TipId[] {
  switch (event.kind) {
    case "built":
      if (!event.ok) {
        return ["errors"];
      }
      return [
        ...(uses(event.code, /\biPrevFrame\b/) ? ["prevFrame" as const] : []),
        ...(event.edited ? ["pickers" as const] : []),
      ];
    case "variablesChanged":
      return transitionCount(event.after) > transitionCount(event.before) ? ["transitions"] : [];
    case "saved":
      return ["backup"];
  }
}

// The tip to show now, if any. A tip that's blocked isn't used up, so it can show next time.
export function chooseTip(candidates: readonly TipId[], seen: ReadonlySet<TipId> | "off", blocked: boolean): TipId | null {
  if (blocked || seen === "off") {
    return null;
  }
  return candidates.find(id => !seen.has(id)) ?? null;
}

// Used when storage is blocked, so each tip still shows only once a visit.
let fallback: string | null = null;

function read(): string | null {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return fallback;
  }
}

export function seenTips(): Set<TipId> | "off" {
  try {
    const value = read();
    if (value === "off") {
      return "off";
    }
    const parsed: unknown = JSON.parse(value ?? "[]");
    return new Set(Array.isArray(parsed) ? parsed.filter((id): id is TipId => typeof id === "string") : []);
  } catch {
    return new Set();
  }
}

function store(value: string) {
  try {
    window.localStorage.setItem(KEY, value);
  } catch {
    fallback = value;
  }
}

export function markTipSeen(id: TipId) {
  const seen = seenTips();
  if (seen !== "off") {
    store(JSON.stringify([...seen.add(id)]));
  }
}

export function turnOffTips() {
  store("off");
}
