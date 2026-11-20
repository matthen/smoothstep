import { EditorView } from '@codemirror/view';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import CodeEditor from './CodeEditor';

afterEach(cleanup);

describe("CodeEditor", () => {
  const props = {onChange: vi.fn(), onBuild: vi.fn(), onSave: vi.fn(), lineErrors: []};
  const viewIn = (container: HTMLElement) => EditorView.findFromDOM(container.querySelector<HTMLElement>(".cm-editor")!)!;
  const edit = (view: EditorView, text: string) =>
    view.dispatch({changes: {from: 0, to: view.state.doc.length, insert: text}});

  it("ignores an older edit of its own coming back after a newer one", () => {
    const {container, rerender} = render(<CodeEditor {...props} value="a" />);
    const view = viewIn(container);
    edit(view, "b");
    edit(view, "c");
    // React renders the first report after the second edit, as during a fast picker drag.
    rerender(<CodeEditor {...props} value="b" />);
    expect(view.state.doc.toString()).toBe("c");
    rerender(<CodeEditor {...props} value="c" />);
    expect(view.state.doc.toString()).toBe("c");
  });

  it("takes new code from outside, even code it had before", () => {
    const {container, rerender} = render(<CodeEditor {...props} value="a" />);
    const view = viewIn(container);
    edit(view, "b");
    rerender(<CodeEditor {...props} value="b" />);
    edit(view, "c");
    rerender(<CodeEditor {...props} value="c" />);
    // Opening an animation whose code matches an earlier edit.
    rerender(<CodeEditor {...props} value="b" />);
    expect(viewIn(container).state.doc.toString()).toBe("b");
  });
});
