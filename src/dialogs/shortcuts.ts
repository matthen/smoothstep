// The keyboard shortcuts listed in Help → Keyboard shortcuts and docs/keyboard-shortcuts.md. The
// editor's keys are in editor/extensions.ts (with CodeMirror's default keymaps), playback's in
// timeline/keys.ts, and saving outside the editor in app/App.tsx.

// One key combination. "Mod" is Cmd on a Mac and Ctrl elsewhere; "Alt" is Option on a Mac.
export type Combo = string[];

export interface Shortcut {
  // Alternatives, any of which works.
  keys: Combo[];
  // Used on a Mac in place of `keys`.
  mac?: Combo[];
  // Shows the alternatives as a range, "0 to 9", rather than "or".
  range?: boolean;
  description: string;
}

export interface ShortcutGroup {
  title: string;
  note?: string;
  shortcuts: Shortcut[];
}

export const SHORTCUTS: ShortcutGroup[] = [
  {
    title: "In the code editor",
    shortcuts: [
      {keys: [["Shift", "Enter"], ["Mod", "Enter"]], description: "Build the code"},
      {keys: [["Mod", "S"]], description: "Save the animation in this browser (this works outside the editor too)"},
      {keys: [["Mod", "F"]], description: "Find"},
      {keys: [["Mod", "G"]], description: "Find the next match"},
      {keys: [["Shift", "Mod", "G"]], description: "Find the previous match"},
      {keys: [["Shift", "Ctrl", "F"]], mac: [["Mod", "Alt", "F"]], description: "Find and replace"},
      {keys: [["Shift", "Ctrl", "R"]], mac: [["Shift", "Mod", "Alt", "F"]], description: "Replace all"},
      {keys: [["Alt", "G"]], description: "Go to a line"},
      {keys: [["Mod", "/"]], description: "Comment or uncomment"},
      {keys: [["Tab"]], description: "Indent the selection, or insert two spaces"},
      {keys: [["Shift", "Tab"]], description: "Re-indent the line or selection"},
      {keys: [["Mod", "Z"]], description: "Undo"},
      {keys: [["Ctrl", "Y"]], mac: [["Shift", "Mod", "Z"]], description: "Redo"},
      {keys: [["Ctrl", "Space"]], description: "Show completions (Tab or Enter picks one)"},
      {keys: [["Mod", "D"]], description: "Also select the next match of the selection"},
      {keys: [["Alt", "↑"], ["Alt", "↓"]], description: "Move the line up or down"},
      {keys: [["Esc"]], description: "Close the find panel, completions or a picker"},
    ],
  },
  {
    title: "Playing the animation",
    note: "Click the canvas or an empty part of the page first, so the code editor doesn't have focus.",
    shortcuts: [
      {keys: [["Space"]], description: "Play or pause"},
      {keys: [["←"], ["→"]], description: "Back or forward 0.1 seconds"},
      {keys: [[","], ["."]], description: "Back or forward one frame (1/60 second)"},
      {keys: [["0"], ["9"]], range: true, description: "Jump to 0%, 10%, … 90% of the way through"},
      {keys: [["Backspace"], ["Delete"]], description: "Delete the selected transition on the timeline"},
      {keys: [["Mod", "scroll"]], description: "Zoom the timeline in or out, around the pointer"},
      {keys: [["Esc"]], description: "Leave full screen"},
    ],
  },
];

export function combosFor(shortcut: Shortcut, mac: boolean): Combo[] {
  return mac && shortcut.mac ? shortcut.mac : shortcut.keys;
}

export function keyLabel(key: string, mac: boolean): string {
  if (key === "Mod") {
    return mac ? "⌘" : "Ctrl";
  }
  if (key === "Alt") {
    return mac ? "⌥" : "Alt";
  }
  return key;
}
