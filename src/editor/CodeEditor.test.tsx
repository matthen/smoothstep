import { undo } from '@codemirror/commands';
import { EditorView } from '@codemirror/view';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import CodeEditor from './CodeEditor';
import { popupOpen } from './popups';

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

  it("fixes a common GLSL mistake in one undo step, then asks to build", () => {
    const onFixed = vi.fn();
    const code = "void mainImage(out vec4 c, in vec2 p) {\n  float x = 1;\n  c = vec4(x);\n}";
    const errors = [{line: 1, message: "'=' : cannot convert from 'const int' to 'highp float'"}];
    const {container} = render(<CodeEditor {...props} value={code} lineErrors={errors} onFixed={onFixed} />);
    const button = container.querySelector<HTMLButtonElement>(".ss-line-error button")!;
    expect(button.textContent).toBe("Change 1 to 1.0");
    button.click();
    const view = viewIn(container);
    expect(view.state.doc.toString()).toBe(code.replace("= 1;", "= 1.0;"));
    expect(onFixed).toHaveBeenCalledOnce();
    undo(view);
    expect(view.state.doc.toString()).toBe(code);
  });

  it("shows other errors without a button", () => {
    const errors = [{line: 0, message: "'x' : undeclared identifier"}];
    const {container} = render(<CodeEditor {...props} value="x;" lineErrors={errors} skeleton="void mainImage() {}" />);
    expect(container.querySelector(".ss-line-error")!.textContent).toBe(errors[0]!.message);
    expect(container.querySelector(".ss-line-error button")).toBeNull();
  });
  it("takes another animation's code while a picker is open, without reporting the old code as a drag", () => {
    // jsdom has no 2D canvas for the picker to draw on.
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
      (() => new Proxy({}, {get: () => () => ({width: 1}), set: () => true})) as never);
    const a = "void mainImage(out vec4 c, in vec2 p) {\n  c = vec4(0.25, 0.0, 0.0, 1.0);\n}";
    const b = "void mainImage(out vec4 c, in vec2 p) {\n  c = vec4(1.0);\n}";
    const onPickerRelease = vi.fn();
    const pickerProps = {...props, onPickerRelease, onPickerEdit: () => true};
    const {container, rerender} = render(<CodeEditor {...pickerProps} value={a} />);
    const view = viewIn(container);
    const at = a.indexOf("0.25") + 1;
    view.posAtCoords = () => at;
    view.contentDOM.dispatchEvent(new MouseEvent("click", {bubbles: true, clientX: 1, clientY: 1}));
    expect(popupOpen(view.state)).toBe(true);
    rerender(<CodeEditor {...pickerProps} value={b} />);
    expect(onPickerRelease).not.toHaveBeenCalledWith(a);
    rerender(<CodeEditor {...pickerProps} value={a} />);
    expect(view.state.doc.toString()).toBe(a);
    vi.restoreAllMocks();
  });
});
