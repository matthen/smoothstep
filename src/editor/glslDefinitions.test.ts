import { describe, expect, it } from 'vitest';
import { analyse, describe as describeDefinition, findDefinition, nameAt, topLevel } from './glslDefinitions';

// The line with the definition of the first `name` from `marker` on, with the name in brackets.
function definitionOf(code: string, name: string, marker = '') {
  const pos = code.indexOf(name, code.indexOf(marker));
  const found = findDefinition(analyse(code), pos);
  if (!found) return null;
  const lineStart = code.lastIndexOf('\n', found.from - 1) + 1;
  const lineEnd = code.indexOf('\n', found.to);
  const line = code.slice(lineStart, lineEnd < 0 ? code.length : lineEnd);
  return `${line.slice(0, found.from - lineStart)}[${code.slice(found.from, found.to)}]${line.slice(found.to - lineStart)}`.trim();
}

const CODE = `#define STEPS 64
#define sq(x) ((x) * (x))
struct Ray { vec3 o; vec3 d; };
float scale = 2.0;
float wave(float t);
float wave(float t) {
  float scale = 0.5;
  return sin(t * scale);
}
float twice(float scale, float y) {
  return scale * y + wave(y);
}
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  Ray ray;
  float a = 1., b = sq(a);
  for (int i = 0; i < STEPS; i++) {
    float b = scale;
  }
  fragColor = vec4(wave(b), ray.o);
}`;

describe('findDefinition', () => {
  it('finds functions, preferring the definition with a body to a prototype', () => {
    expect(definitionOf(CODE, 'wave', 'return scale')).toBe('float [wave](float t) {');
    expect(definitionOf(CODE, 'sq', 'b = sq')).toBe('#define [sq](x) ((x) * (x))');
  });

  it('finds macros and structs', () => {
    expect(definitionOf(CODE, 'STEPS', 'i < STEPS')).toBe('#define [STEPS] 64');
    expect(definitionOf(CODE, 'Ray', 'Ray ray')).toBe('struct [Ray] { vec3 o; vec3 d; };');
  });

  it('prefers a local to a global of the same name', () => {
    expect(definitionOf(CODE, 'scale', 'return sin')).toBe('float [scale] = 0.5;');
    expect(definitionOf(CODE, 'scale', 'float b = scale')).toBe('float [scale] = 2.0;');
  });

  it('finds parameters, which shadow globals in their function', () => {
    expect(definitionOf(CODE, 'scale', 'return scale')).toBe('float twice(float [scale], float y) {');
    expect(definitionOf(CODE, 't', 'sin(t')).toBe('float wave(float [t]) {');
    expect(definitionOf(CODE, 'fragColor', 'fragColor =')).toBe('void mainImage(out vec4 [fragColor], in vec2 fragCoord) {');
    expect(definitionOf(CODE, 'x', '((x)')).toBe('#define sq([x]) ((x) * (x))');
  });

  it('finds the nearest enclosing declaration, and names declared after a comma', () => {
    expect(definitionOf(CODE, 'b', 'wave(b')).toBe('float a = 1., [b] = sq(a);');
    expect(definitionOf(CODE, 'i', 'i++')).toBe('for (int [i] = 0; i < STEPS; i++) {');
  });

  it('finds nothing for built-ins, fields or unknown names', () => {
    expect(definitionOf(CODE, 'sin', 'return sin')).toBeNull();
    expect(definitionOf(CODE, 'o', 'ray.o')).toBeNull();
    expect(definitionOf('x = y;', 'y')).toBeNull();
  });

  it('finds the name ending at the position, as at a word\'s end before a bracket', () => {
    const analysis = analyse(CODE);
    const call = CODE.indexOf('wave(b') + 'wave'.length;
    expect(nameAt(analysis, call)?.text).toBe('wave');
    expect(findDefinition(analysis, call)?.from).toBe(CODE.indexOf('wave(float t) {'));
    const t = CODE.indexOf('sin(t') + 'sin(t'.length;
    expect(nameAt(analysis, t)?.text).toBe('t');
    expect(findDefinition(analysis, t)?.from).toBe(CODE.indexOf('t) {'));
    expect(nameAt(analyse('a+b'), 1)?.text).toBe('a');
    expect(nameAt(analyse('a+b'), 2)?.text).toBe('b');
  });

  it('goes from a prototype to its body, and prefers a global before the use', () => {
    expect(definitionOf(CODE, 'wave', 'float wave(float t);')).toBe('float [wave](float t) {');
    const code = '#ifdef A\nfloat f() { return 1.; }\n#endif\nfloat g() { return f(); }\nfloat f() { return 2.; }';
    expect(definitionOf(code, 'f', 'return f')).toBe('float [f]() { return 1.; }');
  });

  it('knows GLSL ES 3 types and qualifiers in declarations', () => {
    const code = 'uint hash(uint x) { return x; }\n' +
      'vec4 blur(in highp sampler2D tex, const mediump vec2 uv) { return texture(tex, uv); }\n' +
      'mat2x3 m = mat2x3(1.);\nstruct Ray { vec3 o; };\nRay make(Ray r) { Ray q = r; return q; }';
    expect(definitionOf(code, 'hash', 'hash')).toBe('uint [hash](uint x) { return x; }');
    expect(definitionOf(code, 'x', 'return x')).toBe('uint hash(uint [x]) { return x; }');
    expect(definitionOf(code, 'tex', '(tex,')).toContain('sampler2D [tex]');
    expect(definitionOf(code, 'uv', 'tex, uv')).toContain('vec2 [uv]');
    expect(definitionOf(code, 'm', 'm =')).toBe('mat2x3 [m] = mat2x3(1.);');
    expect(definitionOf(code, 'r', 'q = r')).toContain('make(Ray [r])');
    expect(definitionOf(code, 'mat2x3', 'mat2x3(')).toBeNull();
  });

  it('finds what another tab could use', () => {
    const analysis = analyse(CODE);
    expect(topLevel(analysis, 'wave')?.from).toBe(CODE.indexOf('wave(float t) {'));
    expect(topLevel(analysis, 'STEPS')?.from).toBe(CODE.indexOf('STEPS'));
    expect(topLevel(analysis, 'fragColor')).toBeNull();
  });
});

