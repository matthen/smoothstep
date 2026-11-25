// Find references (Shift-F12) lists every use of the name at the cursor in a panel under the code, and
// Rename (F2) changes them all, in this tab and, for a name from the shared code, in every shader tab.
import { isolateHistory } from '@codemirror/commands';
import { Facet, StateEffect, StateField, type Extension } from '@codemirror/state';
import { Decoration, EditorView, keymap, showPanel, showTooltip, type Panel, type Tooltip } from '@codemirror/view';
import { nameAt, type Range } from './glslDefinitions';
import { findReferences, isGlslWord, renameProblem, renameRefusal, targetAt, type Source, type Target } from './glslReferences';
import { analysisOf, selectDefinition } from './goToDefinition';
import { highlightedCodeElement } from './highlight';

// A GLSL tab: its name, its editor, and a way to show it.
export interface CodeTab {
  name: string;
  view: EditorView;
  shared: boolean;
  show(): void;
}

export type CodeTabs = () => CodeTab[];

export const codeTabs = Facet.define<CodeTabs, CodeTabs | null>({ combine: (values) => values[0] ?? null });

export const findReferencesHint = 'Shift-F12';
export const renameHint = 'F2';

interface Found {
  tabs: CodeTab[];
  sources: Source[];
  target: Target | null;
  // Why there's nothing to find, when there isn't.
  why: string;
}

function find(view: EditorView, pos: number): Found {
  const tabs = view.state.facet(codeTabs)?.() ?? [];
  if (!tabs.some((t) => t.view === view)) tabs.push({ name: '', view, shared: false, show() {} });
  const sources = tabs.map((t): Source => ({ id: t.name, analysis: analysisOf(t.view.state.doc), shared: t.shared }));
  const current = sources[tabs.findIndex((t) => t.view === view)]!;
  const target = targetAt(sources, current, pos);
  let why = '';
  if (!target) {
    const { tokens } = current.analysis;
    const word = tokens.find((t) => t.from <= pos && pos <= t.to && /^[A-Za-z_]\w*$/.test(t.text))?.text;
    const own = nameAt(current.analysis, pos);
    why = word && isGlslWord(word) ? `${word} is part of GLSL.` :
      own ? `${own.text} isn't declared in this code.` : 'Put the cursor on one of your own names first.';
  }
  return { tabs, sources, target, why };
}

// A short note at the cursor, gone at the next click or key.
const setMessage = StateEffect.define<{ pos: number; text: string } | null>();

const messageField = StateField.define<Tooltip | null>({
  create: () => null,
  update(tooltip, tr) {
    for (const e of tr.effects) {
      if (e.is(setMessage)) return e.value && messageTooltip(e.value.pos, e.value.text);
    }
    return tr.docChanged || (tr.selection && !tr.selection.eq(tr.startState.selection)) ? null : tooltip;
  },
  provide: (f) => showTooltip.from(f),
});

function messageTooltip(pos: number, text: string): Tooltip {
  return {
    pos, above: true,
    create: () => {
      const dom = document.createElement('div');
      dom.className = 'ss-editor-message';
      dom.textContent = text;
      return { dom };
    },
  };
}

function showMessage(view: EditorView, pos: number, text: string) {
  view.dispatch({ effects: setMessage.of({ pos, text }) });
  const close = () => {
    if (view.state.field(messageField, false)) view.dispatch({ effects: setMessage.of(null) });
    window.removeEventListener('pointerdown', close, true);
    window.removeEventListener('keydown', close, true);
  };
  window.addEventListener('pointerdown', close, true);
  window.addEventListener('keydown', close, true);
}

// The references panel.
interface Item extends Range {
  tab: CodeTab;
  line: number;
  text: string;
}

interface References {
  name: string;
  items: Item[];
  // The uses in this tab, highlighted while the panel is open.
  here: Range[];
}

const setReferences = StateEffect.define<References | null>();
const referenceMark = Decoration.mark({ class: 'cm-reference' });
const panels = new WeakMap<References, (view: EditorView) => Panel>();

const referencesField = StateField.define<References | null>({
  create: () => null,
  update(value, tr) {
    for (const e of tr.effects) if (e.is(setReferences)) return e.value;
    // An edit moves the uses, so the list would be out of date.
    return tr.docChanged ? null : value;
  },
  provide: (f) => [
    showPanel.from(f, (refs) => {
      if (!refs) return null;
      let panel = panels.get(refs);
      if (!panel) panels.set(refs, panel = (view) => referencesPanel(view, refs));
      return panel;
    }),
    EditorView.decorations.from(f, (refs) =>
      refs ? Decoration.set(refs.here.map((r) => referenceMark.range(r.from, r.to))) : Decoration.none),
  ],
});

function referencesPanel(view: EditorView, refs: References): Panel {
  const dom = document.createElement('div');
  dom.className = 'ss-references';
  dom.setAttribute('aria-label', `Uses of ${refs.name}`);
  const head = dom.appendChild(document.createElement('div'));
  head.className = 'ss-references-head';
  head.append(`${refs.items.length} ${refs.items.length === 1 ? 'use' : 'uses'} of `, highlightedCodeElement([refs.name], 'glsl'));
  const close = head.appendChild(document.createElement('button'));
  close.type = 'button';
  close.name = 'close';
  close.setAttribute('aria-label', 'Close');
  close.textContent = '×';
  close.addEventListener('click', () => {
    view.dispatch({ effects: setReferences.of(null) });
    view.focus();
  });
  const list = dom.appendChild(document.createElement('ul'));
  const showTabs = refs.items.some((i) => i.tab.view !== view);
  for (const item of refs.items) {
    const button = list.appendChild(document.createElement('li')).appendChild(document.createElement('button'));
    button.type = 'button';
    button.className = 'ss-reference';
    if (showTabs) button.appendChild(document.createElement('span')).append(item.tab.name);
    const line = button.appendChild(document.createElement('span'));
    line.className = 'ss-reference-line';
    line.textContent = String(item.line);
    button.append(highlightedCodeElement([item.text], 'glsl'));
    button.addEventListener('click', () => goTo(view, item));
  }
  return { dom, top: false };
}

