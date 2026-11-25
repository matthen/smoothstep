import { Fragment, useMemo } from 'react';

import { highlightLines, LAYER_NAMES } from '../editor/highlight';

// Code coloured as in the editor: a step's code block, or a few lines quoted in its text.
export default function HighlightedCode({code, javascript, className = "learnCodeText"}: {
  code: string; javascript: boolean; className?: string;
}) {
  const lines = useMemo(() => highlightLines(code.replace(/\n$/, ""), javascript ? "js" : "glsl",
    javascript ? LAYER_NAMES : undefined), [code, javascript]);
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
