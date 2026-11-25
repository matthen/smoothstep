import { describe, expect, it } from 'vitest';
import { analyse, structsOf } from './glslDefinitions';
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

// The tabs as the app analyses them: the others know the shared tab's struct types.
function tabs(shared: string, others: Record<string, string>): Source[] {
  const sharedSource = source('shared.glsl', shared, true);
  const structs = structsOf(sharedSource.analysis);
  return [sharedSource, ...Object.entries(others).map(([id, code]) => ({ id, analysis: analyse(code, structs), shared: false }))];
}

// Each tab's code after renaming the first `name` from `marker` on in `tab`, or why it can't be renamed.
function renamed(sources: Source[], tab: string, name: string, newName: string, marker = '') {
  const current = sources.find((s) => s.id === tab)!;
  const target = targetAt(sources, current, offsetOf(current.analysis.code, name, marker))!;
  const problem = renameRefusal(target) ?? renameProblem(target, newName, sources);
  if (problem) return problem;
  const references = findReferences(target);
  return Object.fromEntries(sources.map((s) => {
    let code = s.analysis.code;
    for (const r of references.filter((r) => r.source === s).reverse()) code = code.slice(0, r.from) + newName + code.slice(r.to);
    return [s.id, code];
  }));
}

describe('a declaration shadowing a name in its own initialiser', () => {
  const code = 'float scale = 2.;\nfloat f() { float scale = scale * .5; return scale; }';
  const image = [source('Image.glsl', code)];

  it('leaves the initialiser referring to the outer name', () => {
    expect(referencesOf(image, 'Image.glsl', 'scale')).toEqual(['Image.glsl:1:6', 'Image.glsl:2:26']);
    expect(referencesOf(image, 'Image.glsl', 'scale', 'scale = scale')).toEqual(['Image.glsl:2:18', 'Image.glsl:2:45']);
    expect(renamed(image, 'Image.glsl', 'scale', 'size')).toEqual({
      'Image.glsl': 'float size = 2.;\nfloat f() { float scale = size * .5; return scale; }',
    });
    expect(renamed(image, 'Image.glsl', 'scale', 'k', 'scale = scale')).toEqual({
      'Image.glsl': 'float scale = 2.;\nfloat f() { float k = scale * .5; return k; }',
    });
  });

  it('works the same for a parameter shadowed in a block', () => {
    const param = [source('Image.glsl', 'float f(float t) { { float t = t; } return t; }')];
    expect(referencesOf(param, 'Image.glsl', 't')).toEqual(['Image.glsl:1:14', 'Image.glsl:1:31', 'Image.glsl:1:43']);
    expect(renamed(param, 'Image.glsl', 't', 'time')).toEqual({
      'Image.glsl': 'float f(float time) { { float t = time; } return time; }',
    });
    expect(renamed(param, 'Image.glsl', 't', 'u', 't = t')).toEqual({
      'Image.glsl': 'float f(float t) { { float u = t; } return t; }',
    });
  });

  it('brings each of several declarators into scope after its own initialiser', () => {
    const several = [source('Image.glsl', 'float a = 1.;\nvoid f() { float a = 2., b = a; }')];
    expect(referencesOf(several, 'Image.glsl', 'a')).toEqual(['Image.glsl:1:6']);
    expect(referencesOf(several, 'Image.glsl', 'a', 'a = 2')).toEqual(['Image.glsl:2:17', 'Image.glsl:2:29']);
  });
});

