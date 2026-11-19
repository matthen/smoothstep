import { describe, expect, it } from 'vitest';
import { findPickerMatch, formatFloat, formatVec, hsvToRgb, isColor, parseVec, rgbToHsv } from './pickerValues';

describe('findPickerMatch', () => {
  const line = 'vec3 col = vec3(0.8, 0.3, 0.1) + vec3(4.071, -0.630, 0.356) * vec2(0.3, -0.4).x + 2.5 - -1.25;';

  it('gives a colour picker to vec3s within 0 to 1 and a direction picker otherwise', () => {
    expect(findPickerMatch(line, 17)).toEqual({ kind: 'color', from: 11, to: 30, text: 'vec3(0.8, 0.3, 0.1)' });
    expect(findPickerMatch(line, 11)?.kind).toBe('color');
    expect(findPickerMatch(line, 40)).toMatchObject({ kind: 'direction', text: 'vec3(4.071, -0.630, 0.356)' });
  });

  it('gives a 2D pad to vec2s', () => {
    expect(findPickerMatch(line, line.indexOf('vec2(') + 6)).toMatchObject({ kind: 'vec2', text: 'vec2(0.3, -0.4)' });
  });

  it('gives a float picker to float literals', () => {
    const at = line.indexOf('2.5');
    expect(findPickerMatch(line, at + 1)).toEqual({ kind: 'float', from: at, to: at + 3, text: '2.5' });
    expect(findPickerMatch(line, line.indexOf('-1.25') + 2)).toMatchObject({ kind: 'float', text: '-1.25' });
    expect(findPickerMatch('x = 1. + .5;', 5)).toMatchObject({ text: '1.' });
    expect(findPickerMatch('x = 1. + .5;', 10)).toMatchObject({ text: '.5' });
  });

  it('treats a minus after an operand as subtraction', () => {
    expect(findPickerMatch('a-0.5', 3)).toEqual({ kind: 'float', from: 2, to: 5, text: '0.5' });
  });

  it('ignores integers, identifiers and the rest of the line', () => {
    expect(findPickerMatch('int i = 10;', 9)).toBeNull();
    expect(findPickerMatch('x1.5', 2)).toBeNull();
    expect(findPickerMatch(line, 5)).toBeNull();
  });

  it('falls back to a float inside a vec with expressions', () => {
    expect(findPickerMatch('vec3(0.5, t, 1.0)', 7)).toMatchObject({ kind: 'float', text: '0.5' });
  });
});

describe('vec values', () => {
  it('parses and expands single components', () => {
    expect(parseVec('vec3(0.8, 0.3, 0.1)')).toEqual([0.8, 0.3, 0.1]);
    expect(parseVec('vec2(.5)')).toEqual([0.5, 0.5]);
    expect(parseVec('vec3(1., 2.)')).toBeNull();
    expect(parseVec('vec3(1., , 2.)')).toBeNull();
  });

  it('formats as the old pickers did', () => {
    expect(formatVec([0.8, 0.3, 0.1])).toBe('vec3(0.800, 0.300, 0.100)');
    expect(formatVec([-1, 0.12345])).toBe('vec2(-1.000, 0.123)');
    expect(formatFloat(4.390625)).toBe('4.39063');
  });

  it('decides colours by range', () => {
    expect(isColor([0, 0.5, 1])).toBe(true);
    expect(isColor([0, 1.5, 1])).toBe(false);
    expect(isColor([-0.1, 0.5, 1])).toBe(false);
  });

  it('round-trips colours through HSV', () => {
    const samples: [number, number, number][] = [[0.8, 0.3, 0.1], [0, 0, 0], [1, 1, 1], [0.2, 0.9, 0.5], [0.4, 0.1, 0.7]];
    for (const rgb of samples) {
      const back = hsvToRgb(...rgbToHsv(...rgb));
      back.forEach((c, i) => expect(c).toBeCloseTo(rgb[i]!, 10));
    }
    expect(hsvToRgb(0, 1, 1)).toEqual([1, 0, 0]);
  });
});
