// Compile errors as alert widgets under their lines. An error about a missing draw or mainImage
// shows the function to add, with a button that adds it.
import { Facet, StateEffect, StateField, type EditorState, type Extension } from '@codemirror/state';
import { Decoration, EditorView, WidgetType, type DecorationSet } from '@codemirror/view';
import { DOC_SECTIONS, docLinkElement } from '../lib/docLinks';
import type { LineError } from '../lib/types';

// The function this tab's code must have, to insert when it's missing.
export const missingSkeleton = Facet.define<string, string | null>({combine: (values) => values[0] ?? null});

export interface LineErrorCallbacks {
  // After the missing function is inserted, so the code can build with it.
  onFixed?(): void;
}

// Adds `code` after everything else, a blank line below the last, and puts the cursor at its start.
function insertSkeleton(view: EditorView, code: string) {
  const text = view.state.doc.toString();
  const gap = text.trim() === "" ? "" : text.endsWith("\n\n") ? "" : text.endsWith("\n") ? "\n" : "\n\n";
  const from = text.trim() === "" ? 0 : text.length;
  const at = from + gap.length;
  view.dispatch({
    changes: {from, to: text.length, insert: gap + code + "\n"},
    selection: {anchor: at},
    effects: [setLineErrors.of([]), EditorView.scrollIntoView(at, {y: 'nearest', yMargin: 48})],
    userEvent: 'input.skeleton',
  });
}

class ErrorWidget extends WidgetType {
  constructor(readonly error: LineError, readonly skeleton: string | null, readonly callbacks: LineErrorCallbacks) {
    super();
  }

  eq(other: ErrorWidget) {
    return other.error.message === this.error.message && other.error.missing === this.error.missing &&
      other.skeleton === this.skeleton;
  }

  toDOM(view: EditorView) {
    const dom = document.createElement('div');
    dom.className = 'alert alert-danger ss-line-error';
    dom.setAttribute('role', 'alert');
    dom.append(this.error.message);
    const {missing} = this.error;
    if (missing && this.skeleton) {
      const skeleton = this.skeleton;
      const code = dom.appendChild(document.createElement('pre'));
      code.className = 'ss-line-error-code';
      code.textContent = skeleton;
      const button = dom.appendChild(document.createElement('button'));
      button.type = 'button';
      button.className = 'ss-line-error-fix';
      button.textContent = `Insert a ${missing} function`;
      button.addEventListener('click', () => {
        insertSkeleton(view, skeleton);
        this.callbacks.onFixed?.();
      });
      const docs = missing === 'draw' ? docLinkElement('How draw works', DOC_SECTIONS.setupAndDraw) :
        docLinkElement('How mainImage works', DOC_SECTIONS.shaders);
      dom.append(' ', docs);
    }
    return dom;
  }
}

export const setLineErrors = StateEffect.define<LineError[]>();

function errorDecorations(state: EditorState, errors: LineError[], callbacks: LineErrorCallbacks): DecorationSet {
  const { doc } = state;
  const skeleton = state.facet(missingSkeleton);
  const widgets = errors.map((error) => {
    const line = doc.line(Math.max(1, Math.min(doc.lines, error.line + 1)));
    const widget = new ErrorWidget(error, skeleton, callbacks);
    return Decoration.widget({ widget, block: true, side: 1 }).range(line.to);
  });
  return Decoration.set(widgets, true);
}

export function errorLinePos(state: EditorState, error: LineError) {
  const { doc } = state;
  return doc.line(Math.max(1, Math.min(doc.lines, error.line + 1))).from;
}

export function lineErrors(callbacks: LineErrorCallbacks = {}): Extension {
  return StateField.define<DecorationSet>({
    create: () => Decoration.none,
    update(decorations, tr) {
      for (const e of tr.effects) if (e.is(setLineErrors)) return errorDecorations(tr.state, e.value, callbacks);
      return decorations.map(tr.changes);
    },
    provide: (f) => EditorView.decorations.from(f),
  });
}
