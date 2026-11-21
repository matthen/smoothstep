import { acceptCompletion, autocompletion, closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import {
  defaultKeymap, history, historyKeymap, indentMore, indentSelection, toggleComment,
} from '@codemirror/commands';
import { bracketMatching, indentOnInput, indentUnit, syntaxHighlighting } from '@codemirror/language';
import { gotoLine, openSearchPanel, replaceAll, search, searchKeymap } from '@codemirror/search';
import { EditorState, Prec, type Extension } from '@codemirror/state';
import {
  EditorView, drawSelection, highlightSpecialChars, keymap, lineNumbers, tooltips, type Command,
} from '@codemirror/view';
import { tagHighlighter, tags as t } from '@lezer/highlight';
import { glslCompletionSource } from './completion';
import { glslLanguage } from './glslLanguage';
import { lineErrors } from './lineErrors';
import { links } from './links';
import { clickHelpers } from './popups';

// Classes styled in editor.scss with the old Dracula colours.
const highlighter = tagHighlighter([
  { tag: t.keyword, class: 'tok-keyword' },
  { tag: t.typeName, class: 'tok-type' },
  { tag: t.standard(t.variableName), class: 'tok-builtin' },
  { tag: t.variableName, class: 'tok-variable' },
  { tag: t.atom, class: 'tok-atom' },
  { tag: t.number, class: 'tok-number' },
  { tag: t.comment, class: 'tok-comment' },
  { tag: t.string, class: 'tok-string' },
  { tag: t.meta, class: 'tok-meta' },
  { tag: t.operator, class: 'tok-operator' },
]);

const insertTwoSpaces: Command = (view) => {
  if (view.state.selection.ranges.some((r) => !r.empty)) return indentMore(view);
  view.dispatch(view.state.replaceSelection('  '), { scrollIntoView: true, userEvent: 'input' });
  return true;
};

export interface EditorCallbacks {
  onBuild(): void;
  onSave(): void;
}

export function editorExtensions(callbacks: EditorCallbacks): Extension {
  const build: Command = () => {
    callbacks.onBuild();
    return true;
  };
  const save: Command = () => {
    callbacks.onSave();
    return true;
  };
  return [
    Prec.highest(keymap.of([
      // Stopped here so the app's own document-level shortcuts don't fire a second time.
      { key: 'Shift-Enter', run: build, stopPropagation: true },
      { key: 'Mod-Enter', run: build, stopPropagation: true },
      { key: 'Ctrl-Enter', run: build, stopPropagation: true },
      { key: 'Mod-s', run: save, preventDefault: true, stopPropagation: true },
      { key: 'Ctrl-s', run: save, preventDefault: true, stopPropagation: true },
      { key: 'Ctrl-/', run: toggleComment },
      { key: 'Tab', run: (view) => acceptCompletion(view) || insertTwoSpaces(view) },
      { key: 'Shift-Tab', run: indentSelection },
      { key: 'Alt-g', run: gotoLine },
      { key: 'Shift-Mod-f', mac: 'Mod-Alt-f', run: openSearchPanel },
      { key: 'Shift-Mod-r', mac: 'Shift-Mod-Alt-f', run: replaceAll },
    ])),
    lineNumbers(),
    highlightSpecialChars(),
    history(),
    drawSelection(),
    indentOnInput(),
    glslLanguage,
    syntaxHighlighting(highlighter),
    bracketMatching(),
    closeBrackets(),
    autocompletion({
      override: [glslCompletionSource],
      activateOnTypingDelay: 200,
      icons: false,
    }),
    search({ top: true }),
    keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...searchKeymap, ...historyKeymap]),
    EditorView.lineWrapping,
    EditorState.tabSize.of(2),
    indentUnit.of('  '),
    tooltips({ parent: document.body }),
    clickHelpers(),
    links(),
    lineErrors(),
  ];
}
