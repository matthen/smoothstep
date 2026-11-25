// Code quoted in the app's text, coloured as in the editor.
import { useMemo } from 'react';

import { highlightLines, LAYER_NAMES, type CodeLanguage } from './highlight';

function InlineCode({ code, language }: { code: string; language: CodeLanguage }) {
  const spans = useMemo(() => highlightLines(code, language, language === 'js' ? LAYER_NAMES : undefined).flat(),
    [code, language]);
  return (
    <code className="ss-code">
      {spans.map((span, i) => span.className ? <span key={i} className={span.className}>{span.text}</span> : span.text)}
    </code>
  );
}

// A GLSL snippet, like <GlslCode>#define size iFloat0</GlslCode>.
export function GlslCode({ children }: { children: string }) {
  return <InlineCode code={children} language="glsl" />;
}

// A snippet of the Canvas2D layer's JavaScript.
export function JsCode({ children }: { children: string }) {
  return <InlineCode code={children} language="js" />;
}
