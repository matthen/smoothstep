// Which inline picker a click gets, and parsing/formatting the values the pickers edit.

export type PickerKind = 'float' | 'vec2' | 'color' | 'direction';

export interface PickerMatch {
  kind: PickerKind;
  from: number; // offsets within the line
  to: number;
  text: string;
}

const MATCHERS: [RegExp, 'vec3' | 'vec2' | 'float'][] = [
  [/vec3\([-\d.,\s]*\)/g, 'vec3'],
  [/vec2\([-\d.,\s]*\)/g, 'vec2'],
  [/-?\d+\.\d+|\d+\.|\.\d+/g, 'float'],
];

// The value under column `ch` of `line`: a vec3, then a vec2, then a float literal (with a decimal point).
export function findPickerMatch(line: string, ch: number): PickerMatch | null {
  for (const [re, type] of MATCHERS) {
    for (const m of line.matchAll(re)) {
      let from = m.index;
      const to = from + m[0].length;
      if (ch < from || ch > to) continue;
      if (type === 'float') {
        const before = line.charAt(from - 1);
        // In `a-0.5` the minus is subtraction; in `x1.5` the digits belong to an identifier.
        if (m[0].startsWith('-') && /[\w$)\]]/.test(before)) from += 1;
        else if (/[\w$]/.test(before)) continue;
        return { kind: 'float', from, to, text: line.slice(from, to) };
      }
      const values = parseVec(m[0]);
      if (!values) continue;
      const kind = type === 'vec2' ? 'vec2' : isColor(values) ? 'color' : 'direction';
      return { kind, from, to, text: m[0] };
    }
  }
  return null;
}

// The components of `vecN(a, b, ...)`, expanding a single component to all N; null if malformed.
export function parseVec(text: string): number[] | null {
  const m = /^vec([234])\(([^)]*)\)$/.exec(text.trim());
  if (!m) return null;
  const n = Number(m[1]);
  const parts = m[2]!.split(',').map((s) => s.trim());
  if (parts.length !== 1 && parts.length !== n) return null;
  const values = parts.map(Number);
  if (values.some((v, i) => !parts[i] || !Number.isFinite(v))) return null;
  return parts.length === 1 ? Array<number>(n).fill(values[0]!) : values;
}

export function isColor(values: number[]): boolean {
  return values.every((v) => v >= 0 && v <= 1);
}

export function formatFloat(value: number): string {
  return value.toFixed(5);
}

export function formatVec(values: number[]): string {
  return `vec${values.length}(${values.map((v) => v.toFixed(3)).join(', ')})`;
}

// h, s, v and r, g, b all in [0, 1].
export function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  switch (((i % 6) + 6) % 6) {
    case 0: return [v, t, p];
    case 1: return [q, v, p];
    case 2: return [p, v, t];
    case 3: return [p, q, v];
    case 4: return [t, p, v];
    default: return [v, p, q];
  }
}

export function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === r) h = ((g - b) / d + 6) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  return [h, max === 0 ? 0 : d / max, max];
}
