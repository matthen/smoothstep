// Going to where a name is declared: Cmd-click on a Mac or Ctrl-click elsewhere, or F12 at the cursor.
// While the key is held, the name under the mouse is underlined if it can be followed.
import { Facet, StateEffect, StateField, type EditorState, type Extension, type Text } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, keymap } from '@codemirror/view';
import { isMac } from '../app/platform';
import { analyse, describe, findDefinition, nameAt, structsOf, type Analysis, type Description, type Range } from './glslDefinitions';

// A name declared in another tab: a way to go there, and how it's declared.
interface Elsewhere {
  go(): void;
  description: Description | null;
}

export type DefinitionElsewhere = (name: string) => Elsewhere | null;

export const definitionElsewhere = Facet.define<DefinitionElsewhere, DefinitionElsewhere | null>({
  combine: (values) => values[0] ?? null,
});

export const isDefinitionClick = (e: MouseEvent | KeyboardEvent) => isMac ? e.metaKey : e.ctrlKey;

// A GLSL tab: its name, its editor, and a way to show it.
export interface CodeTab {
  name: string;
  view: EditorView;
  shared: boolean;
  show(): void;
}

export type CodeTabs = () => CodeTab[];

export const codeTabs = Facet.define<CodeTabs, CodeTabs | null>({ combine: (values) => values[0] ?? null });

const analyses = new WeakMap<Text, { structs: string; analysis: Analysis }>();

// `structs` are struct types declared in the shared tab.
export function analysisOf(doc: Text, structs: readonly string[] = []): Analysis {
  const key = structs.join(' ');
  let cached = analyses.get(doc);
  if (cached?.structs !== key) analyses.set(doc, cached = { structs: key, analysis: analyse(doc.toString(), structs) });
  return cached.analysis;
}

// The analysis of a tab's code, knowing the struct types the shared tab declares.
export function tabAnalysis(state: EditorState): Analysis {
  const shared = state.facet(codeTabs)?.().find((t) => t.shared)?.view.state.doc;
  return analysisOf(state.doc, shared && shared !== state.doc ? structsOf(analysisOf(shared)) : []);
}

// The name at `pos` and where its definition is: in this code, or in another tab.
function definitionAt(state: EditorState, pos: number): { name: Range; target: Range | Elsewhere } | null {
  const analysis = tabAnalysis(state);
  const name = nameAt(analysis, pos);
  if (!name) return null;
  const target = findDefinition(analysis, pos) ?? state.facet(definitionElsewhere)?.(name.text);
  return target ? { name, target } : null;
}

// A user-declared name for the click popup: how it's declared (null for locals and parameters), and a
// way to go there (null on the declaration itself).
export interface UserDefinition {
  description: Description | null;
  go: (() => void) | null;
}

export function userDefinitionAt(view: EditorView, pos: number): UserDefinition | null {
  const analysis = tabAnalysis(view.state);
  const name = nameAt(analysis, pos);
  if (!name) return null;
  const here = findDefinition(analysis, pos);
  if (here) {
    return { description: describe(analysis, here), go: here.from === name.from ? null : () => selectDefinition(view, here) };
  }
  const elsewhere = view.state.facet(definitionElsewhere)?.(name.text);
  return elsewhere ? { description: elsewhere.description, go: elsewhere.go } : null;
}

export const goToDefinitionHint = `${isMac ? '⌘' : 'Ctrl'}-click or F12`;

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
  if ('go' in found.target) found.target.go();
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
        // Otherwise the click places the cursor, as usual.
        if (pos === null || !goToDefinition(view, pos)) return false;
        e.preventDefault();
        return true;
      },
    }),
    // Handled even with nowhere to go, so the browser doesn't open its developer tools.
    keymap.of([{ key: 'F12', preventDefault: true, run: (view) => {
      goToDefinition(view, view.state.selection.main.head);
      return true;
    } }]),
  ];
}
