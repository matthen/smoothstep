import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { glslCodeHtml, highlightedCodeElement, looksLikeGlsl } from './highlight';
import { GlslCode, JsCode } from './InlineCode';

afterEach(cleanup);

// Each coloured run as [text, class].
const runs = (el: Element) => [...el.querySelectorAll('span')].map(s => [s.textContent, s.className]);

describe("inline code", () => {
  it("colours a #define as the editor does: directive, macro name and built-in", () => {
    const {container} = render(<GlslCode>#define size iFloat0</GlslCode>);
    const code = container.querySelector('code')!;
    expect(code.className).toBe('ss-code');
    expect(code.textContent).toBe('#define size iFloat0');
    expect(runs(code)).toEqual([['#define', 'tok-meta'], ['size', 'tok-macro'], ['iFloat0', 'tok-builtin']]);
  });

  it("leaves a lone name a plain variable, without guessing it's a macro", () => {
    const {container} = render(<GlslCode>size</GlslCode>);
    expect(runs(container.querySelector('code')!)).toEqual([['size', 'tok-variable']]);
  });

  it("colours function calls, types and numbers", () => {
    const {container} = render(<GlslCode>vec3(1.0, 0.5, 0.2)</GlslCode>);
    expect(runs(container.querySelector('code')!)).toEqual(
      [['vec3', 'tok-type'], ['1.0', 'tok-number'], ['0.5', 'tok-number'], ['0.2', 'tok-number']]);
  });

  it("marks the Canvas2D layer's names in JavaScript, and colours the rest once the parser loads", async () => {
    const {container} = render(<JsCode>{'Disk({center: [0, 0]})'}</JsCode>);
    expect(runs(container.querySelector('code')!)).toContainEqual(['Disk', 'tok-builtin']);
    await waitFor(() => expect(runs(container.querySelector('code')!)).toContainEqual(['0', 'tok-number']));
    expect(runs(container.querySelector('code')!)).toContainEqual(['Disk', 'tok-builtin']);
  });

  it("builds the same for the DOM and as HTML, escaped", () => {
    const el = highlightedCodeElement(['float smoothstep(float a, float b, float x)', 'vec2 smoothstep(vec2 a, vec2 b, vec2 x)'], 'glsl');
    expect(el.className).toBe('ss-code');
    expect(el.querySelectorAll('br')).toHaveLength(1);
    expect(runs(el).slice(0, 2)).toEqual([['float', 'tok-type'], ['smoothstep', 'tok-builtin']]);
    expect(glslCodeHtml('a < b')).toBe('<code class="ss-code"><span class="tok-variable">a</span> ' +
      '<span class="tok-operator">&lt;</span> <span class="tok-variable">b</span></code>');
  });

  it("tells shader code in the docs from file names, keys and JavaScript", () => {
    for (const glsl of ['iFloat0', '#define', '#version 300 es', 'vec2 iResolution', 'texture(iTexture0, uv)',
      'if (iFrame == 0)']) {
      expect(looksLikeGlsl(glsl), glsl).toBe(true);
    }
    for (const other of ['Image.glsl', '[iBuffer0.glsl]', '#url/', 'Mod + S', 'any', 'size', 'clear(ctx)', 'world.step(1 / 60)', 'Set({lineWidth: 0.01})',
      '"#ffcc00"', 'import planck from "planck"']) {
      expect(looksLikeGlsl(other), other).toBe(false);
    }
  });
});
