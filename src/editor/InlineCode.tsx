// Code quoted in the app's text, coloured as in the editor.
import { useEffect, useMemo, useSyncExternalStore } from 'react';

import {
  highlightLines, jsHighlightingReady, LAYER_NAMES, loadJsHighlighting, onJsHighlightingReady, type CodeLanguage,
} from './highlight';

// Loads the JavaScript parser when `javascript` is set, and says once it has, so the code is coloured again.
export function useJsHighlighting(javascript: boolean): boolean {
  useEffect(() => {
    if (javascript) void loadJsHighlighting();
  }, [javascript]);
  return useSyncExternalStore(onJsHighlightingReady, jsHighlightingReady);
}

function InlineCode({ code, language }: { code: string; language: CodeLanguage }) {
  const jsReady = useJsHighlighting(language === 'js');
  const spans = useMemo(() => highlightLines(code, language, language === 'js' ? LAYER_NAMES : undefined).flat(),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- jsReady changes what highlightLines returns
    [code, language, jsReady]);
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
