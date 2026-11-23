import { describe, expect, it } from 'vitest';
import {
  findJsPickerMatch, findPickerMatch, formatCssColor, formatFloat, formatJsNumber, formatVec, hsvToRgb, isColor,
  jsNumberScale, parseCssColor, parseVec, rgbToHsv,
} from './pickerValues';

describe('findJsPickerMatch', () => {
  const line = 'Set({fillStyle: "#bbeafe", strokeStyle: "rgba(0, 0, 0, 0.05)"}), Disk({radius: -0.25}), x1, a-2, 1e5';
  const at = (text: string) => line.indexOf(text) + 1;

  it('finds colour strings whole, and numbers', () => {
    expect(findJsPickerMatch(line, at('#bbeafe'))).toMatchObject({ kind: 'cssColor', text: '#bbeafe' });
    expect(findJsPickerMatch(line, at('0.05)'))).toMatchObject({ kind: 'cssColor', text: 'rgba(0, 0, 0, 0.05)' });
    expect(findJsPickerMatch(line, at('-0.25'))).toMatchObject({ kind: 'number', text: '-0.25' });
    expect(findJsPickerMatch('ctx.fillText("Hi", 60, 110);', 20)).toMatchObject({ kind: 'number', text: '60' });
  });

  it('leaves out identifiers, subtraction signs and exponents', () => {
    expect(findJsPickerMatch(line, at('1, a'))).toBeNull();
    expect(findJsPickerMatch(line, at('-2'))).toMatchObject({ text: '2' });
    expect(findJsPickerMatch(line, line.indexOf('1e5'))).toBeNull();
    expect(findJsPickerMatch('"#12345"', 3)?.kind).not.toBe('cssColor');
  });
});

describe('CSS colours', () => {
  it('round-trip every format they were written in', () => {
    for (const text of ['#bbeafe', '#fff', '#ffffff16', '#FFCC00', '#f0c8', 'rgb(255, 0, 0)', 'rgb(10,20,30)',
      'rgba(0, 0, 0, 0.05)', 'rgb(255 128 0 / 50%)']) {
      expect(formatCssColor(parseCssColor(text)!, text)).toBe(text);
    }
  });

  it('write a new colour in the old format, keeping alpha', () => {
    expect(formatCssColor([1, 0, 0], '#bbeafe')).toBe('#ff0000');
    expect(formatCssColor([1, 0, 0], '#ABC')).toBe('#F00');
    expect(formatCssColor([0, 1, 0], '#ffffff16')).toBe('#00ff0016');
    expect(formatCssColor([0, 0, 1], 'rgba(0, 0, 0, 0.05)')).toBe('rgba(0, 0, 255, 0.05)');
    expect(parseCssColor('#ff8000')).toEqual([1, 128 / 255, 0]);
  });
});

describe('JavaScript numbers', () => {
  it('stay whole if they were, and otherwise keep places to suit the ruler', () => {
    expect(formatJsNumber(61.6, '60', jsNumberScale(60))).toBe('62');
    expect(formatJsNumber(0.31234, '0.3', jsNumberScale(0.3))).toBe('0.312');
    expect(jsNumberScale(1080)).toBeGreaterThan(jsNumberScale(0.5));
  });
});

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
