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
      [['#define', 'meta'], ['ITER', 'macroName'], ['128', 'number']],
      [
        ['for', 'keyword'], ['int', 'typeName'], ['i', 'variableName'], ['=', 'operator'], ['0', 'number'],
        ['i', 'variableName'], ['<', 'operator'], ['ITER', 'macroName'], ['++', 'operator'], ['i', 'variableName'],
        ['return', 'keyword'], ['true', 'atom'],
      ],
    ]);
  });

  it('reads a #define value as code', () => {
    expect(typed('#define COL vec3(sin(1.), iTime, x)')[0]).toEqual([
      ['#define', 'meta'], ['COL', 'macroName'], ['vec3', 'typeName'], ['sin', 'variableName.standard'],
      ['1.', 'number'], ['iTime', 'variableName.standard'], ['x', 'variableName'],
    ]);
  });

  it('knows function-like macros, their parameters and their calls', () => {
    expect(typed('#define sq(x) ((x) * x)\nfloat y = sq(2.) + x;')).toEqual([
      [['#define', 'meta'], ['sq', 'variableName.function'], ['x', 'variableName.local'], ['x', 'variableName.local'],
        ['*', 'operator'], ['x', 'variableName.local']],
      [['float', 'typeName'], ['y', 'variableName'], ['=', 'operator'], ['sq', 'variableName.function'],
        ['2.', 'number'], ['+', 'operator'], ['x', 'variableName']],
    ]);
  });

  it('carries a #define over a line continuation', () => {
    expect(typed('#define F(a) \\\n  a + PI\nF(1.)')).toEqual([
      [['#define', 'meta'], ['F', 'variableName.function'], ['a', 'variableName.local']],
      [['a', 'variableName.local'], ['+', 'operator'], ['PI', 'variableName']],
      [['F', 'variableName.function'], ['1.', 'number']],
    ]);
  });

  it('marks the macro names of other directives and keeps #version whole', () => {
    expect(typed('#version 300 es\n#ifdef AA\n#if defined(AA) && N > 2\n#endif')).toEqual([
      [['#version 300 es', 'meta']],
      [['#ifdef', 'meta'], ['AA', 'macroName']],
      [['#if', 'meta'], ['defined', 'meta'], ['AA', 'variableName'], ['&&', 'operator'], ['N', 'variableName'],
        ['>', 'operator'], ['2', 'number']],
      [['#endif', 'meta']],
    ]);
  });

  it('marks user functions where they are defined and called, but not built-ins or constructors', () => {
    expect(typed('float wave(float t) { return sin(t); }\nvec2 p = vec2(wave (1.));')).toEqual([
      [['float', 'typeName'], ['wave', 'variableName.function'], ['float', 'typeName'], ['t', 'variableName.local'],
        ['return', 'keyword'], ['sin', 'variableName.standard'], ['t', 'variableName.local']],
      [['vec2', 'typeName'], ['p', 'variableName'], ['=', 'operator'], ['vec2', 'typeName'],
        ['wave', 'variableName.function'], ['1.', 'number']],
    ]);
  });

  it('knows parameters only inside their function', () => {
    const code = 'void mainImage(out vec4 c, in vec2 f) {\n  if (f.x > 0.) { c = vec4(1); }\n  c.a = 1.;\n}\nfloat g = c;';
    const kinds = typed(code).map((line) => line.filter(([text]) => text === 'c' || text === 'f').map(([, type]) => type));
    expect(kinds).toEqual([
      ['variableName.local', 'variableName.local'],
      ['variableName.local', 'variableName.local'],
      ['variableName.local'],
      [],
      ['variableName'],
    ]);
  });

  it('treats a prototype\'s parameters as plain names after it', () => {
    expect(typed('float f(float a);\nfloat b = a;')[1]).toEqual([
      ['float', 'typeName'], ['b', 'variableName'], ['=', 'operator'], ['a', 'variableName'],
    ]);
  });

  it('colours struct names as types', () => {
    expect(typed('struct Ray { vec3 o; };\nRay r = Ray(vec3(0));')[1]).toEqual([
      ['Ray', 'typeName'], ['r', 'variableName'], ['=', 'operator'], ['Ray', 'typeName'], ['vec3', 'typeName'],
      ['0', 'number'],
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
