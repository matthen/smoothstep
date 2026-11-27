// A tutorial step's code block, or a few lines quoted in its text, coloured as in the editor.
import { Fragment, useMemo } from 'react';

import { highlightLines, LAYER_NAMES } from '../editor/highlight';
import { useJsHighlighting } from '../editor/InlineCode';

export default function HighlightedCode({code, javascript, className = "learnCodeText"}: {
  code: string; javascript: boolean; className?: string;
}) {
  const jsReady = useJsHighlighting(javascript);
  const lines = useMemo(() => highlightLines(code.replace(/\n$/, ""), javascript ? "js" : "glsl",
    // eslint-disable-next-line react-hooks/exhaustive-deps -- jsReady changes what highlightLines returns
    javascript ? LAYER_NAMES : undefined), [code, javascript, jsReady]);
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