function goTo(view: EditorView, item: Item) {
  const there = item.tab.view;
  if (there !== view) {
    view.dispatch({ effects: setReferences.of(null) });
    item.tab.show();
    findReferencesAt(there, item.from);
  }
  selectDefinition(there, item);
}

export function findReferencesAt(view: EditorView, pos: number): boolean {
  const { tabs, sources, target, why } = find(view, pos);
  if (!target) {
    showMessage(view, pos, why);
    return true;
  }
  const items = findReferences(target).map((r): Item => {
    const tab = tabs[sources.indexOf(r.source)]!;
    const line = tab.view.state.doc.lineAt(r.from);
    return { from: r.from, to: r.to, tab, line: line.number, text: line.text.trim() };
  });
  const here = items.filter((i) => i.tab.view === view);
  view.dispatch({ effects: [setReferences.of({ name: target.name, items, here }), setMessage.of(null)] });
  return true;
}

// Rename: an input over the name.
interface Renaming {
  pos: number;
  name: Range;
  tooltip: Tooltip;
}

const setRenaming = StateEffect.define<Renaming | null>();

const renamingField = StateField.define<Renaming | null>({
  create: () => null,
  update(value, tr) {
    for (const e of tr.effects) if (e.is(setRenaming)) return e.value;
    return tr.docChanged ? null : value;
  },
  provide: (f) => showTooltip.from(f, (r) => r?.tooltip ?? null),
});

export function startRename(view: EditorView, pos: number): boolean {
  const { target, why } = find(view, pos);
  const refusal = target ? renameRefusal(target) : why;
  if (!target || refusal) {
    showMessage(view, pos, refusal ?? why);
    return true;
  }
  const name = nameAt(analysisOf(view.state.doc), pos)!;
  const tooltip: Tooltip = { pos: name.from, above: false, create: () => renameDom(view, target.name) };
  view.dispatch({ effects: [setRenaming.of({ pos, name, tooltip }), setMessage.of(null), setReferences.of(null)] });
  return true;
}

function renameDom(view: EditorView, name: string) {
  const dom = document.createElement('div');
  dom.className = 'ss-rename';
  const input = dom.appendChild(document.createElement('input'));
  input.value = name;
  input.spellcheck = false;
  input.autocomplete = 'off';
  input.setAttribute('aria-label', `New name for ${name}`);
  input.size = Math.max(12, name.length + 4);
  const error = dom.appendChild(document.createElement('div'));
  error.className = 'ss-rename-error';
  const cancel = () => {
    if (view.state.field(renamingField)) view.dispatch({ effects: setRenaming.of(null) });
  };
  input.addEventListener('keydown', (e) => {
    // Kept from the app's own shortcuts.
    e.stopPropagation();
    if (e.key === 'Enter') {
      e.preventDefault();
      const problem = applyRename(view, input.value.trim());
      error.textContent = problem ?? '';
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancel();
      view.focus();
    }
  });
  input.addEventListener('input', () => {
    error.textContent = '';
  });
  input.addEventListener('blur', cancel);
  return {
    dom,
    offset: { x: -4, y: -22 },
    mount() {
      input.focus();
      input.select();
    },
  };
}

// Renames every use, as one undo step in each tab, or says why it can't.
function applyRename(view: EditorView, newName: string): string | null {
  const renaming = view.state.field(renamingField);
  if (!renaming) return null;
  const { tabs, sources, target } = find(view, renaming.pos);
  if (!target) return null;
  const problem = renameProblem(target, newName, sources);
  if (problem) return problem;
  const references = findReferences(target);
  view.dispatch({ effects: setRenaming.of(null) });
  if (newName !== target.name) {
    for (const [i, source] of sources.entries()) {
      const changes = references.filter((r) => r.source === source).map((r) => ({ from: r.from, to: r.to, insert: newName }));
      if (changes.length === 0) continue;
      const tabView = tabs[i]!.view;
      const changeSet = tabView.state.changes(changes);
      tabView.dispatch({
        changes: changeSet,
        ...tabView === view ? { selection: { anchor: changeSet.mapPos(renaming.name.to, 1) } } : {},
        userEvent: 'rename',
        annotations: isolateHistory.of('full'),
      });
    }
  }
  view.focus();
  return null;
}

export function referencesExtension(): Extension {
  return [
    messageField,
    referencesField,
    renamingField,
    keymap.of([
      { key: 'Shift-F12', preventDefault: true, run: (view) => findReferencesAt(view, view.state.selection.main.head) },
      { key: 'F2', preventDefault: true, run: (view) => startRename(view, view.state.selection.main.head) },
      { key: 'Escape', run: (view) => {
        if (!view.state.field(referencesField)) return false;
        view.dispatch({ effects: setReferences.of(null) });
        return true;
      } },
    ]),
  ];
}
