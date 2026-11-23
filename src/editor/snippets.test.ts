import { autocompletion, nextSnippetField, type Completion } from '@codemirror/autocomplete';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { afterEach, describe, expect, it } from 'vitest';

import { lastFrameName } from './completion';
import { canvas2dSnippetCompletions, glslSnippetCompletions } from './snippets';

let view: EditorView | null = null;
afterEach(() => view?.destroy());

function editor(doc: string, lastFrame?: string) {
  view = new EditorView({
    parent: document.body,
    state: EditorState.create({doc, extensions: [autocompletion(), lastFrame ? lastFrameName.of(lastFrame) : []]}),
  });
  return view;
}

// Picks `option` as if `typed` had just been typed at the end of the document.
function pick(v: EditorView, option: Completion, typed: string) {
  const to = v.state.doc.length;
  if (typeof option.apply !== 'function') throw new Error('not a snippet');
  option.apply(v, option, to - typed.length, to);
}

const selected = (v: EditorView) => v.state.sliceDoc(v.state.selection.main.from, v.state.selection.main.to);
const named = (options: Completion[], label: string) => options.find((o) => o.label === label)!;

describe('snippets', () => {
  it("make a feedback loop that reads the tab's own last frame, with Tab stops on its numbers", () => {
    const v = editor('feed', 'iBuffer2');
    pick(v, named(glslSnippetCompletions('iBuffer2'), 'feedback'), 'feed');
    const code = v.state.doc.toString();
    expect(code).toMatch(/^void mainImage/);
    expect(code).toContain('texture(iBuffer2, uv)');
    expect(selected(v)).toBe('0.05');
    nextSnippetField(v);
    expect(selected(v)).toBe('0.98');
    nextSnippetField(v);
    expect(v.state.selection.main.head).toBe(code.lastIndexOf('\n}'));
  });

  it('indent each line to match the line they start on', () => {
    const v = editor('function draw(ctx) {\n  dr');
    pick(v, named(canvas2dSnippetCompletions(), 'drawList'), 'dr');
    const lines = v.state.doc.toString().split('\n');
    expect(lines[1]).toBe('  drawList(ctx, [');
    expect(lines[2]).toBe('    Set({fillStyle: "orange"}),');
    expect(lines.at(-1)).toBe('  ]);');
  });

  it("add a library's import line at the top, once", () => {
    const v = editor('// Physics\nlet x = 1;\npla');
    const planck = named(canvas2dSnippetCompletions(), 'planck');
    pick(v, planck, 'pla');
    const code = v.state.doc.toString();
    expect(code.startsWith('import planck from "planck";\n\n// Physics\nlet x = 1;\nlet world, ball;')).toBe(true);
    expect(selected(v)).toBe('-10');

    v.dispatch({changes: {from: v.state.doc.length, insert: '\npla'}});
    pick(v, planck, 'pla');
    expect(v.state.doc.toString().match(/import planck/g)).toHaveLength(1);
  });

  it('leave the cursor after a snippet without fields', () => {
    const v = editor('    iCan');
    pick(v, named(glslSnippetCompletions('iPrevFrame'), 'iCanvas2D'), 'iCan');
    const code = v.state.doc.toString();
    expect(code.split('\n')[1]).toBe('    col = col * (1.0 - drawn.a) + drawn.rgb;');
    expect(v.state.selection.main.head).toBe(code.length);
  });
});
