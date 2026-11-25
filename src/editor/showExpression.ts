// Showing a selected expression on the canvas: a button under a selection that could be one, Alt-Enter,
// and a mark on the expression the canvas shows, which follows it through edits.
import { Facet, Prec, StateEffect, StateField, type EditorState, type Extension } from '@codemirror/state';
import { Decoration, EditorView, keymap, showTooltip, type Tooltip } from '@codemirror/view';
import { planProbe } from '../render/probe';
import { analysisOf } from './goToDefinition';
import { nameAt, type Range } from './glslDefinitions';

// Asks to show the code from `from` to `to` on the canvas, or with null to show the image again.
export type ShowExpression = (view: EditorView, range: Range | null) => void;

const showExpressionHandler = Facet.define<ShowExpression, ShowExpression | null>({
  combine: (values) => values[0] ?? null,
});

export const setShownExpression = StateEffect.define<Range | null>();
const shownMark = Decoration.mark({ class: 'cm-shown-expression' });

export const shownExpression = StateField.define<Range | null>({
  create: () => null,
  update(range, tr) {
    for (const e of tr.effects) if (e.is(setShownExpression)) return e.value;
    if (!range || !tr.docChanged) return range;
    const from = tr.changes.mapPos(range.from, 1);
    const to = tr.changes.mapPos(range.to, -1);
    return to > from ? { from, to } : null;
  },
  provide: (f) => EditorView.decorations.from(f, (r) => r ? Decoration.set(shownMark.range(r.from, r.to)) : Decoration.none),
});

const MAX_LENGTH = 400;

// Whether the editor has focus, so a hidden tab's editor doesn't keep its button.
const setFocused = StateEffect.define<boolean>();
const focused = StateField.define<boolean>({
  create: () => false,
  update(value, tr) {
    for (const e of tr.effects) if (e.is(setFocused)) return e.value;
    return value;
  },
});

// The selection, if it could be shown and isn't already.
function showable(state: EditorState): Range | null {
  const { from, to } = state.selection.main;
  if (from === to || to - from > MAX_LENGTH || state.selection.ranges.length > 1 || !state.field(focused, false)) return null;
  const shown = state.field(shownExpression, false);
  const plan = planProbe(state.doc.toString(), from, to, analysisOf(state.doc));
  if (!plan.ok || (shown?.from === plan.from && shown.to === plan.to)) return null;
  return { from: plan.from, to: plan.to };
}

const buttonTooltip = StateField.define<Tooltip | null>({
  create: (state) => tooltipFor(state),
  update(tooltip, tr) {
    if (!tr.docChanged && !tr.selection && !tr.effects.some((e) => e.is(setShownExpression) || e.is(setFocused))) return tooltip;
    return tooltipFor(tr.state);
  },
  provide: (f) => showTooltip.from(f),
});

function tooltipFor(state: EditorState): Tooltip | null {
  const range = showable(state);
  if (!range) return null;
  return {
    pos: state.selection.main.head,
    above: false,
    create: (view) => {
      const dom = document.createElement('button');
      dom.type = 'button';
      dom.className = 'ss-show-expression';
      dom.textContent = 'Show on canvas';
      dom.title = 'Show this value on the canvas (Alt + Enter)';
      // Keeps the editor's focus and selection.
      dom.addEventListener('mousedown', (e) => e.preventDefault());
      dom.addEventListener('click', () => show(view));
      return { dom, offset: { x: 0, y: 6 } };
    },
  };
}

// Shows the selection, or the name at the cursor. Turns the view off when that's already shown, or
// there's nothing to show.
function show(view: EditorView): boolean {
  const handler = view.state.facet(showExpressionHandler);
  if (!handler) return false;
  const { from, to } = view.state.selection.main;
  const name = from === to ? nameAt(analysisOf(view.state.doc), from) : null;
  const range = from !== to ? { from, to } : name ? { from: name.from, to: name.to } : null;
  const shown = view.state.field(shownExpression, false);
  const same = range && shown && view.state.sliceDoc(range.from, range.to).trim() === view.state.sliceDoc(shown.from, shown.to) &&
    range.from <= shown.from && shown.to <= range.to;
  handler(view, same ? null : range);
  return true;
}

export function showExpressionExtension(handler: ShowExpression): Extension {
  return [
    showExpressionHandler.of(handler),
    shownExpression,
    focused,
    EditorView.focusChangeEffect.of((_, focusing) => setFocused.of(focusing)),
    buttonTooltip,
    Prec.highest(keymap.of([{ key: 'Alt-Enter', run: (view) => show(view), preventDefault: true, stopPropagation: true }])),
  ];
}
