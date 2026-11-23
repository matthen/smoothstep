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

  it("offers to insert a missing function after the code there is, then asks to build", () => {
    const onFixed = vi.fn();
    const skeleton = "function draw(ctx) {\n  clear(ctx);\n}";
    const code = 'import planck from "planck";\nlet n = 0;';
    const errors = [{line: 1, message: "The Canvas2D code needs a draw function.", missing: "draw" as const}];
    const {container} = render(
      <CodeEditor {...props} value={code} lineErrors={errors} skeleton={skeleton} onFixed={onFixed} />);
    const error = container.querySelector(".ss-line-error")!;
    expect(error.querySelector("pre")!.textContent).toBe(skeleton);
    error.querySelector("button")!.click();
    expect(viewIn(container).state.doc.toString()).toBe(code + "\n\n" + skeleton + "\n");
    expect(onFixed).toHaveBeenCalledOnce();
    expect(container.querySelector(".ss-line-error")).toBeNull();
  });

  it("shows other errors without a button", () => {
    const errors = [{line: 0, message: "'x' : undeclared identifier"}];
    const {container} = render(<CodeEditor {...props} value="x;" lineErrors={errors} skeleton="void mainImage() {}" />);
    expect(container.querySelector(".ss-line-error")!.textContent).toBe(errors[0]!.message);
    expect(container.querySelector(".ss-line-error button")).toBeNull();
  });
});