describe('struct types from the shared tab', () => {
  const shared = 'struct L { vec3 p; };\nfloat light;';

  it('refuses a rename that a parameter of a shared struct type would capture', () => {
    const sources = tabs(shared, { 'Image.glsl': 'float sh(L sun) { return sun.p.x * light; }' });
    expect(renamed(sources, 'shared.glsl', 'light', 'sun')).toMatch(/already a name in Image.glsl/);
    expect(renamed(sources, 'shared.glsl', 'light', 'glow')).toEqual({
      'shared.glsl': 'struct L { vec3 p; };\nfloat glow;',
      'Image.glsl': 'float sh(L sun) { return sun.p.x * glow; }',
    });
  });

  it('recognises locals, globals and functions declared with a shared struct', () => {
    const image = 'L g;\nL mk() { L l; l.p = g.p; return l; }\nvoid mainImage(out vec4 c, in vec2 q) { c = vec4(mk().p, 1.); }';
    const sources = tabs(shared, { 'Image.glsl': image });
    expect(referencesOf(sources, 'Image.glsl', 'g')).toEqual(['Image.glsl:1:2', 'Image.glsl:2:20']);
    expect(referencesOf(sources, 'Image.glsl', 'l')).toEqual(['Image.glsl:2:11', 'Image.glsl:2:14', 'Image.glsl:2:32']);
    expect(referencesOf(sources, 'Image.glsl', 'mk')).toEqual(['Image.glsl:2:2', 'Image.glsl:3:49']);
    expect(renamed(sources, 'Image.glsl', 'mk', 'make')).toEqual({
      'shared.glsl': shared,
      'Image.glsl': image.replace(/mk/g, 'make'),
    });
  });

  it('refuses a new name used, but declared nowhere, in a tab the rename reaches', () => {
    const sources = [source('Image.glsl', 'float f(float t) { return t * glow; }')];
    expect(renamed(sources, 'Image.glsl', 't', 'glow')).toMatch(/already used in Image.glsl/);
  });
});

describe('a local used in a #define', () => {
  it('refuses to rename it', () => {
    const sources = [source('Image.glsl', '#define STEP p *= 2.\nvoid f(vec2 p) { STEP; }')];
    expect(renamed(sources, 'Image.glsl', 'p', 'q', 'vec2 p')).toMatch(/#define uses p/);
  });

  it("still renames a macro's own parameter, and a global a macro uses", () => {
    const param = [source('Image.glsl', '#define TWICE(x) (x + x)\nfloat y = TWICE(1.);')];
    expect(renamed(param, 'Image.glsl', 'x', 'v')).toEqual({ 'Image.glsl': '#define TWICE(v) (v + v)\nfloat y = TWICE(1.);' });
    const global = [source('Image.glsl', 'float k = 1.;\n#define K2 (k * 2.)\nfloat y = K2;')];
    expect(renamed(global, 'Image.glsl', 'k', 'scale')).toEqual({ 'Image.glsl': 'float scale = 1.;\n#define K2 (scale * 2.)\nfloat y = K2;' });
  });
});

describe('preprocessor lines', () => {
  it('finds a macro in #ifdef and #if defined()', () => {
    const code = '#define FAST\n#ifdef FAST\nfloat a;\n#endif\n#if defined(FAST) && 1\nfloat b;\n#endif';
    expect(referencesOf([source('Image.glsl', code)], 'Image.glsl', 'FAST')).toEqual(['Image.glsl:1:8', 'Image.glsl:2:7', 'Image.glsl:5:12']);
  });

  it("keeps a multi-line #define's parameters to its lines", () => {
    const code = '#define MIX(a, b) \\\n  mix(a, b, .5)\nfloat a = 1.;\nfloat c = MIX(a, 2.);';
    const sources = [source('Image.glsl', code)];
    expect(referencesOf(sources, 'Image.glsl', 'a')).toEqual(['Image.glsl:1:12', 'Image.glsl:2:6']);
    expect(referencesOf(sources, 'Image.glsl', 'a', 'float a')).toEqual(['Image.glsl:3:6', 'Image.glsl:4:14']);
    expect(renamed(sources, 'Image.glsl', 'MIX', 'BLEND')).toEqual({ 'Image.glsl': code.replace('MIX', 'BLEND').replace('MIX', 'BLEND') });
  });
});
