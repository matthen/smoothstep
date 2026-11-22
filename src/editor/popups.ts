// Click helpers: inline pickers on values, definitions of built-ins, and underlining every use of a clicked variable.
import { syntaxTree } from '@codemirror/language';
import { Annotation, StateEffect, StateField, type EditorState, type Extension } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, showTooltip, type DecorationSet, type Tooltip } from '@codemirror/view';
import glslFunctions from './glslFunctions.json';
import {
  createColorPicker, createDirectionPicker, createFloatPicker, createVec2Picker, type PickerWidget,
} from './pickers';
import { findPickerMatch, formatFloat, formatVec, parseVec, type PickerKind } from './pickerValues';

// Marks transactions made by dragging a picker.
export const pickerEdit = Annotation.define<boolean>();

interface Definition {
  functionName: string;
  oneLiner: string;
  signatures: string[];
  helpUrl?: string;
}
const definitions = new Map((glslFunctions as Definition[]).map((d) => [d.functionName, d]));

interface Popup {
  from: number;
  to: number;
  anchor: number; // the clicked offset into the value, where the tooltip points
  tooltip: Tooltip;
}

const setPopup = StateEffect.define<Popup | null>();
const resizeValue = StateEffect.define<number>();

const popupField = StateField.define<Popup | null>({
  create: () => null,
  update(popup, tr) {
    for (const e of tr.effects) if (e.is(setPopup)) return e.value;
    if (!popup) return null;
    let { from, to } = popup;
    const resized = tr.effects.find((e) => e.is(resizeValue));
    if (resized) to = from + resized.value;
    else if (tr.docChanged) {
      from = tr.changes.mapPos(from, 1);
      to = Math.max(from, tr.changes.mapPos(to, -1));
    }
    if (from === popup.from && to === popup.to) return popup;
    // Keeping the tooltip's `create` keeps its DOM, so a picker being dragged survives the edits it makes.
    return { ...popup, from, to, tooltip: { ...popup.tooltip, pos: from + Math.min(popup.anchor, to - from) } };
  },
  provide: (f) => showTooltip.from(f, (p) => p?.tooltip ?? null),
});

const close = (view: EditorView) => {
  if (view.state.field(popupField)) view.dispatch({ effects: setPopup.of(null) });
};

function replaceValue(view: EditorView, text: string) {
  const popup = view.state.field(popupField);
  if (!popup) return;
  view.dispatch({
    changes: { from: popup.from, to: popup.to, insert: text },
    selection: { anchor: popup.from },
    effects: resizeValue.of(text.length),
    annotations: pickerEdit.of(true),
    // Typing-style events join into one undo step.
    userEvent: 'input.type.picker',
  });
}

function pickerWidget(view: EditorView, kind: PickerKind, text: string): PickerWidget {
  const values = parseVec(text) ?? [];
  const update = (t: string) => replaceValue(view, t);
  switch (kind) {
    case 'float':
      return createFloatPicker(parseFloat(text), (v) => update(formatFloat(v)));
    case 'vec2':
      return createVec2Picker(values, (v) => update(formatVec(v)));
    case 'direction':
      return createDirectionPicker(values, (v) => update(formatVec(v)));
    case 'color':
      return createColorPicker(values, (v) => update(formatVec(v)), (rgb) => {
        const popup = view.state.field(popupField);
        if (popup) openPicker(view, popup.from, popup.to, 'direction', formatVec(rgb), popup.anchor);
      });
  }
}

// CodeMirror sizes the tooltip element itself, so popups sit inside a wrapper.
function popupDom(content: HTMLElement) {
  const dom = document.createElement('div');
  dom.className = 'ss-popup';
  dom.appendChild(content);
  return dom;
}

function openPicker(view: EditorView, from: number, to: number, kind: PickerKind, text: string, anchor: number) {
  const create = () => {
    const widget = pickerWidget(view, kind, text);
    return { dom: popupDom(widget.dom), offset: { x: -widget.width / 2, y: 8 }, destroy: widget.destroy };
  };
  const tooltip = { pos: from + anchor, above: false, create };
  view.dispatch({ effects: setPopup.of({ from, to, anchor, tooltip }) });
}