describe('describe', () => {
  const describeName = (code: string, name: string) => {
    const analysis = analyse(code);
    const d = analysis.declarations.find((d) => d.name === name);
    return d ? describeDefinition(analysis, d) : null;
  };

  it('takes the comment block above, leaving out commented-out code and separators', () => {
    const code = '// Unrelated.\n\n// -----\n// Distance to the scene,\n// float sdf(vec3 p) { return 0.; }\n' +
      '//   in world units.\n// x = 1.;\n//\nfloat sdf(vec3 p) { return length(p); }';
    expect(describeName(code, 'sdf')).toEqual({
      signature: 'float sdf(vec3 p)',
      comment: 'Distance to the scene, in world units.',
    });
    expect(describeName('// ====\n// }\nfloat k = 1.;', 'k')).toEqual({ signature: 'float k = 1.;', comment: '' });
  });

  it('joins a signature over several lines, and a macro continued with \\', () => {
    expect(describeName('float sdf(vec3 p,\n          float r)\n{\n  return length(p) - r;\n}', 'sdf')?.signature)
      .toBe('float sdf(vec3 p, float r)');
    expect(describeName('#define LONG(a) \\\n  (a * 2.) \\\n  + 1.\nfloat x;', 'LONG')?.signature)
      .toBe('#define LONG(a) (a * 2.) + 1.');
  });

  it('shows a struct by its name, and nothing for locals and parameters', () => {
    const code = '// A ray.\nstruct Ray { vec3 o; vec3 d; };\nfloat f(float a) { float b = a; return b; }';
    expect(describeName(code, 'Ray')).toEqual({ signature: 'struct Ray', comment: 'A ray.' });
    expect(describeName(code, 'a')).toBeNull();
    expect(describeName(code, 'b')).toBeNull();
  });
});
