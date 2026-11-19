// Edits to one variable's transitions, keeping them sorted and non-overlapping.
import type {Transition, Variable} from "../lib/document";
import type {GrabMode} from "./geometry";

// Whether [startDSecs, endDSecs] fits within the duration without overlapping another
// transition (besides the one at `ignoreIndex`). Transitions may touch end to start.
export function isInsertable(
  transitions: readonly Transition[], startDSecs: number, endDSecs: number, maxDSecs: number,
  ignoreIndex = -1,
): boolean {
  if (startDSecs < 0 || endDSecs > maxDSecs || endDSecs <= startDSecs) {
    return false;
  }
  return transitions.every((t, i) => i === ignoreIndex || !(startDSecs < t.endDSecs && t.startDSecs < endDSecs));
}

export function insertTransition(
  transitions: readonly Transition[], transition: Transition,
): {transitions: Transition[]; index: number} {
  const index = transitions.findIndex(t => t.startDSecs > transition.startDSecs);
  const at = index === -1 ? transitions.length : index;
  return {transitions: [...transitions.slice(0, at), transition, ...transitions.slice(at)], index: at};
}

export function replaceTransition(
  transitions: readonly Transition[], index: number, transition: Transition,
): Transition[] {
  return transitions.map((t, i) => (i === index ? transition : t));
}

export function removeTransition(transitions: readonly Transition[], index: number): Transition[] {
  return transitions.filter((_, i) => i !== index);
}

// Moves or resizes the transition at `index` by `deltaDSecs`, stopping at its neighbours, at
// 0 and at `maxDSecs`. A transition already past `maxDSecs` (after the duration was shortened)
// can still move left or shrink. Returns the moved transition.
export function dragTransition(
  transitions: readonly Transition[], index: number, mode: GrabMode, deltaDSecs: number,
  maxDSecs: number,
): Transition {
  const t = transitions[index];
  if (!t) {
    throw new RangeError("no transition at " + index);
  }
  const lo = transitions[index - 1]?.endDSecs ?? 0;
  const hi = Math.min(transitions[index + 1]?.startDSecs ?? Infinity, Math.max(maxDSecs, t.endDSecs));
  const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
  switch (mode) {
    case "move": {
      const length = t.endDSecs - t.startDSecs;
      const startDSecs = clamp(t.startDSecs + deltaDSecs, lo, hi - length);
      return {...t, startDSecs, endDSecs: startDSecs + length};
    }
    case "resizeLeft":
      return {...t, startDSecs: clamp(t.startDSecs + deltaDSecs, lo, t.endDSecs - 1)};
    case "resizeRight":
      return {...t, endDSecs: clamp(t.endDSecs + deltaDSecs, t.startDSecs + 1, hi)};
  }
}

export function withTransitions(
  variables: readonly Variable[], row: number, transitions: Transition[],
): Variable[] {
  return variables.map((v, i) => (i === row ? {...v, transitions} : v));
}

// A typed transition value: a finite number, or null if the text isn't one.
export function parseValue(text: string): number | null {
  if (text.trim() === "") {
    return null;
  }
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}
