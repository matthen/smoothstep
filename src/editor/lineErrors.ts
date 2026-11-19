// Compile errors as alert widgets under their lines.
import { StateEffect, StateField, type EditorState, type Extension } from '@codemirror/state';
import { Decoration, EditorView, WidgetType, type DecorationSet } from '@codemirror/view';
import type { LineError } from '../lib/types';

class ErrorWidget extends WidgetType {
  constructor(readonly message: string) {
    super();
  }

  eq(other: ErrorWidget) {
    return other.message === this.message;
  }

  toDOM() {
    const dom = document.createElement('div');
    dom.className = 'alert alert-danger ss-line-error';
    dom.setAttribute('role', 'alert');
    dom.textContent = this.message;
    return dom;
  }
}

export const setLineErrors = StateEffect.define<LineError[]>();

export function errorDecorations(state: EditorState, errors: LineError[]): DecorationSet {
  const { doc } = state;
  const widgets = errors.map((error) => {
    const line = doc.line(Math.max(1, Math.min(doc.lines, error.line + 1)));
    return Decoration.widget({ widget: new ErrorWidget(error.message), block: true, side: 1 }).range(line.to);
  });
  return Decoration.set(widgets, true);
}

export function errorLinePos(state: EditorState, error: LineError) {
  const { doc } = state;
  return doc.line(Math.max(1, Math.min(doc.lines, error.line + 1))).from;
}

const lineErrorField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(decorations, tr) {
    for (const e of tr.effects) if (e.is(setLineErrors)) return errorDecorations(tr.state, e.value);
    return decorations.map(tr.changes);
  },
  provide: (f) => EditorView.decorations.from(f),
});

export function lineErrors(): Extension {
  return lineErrorField;
}
