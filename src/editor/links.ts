// Web addresses and menu paths like "Help → Tutorial" in the code, underlined and opened with a click.
import type { Extension } from '@codemirror/state';
import { Decoration, EditorView, MatchDecorator, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view';

import { MENU_PATHS, openMenuItem, type MenuPath } from '../lib/menuLinks';

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Longest first, so "File → Open from link" wins over "File → Open". A URL stops before closing punctuation.
const LINK = new RegExp(
  `https?://[^\\s"'<>()]*[^\\s"'<>().,;:!?]|` +
  [...MENU_PATHS].sort((a, b) => b.length - a.length).map(escape).join('|'),
  'g',
);

export interface Link {
  from: number;
  to: number;
  text: string;
}

// The links in a line of text, with offsets into it.
export function linksIn(text: string): Link[] {
  return [...text.matchAll(LINK)].map((m) => ({ from: m.index, to: m.index + m[0].length, text: m[0] }));
}

function open(text: string) {
  if (text.startsWith('http')) {
    window.open(text, '_blank', 'noopener');
  } else {
    openMenuItem(text as MenuPath);
  }
}

const decorator = new MatchDecorator({
  regexp: LINK,
  decoration: (m) => Decoration.mark({
    class: 'cm-link',
    attributes: { title: m[0].startsWith('http') ? 'Open in a new tab' : 'Open ' + m[0] },
  }),
});

const linkPlugin = ViewPlugin.fromClass(class {
  decorations: DecorationSet;
  constructor(view: EditorView) {
    this.decorations = decorator.createDeco(view);
  }
  update(update: ViewUpdate) {
    this.decorations = decorator.updateDeco(update, this.decorations);
  }
}, { decorations: (v) => v.decorations });

export function links(): Extension {
  return [
    linkPlugin,
    EditorView.domEventHandlers({
      click: (e, view) => {
        const pos = view.posAtCoords({ x: e.clientX, y: e.clientY });
        const sel = view.state.selection.main;
        // Not when the click ends a drag to select some text.
        if (pos === null || e.button !== 0 || (!sel.empty && pos >= sel.from && pos <= sel.to)) return false;
        const line = view.state.doc.lineAt(pos);
        const link = linksIn(line.text).find((l) => line.from + l.from <= pos && pos < line.from + l.to);
        if (link) open(link.text);
        return false;
      },
    }),
  ];
}