function definitionDom(def: Definition) {
  const dom = document.createElement('div');
  dom.className = 'ss-definition';
  const p = dom.appendChild(document.createElement('p'));
  p.className = 'oneLiner';
  p.append(def.oneLiner);
  if (def.helpUrl) {
    const a = document.createElement('a');
    a.href = def.helpUrl;
    a.target = '_blank';
    a.rel = 'noreferrer';
    a.title = `Help for ${def.functionName}`;
    a.textContent = 'More';
    p.append(' ', a, '.');
  }
  const code = dom.appendChild(document.createElement('code'));
  def.signatures.forEach((sig, i) => {
    if (i) code.append(document.createElement('br'));
    code.append(sig);
  });
  return dom;
}

function nodeNameAt(state: EditorState, pos: number) {
  return syntaxTree(state).resolveInner(pos, 1).name;
}

// Underlines every whole-word use of the clicked variable until the next click.
const setIlluminated = StateEffect.define<string | null>();
const illuminatedMark = Decoration.mark({ class: 'cm-searching' });

const illuminateField = StateField.define<{ word: string | null; decorations: DecorationSet }>({
  create: () => ({ word: null, decorations: Decoration.none }),
  update(value, tr) {
    let { word } = value;
    for (const e of tr.effects) if (e.is(setIlluminated)) word = e.value;
    if (word === value.word && !tr.docChanged) return value;
    if (!word) return { word, decorations: Decoration.none };
    const re = new RegExp(`\\b${word.replace(/\$/g, '\\$')}(?![\\w$])`, 'g');
    const text = tr.state.doc.toString();
    const ranges = [...text.matchAll(re)].map((m) => illuminatedMark.range(m.index, m.index + word.length));
    return { word, decorations: Decoration.set(ranges) };
  },
  provide: (f) => EditorView.decorations.from(f, (v) => v.decorations),
});

// `pos` comes from the click's coordinates: on touch devices the selection catches up later.
function onClick(view: EditorView, pos: number, touch: boolean) {
  const { state } = view;
  const wasOpen = state.field(popupField) !== null;
  const sel = state.selection.main;
  const selecting = !sel.empty && pos >= sel.from && pos <= sel.to;
  const line = state.doc.lineAt(pos);
  const match = selecting ? null : findPickerMatch(line.text, pos - line.from);
  const usable = match && nodeNameAt(state, line.from + match.from) !== 'comment';
  view.dispatch({ effects: [setIlluminated.of(null), setPopup.of(null)] });
  if (selecting || (wasOpen && usable)) return;
  if (match && usable) {
    openPicker(view, line.from + match.from, line.from + match.to, match.kind, match.text, pos - line.from - match.from);
    // On a touch screen the keyboard would cover the picker.
    if (touch) view.contentDOM.blur();
    return;
  }
  const word = state.wordAt(pos);
  if (!word) return;
  const name = state.sliceDoc(word.from, word.to);
  const node = nodeNameAt(state, word.from);
  const def = definitions.get(name);
  if (def && node === 'variableName.standard') {
    const create = () => ({ dom: popupDom(definitionDom(def)), offset: { x: 0, y: 8 } });
    const tooltip: Tooltip = { pos: word.from, above: false, create };
    view.dispatch({ effects: setPopup.of({ from: word.from, to: word.to, anchor: 0, tooltip }) });
  } else if (node === 'variableName' && name.length > 1) {
    view.dispatch({ effects: setIlluminated.of(name) });
  }
}

// Any key, or a press outside the popup and the editor text, closes the popup.
const dismissPlugin = ViewPlugin.define((view) => {
  const onKey = () => close(view);
  const onPointer = (e: PointerEvent) => {
    const target = e.target as Node;
    if (view.contentDOM.contains(target)) return;
    if (target instanceof Element && target.closest('.cm-tooltip')) return;
    close(view);
  };
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('pointerdown', onPointer, true);
  return {
    destroy() {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('pointerdown', onPointer, true);
    },
  };
});

export function clickHelpers(): Extension {
  // Older Safari's click events aren't PointerEvents, so remember the press's pointer type.
  let pointerType = 'mouse';
  return [
    popupField,
    illuminateField,
    dismissPlugin,
    EditorView.domEventHandlers({
      pointerdown: (e) => {
        pointerType = e.pointerType;
        return false;
      },
      click: (e, view) => {
        const pos = view.posAtCoords({ x: e.clientX, y: e.clientY });
        if (pos !== null) onClick(view, pos, pointerType !== 'mouse');
        return false;
      },
    }),
  ];
}
