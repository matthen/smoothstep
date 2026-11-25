// Going to where a name is declared: Cmd-click on a Mac or Ctrl-click elsewhere, or F12 at the cursor.
// While the key is held, the name under the mouse is underlined if it can be followed.
import { Facet, StateEffect, StateField, type EditorState, type Extension, type Text } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, keymap } from '@codemirror/view';
import { isMac } from '../app/platform';
import { analyse, findDefinition, nameAt, type Analysis, type Range } from './glslDefinitions';

// Finds a name declared in another tab, giving a way to go there.
export type DefinitionElsewhere = (name: string) => (() => void) | null;

export const definitionElsewhere = Facet.define<DefinitionElsewhere, DefinitionElsewhere | null>({
  combine: (values) => values[0] ?? null,
});

export const isDefinitionClick = (e: MouseEvent | KeyboardEvent) => isMac ? e.metaKey : e.ctrlKey;

const analyses = new WeakMap<Text, Analysis>();

export function analysisOf(doc: Text): Analysis {
  let analysis = analyses.get(doc);
  if (!analysis) analyses.set(doc, analysis = analyse(doc.toString()));
  return analysis;
}

// The name at `pos` and where its definition is: in this code, or a way to go to another tab.
function definitionAt(state: EditorState, pos: number): { name: Range; target: Range | (() => void) } | null {
  const analysis = analysisOf(state.doc);
  const name = nameAt(analysis, pos);
  if (!name) return null;
  const target = findDefinition(analysis, pos) ?? state.facet(definitionElsewhere)?.(name.text);
  return target ? { name, target } : null;
}

export function selectDefinition(view: EditorView, range: Range) {
  view.dispatch({
    selection: { anchor: range.from, head: range.to },
    effects: EditorView.scrollIntoView(range.from, { y: 'center' }),
    userEvent: 'select.definition',
  });
  view.focus();
}

function goToDefinition(view: EditorView, pos: number): boolean {
  const found = definitionAt(view.state, pos);
  if (!found) return false;
  if (typeof found.target === 'function') found.target();
  else selectDefinition(view, found.target);
  return true;
}

const setLink = StateEffect.define<Range | null>();
const linkMark = Decoration.mark({ class: 'cm-definition-link' });

const linkField = StateField.define<Range | null>({
  create: () => null,
  update(link, tr) {
    for (const e of tr.effects) if (e.is(setLink)) return e.value;
    return tr.docChanged ? null : link;
  },
  provide: (f) => EditorView.decorations.from(f, (link) => link ? Decoration.set(linkMark.range(link.from, link.to)) : Decoration.none),
});

// Underlines the name under the mouse while the key is held.
const hoverPlugin = ViewPlugin.define((view) => {
  let mouse: { x: number; y: number } | null = null;
  const show = (held: boolean) => {
    const pos = held && mouse ? view.posAtCoords(mouse) : null;
    const link = pos === null ? null : definitionAt(view.state, pos)?.name ?? null;
    const current = view.state.field(linkField);
    if (link?.from !== current?.from || link?.to !== current?.to) view.dispatch({ effects: setLink.of(link) });
  };
  const onMove = (e: MouseEvent) => {
    mouse = { x: e.clientX, y: e.clientY };
    show(isDefinitionClick(e));
  };
  const onLeave = () => {
    mouse = null;
    show(false);
  };
  const onKey = (e: KeyboardEvent) => {
    if (mouse) show(isDefinitionClick(e));
  };
  const onBlur = () => show(false);
  view.dom.addEventListener('mousemove', onMove);
  view.dom.addEventListener('mouseleave', onLeave);
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKey);
  window.addEventListener('blur', onBlur);
  return {
    destroy() {
      view.dom.removeEventListener('mousemove', onMove);
      view.dom.removeEventListener('mouseleave', onLeave);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
      window.removeEventListener('blur', onBlur);
    },
  };
});

export function goToDefinitionExtension(): Extension {
  return [
    linkField,
    hoverPlugin,
    EditorView.domEventHandlers({
      mousedown: (e, view) => {
        if (e.button !== 0 || !isDefinitionClick(e)) return false;
        const pos = view.posAtCoords({ x: e.clientX, y: e.clientY });
        // Otherwise the click adds a cursor, as usual.
        if (pos === null || !goToDefinition(view, pos)) return false;
        e.preventDefault();
        return true;
      },
    }),
    keymap.of([{ key: 'F12', run: (view) => goToDefinition(view, view.state.selection.main.head) }]),
  ];
}
