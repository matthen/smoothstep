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

  it('treats a name after a dot as a field or swizzle, not a parameter or macro', () => {
    expect(typed('float f(float x) {\n  return v.x + x;\n}')[1]).toEqual([
      ['return', 'keyword'], ['v', 'variableName'], ['x', 'variableName'], ['+', 'operator'], ['x', 'variableName.local'],
    ]);
    expect(typed('#define xy 1\nvec2 a = p.xy * xy;')[1]).toEqual([
      ['vec2', 'typeName'], ['a', 'variableName'], ['=', 'operator'], ['p', 'variableName'], ['xy', 'variableName'],
      ['*', 'operator'], ['xy', 'macroName'],
    ]);
  });

  it('knows GLSL ES 3 types and qualifiers, as declarations and constructors', () => {
    expect(typed('uint hash(in highp uint x) { return uint(x); }')[0]).toEqual([
      ['uint', 'typeName'], ['hash', 'variableName.function'], ['in', 'keyword'], ['highp', 'keyword'],
      ['uint', 'typeName'], ['x', 'variableName.local'], ['return', 'keyword'], ['uint', 'typeName'],
      ['x', 'variableName.local'],
    ]);
    const types = 'mat2x2 mat4x3 uvec3 sampler2D samplerCube sampler2DArray isampler2D usampler3D sampler2DShadow';
    expect(typed(types)[0]!.map(([, type]) => type)).toEqual(Array(9).fill('typeName'));
    expect(typed('vec4 blur(sampler2D tex) { return mat2x2(1.)[0].xyxy; }')[0]!.slice(0, 5)).toEqual([
      ['vec4', 'typeName'], ['blur', 'variableName.function'], ['sampler2D', 'typeName'], ['tex', 'variableName.local'],
      ['return', 'keyword'],
    ]);
    expect(typed('return mat2x2(1.);')[0]![1]).toEqual(['mat2x2', 'typeName']);
  });

  it('ends a #define at a blank line after a \\, and forgets a macro at #undef', () => {
    expect(typed('#define F(a) \\\n\na + N;\n#define N 1\n#undef N\nfloat y = N;')).toEqual([
      [['#define', 'meta'], ['F', 'variableName.function'], ['a', 'variableName.local']],
      [],
      [['a', 'variableName'], ['+', 'operator'], ['N', 'variableName']],
      [['#define', 'meta'], ['N', 'macroName'], ['1', 'number']],
      [['#undef', 'meta'], ['N', 'macroName']],
      [['float', 'typeName'], ['y', 'variableName'], ['=', 'operator'], ['N', 'variableName']],
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
