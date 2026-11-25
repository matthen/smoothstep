import { describe, expect, it } from 'vitest';
import { analyse, findDefinition, topLevel } from './glslDefinitions';

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

  it('finds what another tab could use', () => {
    const analysis = analyse(CODE);
    expect(topLevel(analysis, 'wave')?.from).toBe(CODE.indexOf('wave(float t) {'));
    expect(topLevel(analysis, 'STEPS')?.from).toBe(CODE.indexOf('STEPS'));
    expect(topLevel(analysis, 'fragColor')).toBeNull();
  });
});
