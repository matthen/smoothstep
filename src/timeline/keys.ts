// Playback and timeline keyboard shortcuts, which apply when focus isn't somewhere you type.
import {clampTime} from "./geometry";

export type KeyAction =
  | {type: "playPause"}
  | {type: "seekFraction"; fraction: number}
  | {type: "step"; seconds: number; roundToTenth: boolean}
  | {type: "deleteTransition"};

export interface KeyInfo {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
}

export function keyAction(event: KeyInfo): KeyAction | null {
  if (event.ctrlKey || event.metaKey || event.altKey) {
    return null;
  }
  const {key} = event;
  if (key === " ") {
    return {type: "playPause"};
  }
  if (key.length === 1 && key >= "0" && key <= "9") {
    return {type: "seekFraction", fraction: Number(key) / 10};
  }
  switch (key) {
    case "ArrowLeft":
      return {type: "step", seconds: -0.1, roundToTenth: true};
    case "ArrowRight":
      return {type: "step", seconds: 0.1, roundToTenth: true};
    case ",":
      return {type: "step", seconds: -1 / 60, roundToTenth: false};
    case ".":
      return {type: "step", seconds: 1 / 60, roundToTenth: false};
    case "Backspace":
    case "Delete":
      return {type: "deleteTransition"};
  }
  return null;
}

// The time a seek or step shortcut moves to.
export function keySeekTime(action: KeyAction, time: number, duration: number): number | null {
  if (action.type === "seekFraction") {
    return action.fraction * duration;
  }
  if (action.type === "step") {
    const t = clampTime(time + action.seconds, duration);
    return action.roundToTenth ? clampTime(Math.round(t * 10) / 10, duration) : t;
  }
  return null;
}

// Inputs, selects and the code editor (CodeMirror's contenteditable) keep their keys. Buttons
// keep space, which clicks them.
export function shortcutsAllowed(target: EventTarget | null, key: string): boolean {
  if (!(target instanceof Element)) {
    return true;
  }
  if (target.closest("input, textarea, select, [contenteditable]:not([contenteditable='false']), .cm-editor")) {
    return false;
  }
  return !(key === " " && target.closest("button, a[href], [role='button']"));
}
