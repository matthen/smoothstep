// Links in code comments: web addresses, and places in the app named in square brackets, like
// "[Help → Tutorial]" or "the [Sliders] tab". Underlined, and opened with a click.
import { syntaxTree } from '@codemirror/language';
import type { EditorState, Extension } from '@codemirror/state';
import { Decoration, EditorView, MatchDecorator, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view';

import { APP_LINKS, openAppLink, type AppLink } from '../lib/appLinks';

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// A URL stops before closing punctuation. Only the app's own places count in brackets.
const LINK = new RegExp(
  `https?://[^\\s"'<>()\\[\\]]*[^\\s"'<>()\\[\\].,;:!?]|\\[(${APP_LINKS.map(escape).join('|')})\\]`,
  'g',
);

export interface Link {
  from: number;  // the whole match, brackets included
  to: number;
  // A web address, or a place in the app.
  target: string;
}

// The links in a line of text, with offsets into it.
export function linksIn(text: string): Link[] {
  return [...text.matchAll(LINK)].map((m) => ({ from: m.index, to: m.index + m[0].length, target: m[1] ?? m[0] }));
}

// The shader language calls the node "comment"; JavaScript has "LineComment" and "BlockComment".
const inComment = (state: EditorState, pos: number) => /comment$/i.test(syntaxTree(state).resolveInner(pos, 1).name);

function open(target: string) {
  if (target.startsWith('http')) {
    window.open(target, '_blank', 'noopener');
  } else {
    openAppLink(target as AppLink);
  }
}

const bracket = Decoration.mark({ class: 'cm-link-bracket' });

const decorator = new MatchDecorator({
  regexp: LINK,
  decorate: (add, from, to, match, view) => {
    if (!inComment(view.state, from)) return;
    const name = match[1];
    const mark = Decoration.mark({
      class: 'cm-link',
      attributes: { title: name ? 'Open ' + name : 'Open in a new tab' },
    });
    if (name) {
      add(from, from + 1, bracket);
      add(from + 1, to - 1, mark);
      add(to - 1, to, bracket);
    } else {
      add(from, to, mark);
    }
  },
});

const linkPlugin = ViewPlugin.fromClass(class {
  decorations: DecorationSet;
  constructor(view: EditorView) {
    this.decorations = decorator.createDeco(view);
  }
  update(update: ViewUpdate) {
    // The syntax tree can finish parsing after the text changes, so comments may only show up later.
    this.decorations = syntaxTree(update.startState) !== syntaxTree(update.state)
      ? decorator.createDeco(update.view)
      : decorator.updateDeco(update, this.decorations);
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
        if (link && inComment(view.state, line.from + link.from)) open(link.target);
        return false;
      },
    }),
  ];
}
