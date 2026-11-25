import { javascriptLanguage } from '@codemirror/lang-javascript';
import { highlightCode } from '@lezer/highlight';
import { Fragment, useMemo } from 'react';

import { GLSL_TOKEN_CLASSES as TOKEN_CLASSES, tokenizeGlsl } from '../editor/glslLanguage';
import { jsHighlighter } from '../editor/jsHighlighter';
import { HELPER_NAMES } from '../layer/helpers';

interface Span {
  text: string;
  className: string;
}

// The layer's helpers and inputs, green as in the editor.
const LAYER_NAMES = new Set([...HELPER_NAMES, "setup", "draw", "ctx", "time", "frame", "duration", "width", "height",
  "floats", "textures", "data"]);

// Splits a run of plain JavaScript so the layer's names get the editor's colour.
function markNames(run: string): Span[] {
  return run.split(/\b([A-Za-z_]\w*)\b/).filter(Boolean)
    .map(text => ({text, className: LAYER_NAMES.has(text) ? "tok-builtin" : ""}));
}

// The code's lines, as runs of text with the editor's highlighting classes.
function highlighted(code: string, javascript: boolean): Span[][] {
  const text = code.replace(/\n$/, "");
  if (!javascript) {
    return tokenizeGlsl(text).map(line => line.map(t => ({text: t.text, className: t.type ? TOKEN_CLASSES[t.type] : ""})));
  }
  const lines: Span[][] = [[]];
  highlightCode(text, javascriptLanguage.parser.parse(text), jsHighlighter,
    (run, className) => lines[lines.length - 1]!.push(
      ...(LAYER_NAMES.has(run) ? [{text: run, className: "tok-builtin"}] : className ? [{text: run, className}] : markNames(run))),
    () => lines.push([]));
  return lines;
}

// Code coloured as in the editor: a step's code block, or a few lines quoted in its text.
export default function HighlightedCode({code, javascript, className = "learnCodeText"}: {
  code: string; javascript: boolean; className?: string;
}) {
  const lines = useMemo(() => highlighted(code, javascript), [code, javascript]);
  return (
    <pre className={className}>
      {lines.map((spans, i) =>
        <Fragment key={i}>
          {spans.map((span, j) => span.className
            ? <span key={j} className={span.className}>{span.text}</span>
            : span.text)}
          {"\n"}
        </Fragment>,
      )}
    </pre>
  );
}
