import { describe, expect, it } from 'vitest';
import { analyse } from './glslDefinitions';
import { findReferences, renameProblem, renameRefusal, targetAt, type Source } from './glslReferences';

const source = (id: string, code: string, shared = false): Source => ({ id, analysis: analyse(code), shared });

// The offset of the first whole-word `name` from `marker` on.
const offsetOf = (code: string, name: string, marker: string) =>
  code.indexOf(marker) + new RegExp(`\\b${name}\\b`).exec(code.slice(code.indexOf(marker)))!.index;

// Each reference as `tab:line:column`, for the first `name` from `marker` on in `tab`.
function referencesOf(sources: Source[], tab: string, name: string, marker = '') {
  const current = sources.find((s) => s.id === tab)!;
  const { code } = current.analysis;
  const target = targetAt(sources, current, offsetOf(code, name, marker));
  if (!target) return null;
  return findReferences(target).map(({ source: s, from }) => {
    const before = s.analysis.code.slice(0, from).split('\n');
    return `${s.id}:${before.length}:${before.at(-1)!.length}`;
  });
}

const IMAGE = `float scale = 2.0;
float wave(float t) {
  float scale = 0.5;
  return sin(t * scale);
}
float twice(float t) {
  return t * scale + wave(t);
}
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  float t = 1.;
  { float t = 2.; fragColor = vec4(t); }
  fragColor += vec4(wave(t) * scale);
}`;

describe('findReferences', () => {
  const image = [source('Image.glsl', IMAGE)];

  it('finds a global and its uses, skipping a local that shadows it', () => {
    expect(referencesOf(image, 'Image.glsl', 'scale')).toEqual(['Image.glsl:1:6', 'Image.glsl:7:13', 'Image.glsl:12:30']);
  });

  it('keeps a local or parameter to its own function and block', () => {
    expect(referencesOf(image, 'Image.glsl', 'scale', 'float scale = 0.5')).toEqual(['Image.glsl:3:8', 'Image.glsl:4:17']);
    expect(referencesOf(image, 'Image.glsl', 't', 'twice')).toEqual(['Image.glsl:6:18', 'Image.glsl:7:9', 'Image.glsl:7:26']);
    expect(referencesOf(image, 'Image.glsl', 't', 'float t = 1')).toEqual(['Image.glsl:10:8', 'Image.glsl:12:25']);
    expect(referencesOf(image, 'Image.glsl', 't', 'float t = 2')).toEqual(['Image.glsl:11:10', 'Image.glsl:11:35']);
  });

  it('counts a prototype and overloads as the same function', () => {
    const code = 'float f(float x);\nvoid mainImage(out vec4 c, in vec2 p) { c = vec4(f(1.) + f(vec2(1.))); }\n' +
      'float f(float x) { return x; }\nfloat f(vec2 x) { return x.x; }';
    expect(referencesOf([source('Image.glsl', code)], 'Image.glsl', 'f')).toHaveLength(5);
  });

  it('finds names from the shared tab in every shader tab, unless a tab declares its own', () => {
    const sources = [
      source('shared.glsl', '#define PI 3.14159\nfloat wave(float t) { return sin(t * PI); }', true),
      source('iBuffer0.glsl', 'void mainImage(out vec4 c, in vec2 p) { c = vec4(wave(PI)); }'),
      source('Image.glsl', 'void mainImage(out vec4 c, in vec2 p) { float PI = 3.; c = vec4(wave(PI)); }'),
    ];
    const fromShared = referencesOf(sources, 'shared.glsl', 'PI');
    expect(fromShared).toEqual(['shared.glsl:1:8', 'shared.glsl:2:37', 'iBuffer0.glsl:1:54']);
    expect(referencesOf(sources, 'iBuffer0.glsl', 'PI')).toEqual(fromShared);
    expect(referencesOf(sources, 'Image.glsl', 'PI')).toEqual(['Image.glsl:1:46', 'Image.glsl:1:69']);
    expect(referencesOf(sources, 'Image.glsl', 'wave')).toEqual(['shared.glsl:2:6', 'iBuffer0.glsl:1:49', 'Image.glsl:1:64']);
  });

  it("doesn't find built-ins, fields or names declared nowhere", () => {
    expect(referencesOf(image, 'Image.glsl', 'sin')).toBeNull();
    expect(referencesOf([source('Image.glsl', 'void f() { g(); }')], 'Image.glsl', 'g')).toBeNull();
    const ray = 'struct Ray { vec3 o; };\nvoid f(Ray r) { vec3 o = r.o; }';
    expect(referencesOf([source('Image.glsl', ray)], 'Image.glsl', 'o', 'vec3 o =')).toEqual(['Image.glsl:2:21']);
  });
});

describe('renameProblem', () => {
  const problem = (sources: Source[], tab: string, name: string, newName: string, marker = '') => {
    const current = sources.find((s) => s.id === tab)!;
    const { code } = current.analysis;
    return renameProblem(targetAt(sources, current, offsetOf(code, name, marker))!, newName, sources);
  };
  const image = [source('Image.glsl', IMAGE)];

  it('allows a new name nothing in scope has', () => {
    expect(problem(image, 'Image.glsl', 'scale', 'size')).toBeNull();
    // fragColor is declared in mainImage, but not in wave.
    expect(problem(image, 'Image.glsl', 'scale', 'fragColor', 'float scale = 0.5')).toBeNull();
    expect(problem(image, 'Image.glsl', 'scale', 't', 'float scale = 0.5')).toMatch(/already a name in Image.glsl/);
  });

  it('refuses names that aren\'t valid or belong to GLSL', () => {
    for (const bad of ['2d', 'a-b', '', 'my name']) expect(problem(image, 'Image.glsl', 'scale', bad)).toMatch(/letters/);
    for (const glsl of ['sin', 'float', 'return', 'iTime', 'gl_FragColor', 'main', 'switch', 'a__b']) {
      expect(problem(image, 'Image.glsl', 'scale', glsl)).toMatch(/part of GLSL/);
    }
  });

  it('refuses a name that clashes in the same scope', () => {
    expect(problem(image, 'Image.glsl', 'scale', 'wave')).toMatch(/already a name in Image.glsl/);
    // A global would be hidden in wave, which declares its own `t`.
    expect(problem(image, 'Image.glsl', 'scale', 't')).toMatch(/already/);
    expect(problem(image, 'Image.glsl', 't', 'scale', 'float t = 1')).toMatch(/already/);
  });

  it('checks every tab for a shared name, and the shared tab for a local one', () => {
    const sources = [
      source('shared.glsl', 'float wave(float t) { return sin(t); }', true),
      source('Image.glsl', 'void mainImage(out vec4 c, in vec2 p) { float ripple = wave(1.); c = vec4(ripple); }'),
    ];
    expect(problem(sources, 'shared.glsl', 'wave', 'ripple')).toMatch(/already a name in Image.glsl/);
    expect(problem(sources, 'Image.glsl', 'ripple', 'wave')).toMatch(/already a name in shared.glsl/);
    expect(problem(sources, 'shared.glsl', 't', 'ripple')).toBeNull();
  });

  it("refuses a struct's fields", () => {
    const sources = [source('Image.glsl', 'struct Ray { vec3 o; };')];
    const current = sources[0]!;
    expect(renameRefusal(targetAt(sources, current, current.analysis.code.indexOf('o;'))!)).toMatch(/fields/);
  });
});
