import { getIndentation, indentUnit } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { glslLanguage, tokenizeGlsl, type GlslToken } from './glslLanguage';

const typed = (code: string) =>
  tokenizeGlsl(code).map((line) => line.filter((t) => t.type).map((t) => [t.text, t.type] as [string, GlslToken]));

describe('tokenizeGlsl', () => {
  it('classifies keywords, types, built-ins, uniforms, numbers and variables', () => {
    expect(typed('vec3 col = smoothstep(0., 1.5e2, iTime) * iFloat3;')[0]).toEqual([
      ['vec3', 'typeName'],
      ['col', 'variableName'],
      ['=', 'operator'],
      ['smoothstep', 'variableName.standard'],
      ['0.', 'number'],
      ['1.5e2', 'number'],
      ['iTime', 'variableName.standard'],
      ['*', 'operator'],
      ['iFloat3', 'variableName.standard'],
    ]);
  });

  it('knows the smoothstep uniforms', () => {
    const uniforms = 'iResolution iTexture7 iPrevFrame iFrame iDuration iFloat15 mainImage';
    expect(typed(uniforms)[0]!.map(([, type]) => type)).toEqual(Array(7).fill('variableName.standard'));
  });

  it('handles keywords, atoms and preprocessor lines', () => {
    expect(typed('#define ITER 128\nfor (int i = 0; i < ITER; ++i) return true;')).toEqual([
      [['#define ITER 128', 'meta']],
      [
        ['for', 'keyword'], ['int', 'typeName'], ['i', 'variableName'], ['=', 'operator'], ['0', 'number'],
        ['i', 'variableName'], ['<', 'operator'], ['ITER', 'variableName'], ['++', 'operator'], ['i', 'variableName'],
        ['return', 'keyword'], ['true', 'atom'],
      ],
    ]);
  });

  it('carries block comments across lines', () => {
    expect(typed('float a; /* one\ntwo */ float b; // three')).toEqual([
      [['float', 'typeName'], ['a', 'variableName'], ['/* one', 'comment']],
      [['two */', 'comment'], ['float', 'typeName'], ['b', 'variableName'], ['// three', 'comment']],
    ]);
  });

  it('keeps the whole source text', () => {
    const code = 'void mainImage(out vec4 c, in vec2 f) {\n  c = vec4(f / iResolution.xy, 0.5, 1.);\n}';
    expect(tokenizeGlsl(code).map((line) => line.map((t) => t.text).join('')).join('\n')).toBe(code);
  });
});

describe('glsl indentation', () => {
  const indentAt = (doc: string) => {
    const state = EditorState.create({ doc, extensions: [glslLanguage, indentUnit.of('  ')] });
    return getIndentation(state, doc.length);
  };

  it('indents blocks and continued statements like the old mode', () => {
    expect(indentAt('void main() {\n')).toBe(2);
    expect(indentAt('void main() {\n  if (x)\n')).toBe(4);
    expect(indentAt('void main() {\n  x = 1.;\n')).toBe(2);
    expect(indentAt('void main() {\n  f(a,\n')).toBe(4);
  });
});
