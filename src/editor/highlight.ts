// Code coloured as in the editor, outside it: runs of text with the editor's `tok-*` classes, for code
// blocks and for code quoted in the app's text, the tutorial, popups and the docs.
import { highlightCode } from '@lezer/highlight';

import { HELPER_NAMES } from '../layer/helpers.ts';
import { GLSL_TOKEN_CLASSES, tokenizeGlsl } from './glslLanguage.ts';
import { jsHighlighter } from './jsHighlighter.ts';

export interface CodeSpan {
  text: string;
  // A `tok-*` class, or "" for text in the code's plain colour.
  className: string;
}

export type CodeLanguage = 'glsl' | 'js';

// The Canvas2D layer's helpers and inputs, green as the Canvas2D tab marks them.
export const LAYER_NAMES: ReadonlySet<string> = new Set([...HELPER_NAMES, 'setup', 'draw', 'ctx', 'time', 'frame',
  'duration', 'width', 'height', 'floats', 'textures', 'data']);

// Splits a run of plain JavaScript so the layer's names get their colour.
function markNames(run: string, names: ReadonlySet<string>): CodeSpan[] {
  return run.split(/\b([A-Za-z_]\w*)\b/).filter(Boolean)
    .map((text) => ({ text, className: names.has(text) ? 'tok-builtin' : '' }));
}

type JsParser = typeof import('@lezer/javascript').parser;
let jsParser: JsParser | null = null;
let jsLoading: Promise<void> | null = null;
const jsListeners = new Set<() => void>();

// The JavaScript parser loads with the first Canvas2D tab or snippet, so it stays out of the app's startup.
export function setJsParser(parser: JsParser) {
  jsParser = parser;
  jsListeners.forEach((listener) => listener());
}

export function loadJsHighlighting(): Promise<void> {
  // A failed load, say offline after a deploy, is forgotten so a later call tries again.
  jsLoading ??= import('@lezer/javascript').then(({ parser }) => setJsParser(parser), (error: unknown) => {
    jsLoading = null;
    throw error;
  });
  return jsLoading;
}

export const jsHighlightingReady = () => jsParser !== null;

export function onJsHighlightingReady(listener: () => void): () => void {
  jsListeners.add(listener);
  return () => jsListeners.delete(listener);
}

// The code's lines as coloured runs. JavaScript can also mark `names`, such as LAYER_NAMES, as built-ins;
// until its parser has loaded, only those are coloured.
export function highlightLines(code: string, language: CodeLanguage, names?: ReadonlySet<string>): CodeSpan[][] {
  if (language === 'glsl') {
    return tokenizeGlsl(code).map((line) =>
      line.map((t) => ({ text: t.text, className: t.type ? GLSL_TOKEN_CLASSES[t.type] : '' })));
  }
  if (!jsParser) {
    return code.split('\n').map((line) => names ? markNames(line, names) : line ? [{ text: line, className: '' }] : []);
  }
  const lines: CodeSpan[][] = [[]];
  highlightCode(code, jsParser.parse(code), jsHighlighter, (run, className) => {
    const line = lines[lines.length - 1]!;
    if (names?.has(run)) line.push({ text: run, className: 'tok-builtin' });
    else if (className || !names) line.push({ text: run, className });
    else line.push(...markNames(run, names));
  }, () => lines.push([]));
  return lines;
}

const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// The highlighted code as HTML, for inside a <code>.
export function highlightHtml(code: string, language: CodeLanguage, names?: ReadonlySet<string>): string {
  return highlightLines(code, language, names).map((line) => line.map(({ text, className }) =>
    className ? `<span class="${className}">${escapeHtml(text)}</span>` : escapeHtml(text)).join('')).join('\n');
}

// A GLSL snippet as an inline <code class="ss-code">, in HTML.
export const glslCodeHtml = (code: string) => `<code class="ss-code">${highlightHtml(code, 'glsl')}</code>`;

// Short snippets as an inline <code class="ss-code">, for the DOM, with a line break between them.
export function highlightedCodeElement(lines: readonly string[], language: CodeLanguage): HTMLElement {
  const el = document.createElement('code');
  el.className = 'ss-code';
  const names = language === 'js' ? LAYER_NAMES : undefined;
  el.innerHTML = lines.map((line) => highlightHtml(line, language, names)).join('<br>');
  return el;
}

const GLSL_ONLY = new Set(['typeName', 'variableName.standard', 'macroName']);
const DIRECTIVE = /^#\s*(define|undef|if|ifdef|ifndef|else|elif|endif|version|extension|pragma|line|error)\b/;

// Whether an inline snippet in the docs is shader code: it names a GLSL type, built-in or directive, and
// has nothing only JavaScript, file names or links have. Those stay as they are.
export function looksLikeGlsl(code: string): boolean {
  if (/["'{}`[\]]|=>|\b(new|import|any)\b|\.(glsl|js|json|md|html)\b/.test(code)) return false;
  const tokens = tokenizeGlsl(code).flat();
  return tokens.some((t, i) => tokens[i - 1]?.text !== '.' &&
    (t.type === 'meta' ? DIRECTIVE.test(t.text) : t.type !== null && GLSL_ONLY.has(t.type)));
}
