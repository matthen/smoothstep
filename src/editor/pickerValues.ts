// Which inline picker a click gets, and parsing/formatting the values the pickers edit.

// The last two are JavaScript's: any number literal, and a colour string like "#ffcc00" or "rgb(255, 0, 0)".
export type PickerKind = 'float' | 'vec2' | 'color' | 'direction' | 'number' | 'cssColor';

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

const CSS_COLOR = new RegExp([
  /#(?:[\da-f]{8}|[\da-f]{6}|[\da-f]{3,4})(?![\w$])/.source,
  /rgba?\(\s*[\d.]+(?:\s*,\s*[\d.]+){2}(?:\s*,\s*[\d.]+%?)?\s*\)/.source,
  /rgba?\(\s*[\d.]+(?:\s+[\d.]+){2}(?:\s*\/\s*[\d.]+%?)?\s*\)/.source,
].join('|'), 'gi');
const JS_NUMBER = /-?(?:\d+\.?\d*|\.\d+)/g;

// For JavaScript: the colour or number literal under column `ch` of `line`. Whether it's in a string
// (as colours should be) or code (as numbers should be) is up to the caller.
export function findJsPickerMatch(line: string, ch: number): PickerMatch | null {
  for (const m of line.matchAll(CSS_COLOR)) {
    if (ch >= m.index && ch <= m.index + m[0].length) {
      return { kind: 'cssColor', from: m.index, to: m.index + m[0].length, text: m[0] };
    }
  }
  for (const m of line.matchAll(JS_NUMBER)) {
    let from = m.index;
    const to = from + m[0].length;
    if (ch < from || ch > to || /[\w$.]/.test(line.charAt(to))) continue;
    const before = line.charAt(from - 1);
    if (m[0].startsWith('-') && /[\w$)\]]/.test(before)) from += 1;
    else if (/[\w$.]/.test(before)) continue;
    return { kind: 'number', from, to, text: line.slice(from, to) };
  }
  return null;
}

// A colour string's red, green and blue, from 0 to 1.
export function parseCssColor(text: string): [number, number, number] | null {
  const hex = /^#([\da-f]{3,8})$/i.exec(text)?.[1];
  if (hex && hex.length !== 5 && hex.length !== 7) {
    const short = hex.length <= 4;
    const channel = (i: number) => short
      ? parseInt(hex[i]!, 16) / 15
      : parseInt(hex.slice(2 * i, 2 * i + 2), 16) / 255;
    return [channel(0), channel(1), channel(2)];
  }
  const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(text);
  if (!rgb) return null;
  const values = rgb.slice(1, 4).map((v) => Math.min(1, Number(v) / 255));
  return values.some((v) => !Number.isFinite(v)) ? null : (values as [number, number, number]);
}

// `rgb` written in the same format as `original`, keeping its alpha, spacing and letter case.
export function formatCssColor(rgb: readonly number[], original: string): string {
  const bytes = rgb.map((c) => Math.round(Math.min(1, Math.max(0, c)) * 255));
  if (original.startsWith('#')) {
    const digits = original.length - 1;
    const short = digits <= 4;
    const hex = bytes.map((b) => short
      ? Math.round(b / 17).toString(16)
      : b.toString(16).padStart(2, '0')).join('');
    const alpha = original.slice(short ? 4 : 7);
    const out = '#' + hex + alpha;
    return original === original.toUpperCase() && /[A-F]/.test(original) ? out.toUpperCase() : out;
  }
  const m = /^(rgba?\(\s*)[\d.]+(\s*,\s*|\s+)[\d.]+(\s*,\s*|\s+)[\d.]+(.*)$/is.exec(original);
  return m ? `${m[1]}${bytes[0]}${m[2]}${bytes[1]}${m[3]}${bytes[2]}${m[4]}` : original;
}

// The ruler's starting width for a JavaScript number, so 1080 moves in useful steps as 0.5 does.
export function jsNumberScale(value: number): number {
  return Math.max(2, 2 * 10 ** Math.floor(Math.log10(Math.abs(value) || 1)));
}

// A JavaScript number from the ruler: whole if it was whole, otherwise to about a pixel of the ruler.
export function formatJsNumber(value: number, original: string, scale: number): string {
  if (!original.includes('.')) return String(Math.round(value));
  const places = Math.min(6, Math.max(1, Math.ceil(-Math.log10(scale / 256))));
  return value.toFixed(places);
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

// A value written after `before`, spaced from a minus sign so `a-0.5` dragged below zero reads `a- -0.3`, not `a--0.3`.
export function spacedAfter(before: string, text: string): string {
  return before === '-' && text.startsWith('-') ? ' ' + text : text;
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
