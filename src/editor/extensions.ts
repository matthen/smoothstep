import {
  acceptCompletion, autocompletion, closeBrackets, closeBracketsKeymap, nextSnippetField, prevSnippetField,
} from '@codemirror/autocomplete';
import {
  defaultKeymap, history, historyKeymap, indentMore, indentSelection, toggleComment,
} from '@codemirror/commands';
import { bracketMatching, indentOnInput, indentUnit, syntaxHighlighting } from '@codemirror/language';
import { gotoLine, openSearchPanel, replaceAll, search, searchKeymap } from '@codemirror/search';
import { Compartment, EditorState, Prec, type Extension } from '@codemirror/state';
import {
  EditorView, drawSelection, highlightSpecialChars, keymap, lineNumbers, tooltips, type Command,
} from '@codemirror/view';
import { tagHighlighter, tags as t } from '@lezer/highlight';
import { glslCompletionSource } from './completion';
import { glslLanguage } from './glslLanguage';
import { definitionElsewhere, goToDefinitionExtension, type DefinitionElsewhere } from './goToDefinition';
import { lineErrors } from './lineErrors';
import { links } from './links';
import { minimap } from './minimap';
import { clickHelpers } from './popups';
import { codeTabs, referencesExtension, type CodeTabs } from './references';

// Classes styled in editor.scss with the old Dracula colours.
const highlighter = tagHighlighter([
  { tag: t.keyword, class: 'tok-keyword' },
  { tag: t.typeName, class: 'tok-type' },
  { tag: t.standard(t.variableName), class: 'tok-builtin' },
  { tag: t.function(t.variableName), class: 'tok-function' },
  { tag: t.local(t.variableName), class: 'tok-parameter' },
  { tag: t.macroName, class: 'tok-macro' },
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
  // After an error's button inserts the missing draw or mainImage.
  onFixed?(): void;
  // For going to a definition in another tab.
  definitionElsewhere?: DefinitionElsewhere;
  // The GLSL tabs, for finding and renaming a name's uses in all of them.
  codeTabs?: CodeTabs;
}

// What a tab's code is written in: the shader language, or JavaScript for the Canvas2D layer.
export type EditorLanguage = "glsl" | "javascript";

// JavaScript support loads when a Canvas2D tab opens, then goes into each of its editor's states.
const javascriptCompartment = new Compartment();
let javascriptSupport: Extension | null = null;

export async function loadJavaScript(view: EditorView) {
  javascriptSupport ??= (await import('./javascript')).javascriptExtensions();
  // The editor may have closed while it loaded.
  if (view.dom.isConnected && javascriptCompartment.get(view.state) !== javascriptSupport) {
    view.dispatch({effects: javascriptCompartment.reconfigure(javascriptSupport)});
  }
}

export function editorExtensions(callbacks: EditorCallbacks, language: EditorLanguage = "glsl"): Extension {
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
      { key: 'Tab', run: (view) => acceptCompletion(view) || nextSnippetField(view) || insertTwoSpaces(view) },
      { key: 'Shift-Tab', run: (view) => prevSnippetField(view) || indentSelection(view) },
      { key: 'Alt-g', run: gotoLine },
      { key: 'Shift-Mod-f', mac: 'Mod-Alt-f', run: openSearchPanel },
      { key: 'Shift-Mod-r', mac: 'Shift-Mod-Alt-f', run: replaceAll },
    ])),
    lineNumbers(),
    highlightSpecialChars(),
    history(),
    drawSelection(),
    indentOnInput(),
    // JavaScript brings its own highlighting and click helpers.
    language === "glsl" ? [
      glslLanguage, syntaxHighlighting(highlighter), clickHelpers(), goToDefinitionExtension(), referencesExtension(),
      callbacks.definitionElsewhere ? definitionElsewhere.of(callbacks.definitionElsewhere) : [],
      callbacks.codeTabs ? codeTabs.of(callbacks.codeTabs) : [],
    ] :
      javascriptCompartment.of(javascriptSupport ?? []),
    bracketMatching(),
    closeBrackets(),
    autocompletion({
      ...(language === "glsl" ? {override: [glslCompletionSource]} : {}),
      activateOnTypingDelay: 200,
      icons: false,
      optionClass: (option) => option.type === 'snippet' ? 'ss-snippet-option' : '',
    }),
    search({ top: true }),
    keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...searchKeymap, ...historyKeymap]),
    EditorView.lineWrapping,
    EditorState.tabSize.of(2),
    indentUnit.of('  '),
    tooltips({ parent: document.body }),
    links(),
    lineErrors({ onFixed: () => callbacks.onFixed?.() }),
    minimap(),
  ];
}
