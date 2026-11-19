import { CompletionContext } from '@codemirror/autocomplete';
import { EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { completionCandidates, glslCompletionSource } from './completion';

describe('completionCandidates', () => {
  it('lists built-ins by prefix in the old order', () => {
    expect(completionCandidates([''], 0, 'flo')).toEqual(['floor', 'floatBitsToInt', 'float']);
    expect(completionCandidates([''], 0, 'iTe')).toEqual(Array.from({ length: 8 }, (_, i) => `iTexture${i}`));
  });

  it('adds words from the document, nearest first, without duplicates or the word being typed', () => {
    const lines = ['float radius2 = 1.;', 'float radius = 2.;', 'rad', 'radiance radius'];
    expect(completionCandidates(lines, 2, 'rad')).toEqual(['radians', 'radius', 'radius2', 'radiance']);
  });

  it('is case sensitive', () => {
    expect(completionCandidates(['Smooth'], 0, 'smoo')).toEqual(['smoothstep']);
  });
});

describe('glslCompletionSource', () => {
  const complete = (doc: string, explicit = false) =>
    glslCompletionSource(new CompletionContext(EditorState.create({ doc }), doc.length, explicit));

  it('completes the word before the cursor, unfiltered by CodeMirror', () => {
    const result = complete('vec3 rainbow;\nrai');
    expect(result).toMatchObject({ from: 14, filter: false });
    expect(result?.options.map((o) => o.label)).toEqual(['rainbow']);
  });

  it('stays quiet after a non-word or with nothing to offer', () => {
    expect(complete('x = (')).toBeNull();
    expect(complete('zzz')).toBeNull();
    expect(complete('x = 1')).toBeNull();
  });
});
