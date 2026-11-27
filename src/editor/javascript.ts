// JavaScript for the Canvas2D tab's editor: highlighting, hints, definitions and pickers for the
// layer's helpers and inputs. Loaded when a Canvas2D tab first opens.
import { completeFromList, ifNotIn } from '@codemirror/autocomplete';
import { javascript, javascriptLanguage, localCompletionSource } from '@codemirror/lang-javascript';
import { syntaxHighlighting, syntaxTree } from '@codemirror/language';
import type { EditorState, Extension } from '@codemirror/state';
import { Decoration, ViewPlugin, type DecorationSet, type EditorView, type ViewUpdate } from '@codemirror/view';

import { DOC_SECTIONS, type DocTarget } from '../lib/docLinks';
import { CANVAS2D_REFERENCE, type Canvas2DEntry } from './canvas2dReference';
import { loadJsHighlighting } from './highlight';
import { jsHighlighter } from './jsHighlighter';
import { clickHelpers, type ClickConfig, type Definition } from './popups';
import { findJsPickerMatch } from './pickerValues';
import { canvas2dSnippetCompletions } from './snippets';

// So the definition popups colour their JavaScript.
void loadJsHighlighting();

const MDN = 'https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/';
// The section of the docs about each of the layer's own names; the context's members have MDN's.
const NAMED_DOCS: Record<string, DocTarget> = {
  ctx: DOC_SECTIONS.canvasUnits, drawList: DOC_SECTIONS.drawList, clear: DOC_SECTIONS.clearing,
  seededRandom: DOC_SECTIONS.otherHelpers,
};
const docsFor = (e: Canvas2DEntry): DocTarget | undefined => NAMED_DOCS[e.name] ??
  (e.kind === 'helper' ? DOC_SECTIONS.commands : e.kind === 'ctx' ? undefined : DOC_SECTIONS.setupAndDraw);
const definition = (e: Canvas2DEntry): Definition => ({
  functionName: e.name,
  oneLiner: e.oneLiner,
  signatures: e.signatures,
  helpUrl: e.helpUrl ?? (e.kind === 'ctx' ? MDN + e.name : undefined),
  docs: docsFor(e),
});
// The layer's own names, and the members of `ctx`, which only count after `ctx.` or in Set({...}).
const named = new Map(CANVAS2D_REFERENCE.filter((e) => e.kind !== 'ctx').map((e) => [e.name, definition(e)]));
const members = new Map(CANVAS2D_REFERENCE.filter((e) => e.kind === 'ctx').map((e) => [e.name, definition(e)]));
const isProperty = (d: Definition) => d.signatures.some((s) => s.includes(' = '));

const VARIABLES = new Set(['VariableName', 'VariableDefinition']);
type SyntaxNode = ReturnType<ReturnType<typeof syntaxTree>['resolveInner']>;

// The member of `ctx` a property name is, as in `ctx.fillRect` or `Set({fillStyle: ...})`.
function contextMember(state: EditorState, node: SyntaxNode): Definition | null {
  const name = state.sliceDoc(node.from, node.to);
  const member = members.get(name);
  if (!member) return null;
  if (node.name === 'PropertyName' && node.parent?.name === 'MemberExpression') {
    const object = node.parent.firstChild;
    return object && state.sliceDoc(object.from, object.to) === 'ctx' ? member : null;
  }
  return node.name === 'PropertyDefinition' && isProperty(member) ? member : null;
}

function layerName(state: EditorState, node: SyntaxNode): Definition | null {
  const name = state.sliceDoc(node.from, node.to);
  // `{frame: f}` in draw's parameters names an input too.
  const known = VARIABLES.has(node.name) || (node.name === 'PropertyName' && node.parent?.name === 'PatternProperty');
  return known ? named.get(name) ?? null : null;
}

// The ranges in from..to that are the layer's helpers, inputs, setup, draw or ctx.
export function canvas2dNames(state: EditorState, from = 0, to = state.doc.length): { from: number; to: number }[] {
  const out: { from: number; to: number }[] = [];
  syntaxTree(state).iterate({
    from, to,
    enter: (ref) => {
      if (layerName(state, ref.node)) out.push({ from: ref.from, to: ref.to });
    },
  });
  return out;
}

const builtinMark = Decoration.mark({ class: 'tok-builtin' });

const namesPlugin = ViewPlugin.fromClass(class {
  decorations: DecorationSet;
  constructor(view: EditorView) {
    this.decorations = this.build(view);
  }
  update(update: ViewUpdate) {
    if (update.docChanged || update.viewportChanged || syntaxTree(update.startState) !== syntaxTree(update.state)) {
      this.decorations = this.build(update.view);
    }
  }
  build(view: EditorView) {
    const ranges = view.visibleRanges.flatMap((r) => canvas2dNames(view.state, r.from, r.to));
    return Decoration.set(ranges.map((r) => builtinMark.range(r.from, r.to)), true);
  }
}, { decorations: (v) => v.decorations });

const STRINGS = new Set(['String', 'TemplateString']);

export const javascriptClicks: ClickConfig = {
  language: 'js',
  pickerAt(state, line, ch) {
    const match = findJsPickerMatch(line.text, ch);
    if (!match) return null;
    const node = syntaxTree(state).resolveInner(line.from + match.to - 1, 1).name;
    return (match.kind === 'cssColor' ? STRINGS.has(node) : node === 'Number') ? match : null;
  },
  definitionAt(state, from) {
    const node = syntaxTree(state).resolveInner(from, 1);
    return layerName(state, node) ?? contextMember(state, node);
  },
  illuminates: (state, from) => VARIABLES.has(syntaxTree(state).resolveInner(from, 1).name),
};

const hints = completeFromList(CANVAS2D_REFERENCE.filter((e) => e.kind !== 'ctx').map((e) => ({
  label: e.name,
  type: e.kind === 'input' ? 'variable' : 'function',
  detail: e.kind === 'helper' ? e.signatures[0]!.slice(e.name.length) : e.type,
})));

const NOT_IN = ['String', 'TemplateString', 'LineComment', 'BlockComment'];
const snippets = ifNotIn(NOT_IN, completeFromList(canvas2dSnippetCompletions()));

export function javascriptExtensions(): Extension {
  return [
    javascript(),
    javascriptLanguage.data.of({ autocomplete: localCompletionSource }),
    javascriptLanguage.data.of({ autocomplete: hints }),
    javascriptLanguage.data.of({ autocomplete: snippets }),
    syntaxHighlighting(jsHighlighter),
    namesPlugin,
    clickHelpers(javascriptClicks),
  ];
}
