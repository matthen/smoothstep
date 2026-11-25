// The range of values a shown expression maps from black to full colour: fixed, or found from its values.
export type RangeMode = "unit" | "signed" | "auto";

// The lowest and highest value found, or null when no pixel had a finite one.
export type FoundRange = [number, number] | null;

// Combines the reduction pass's blocks, each (lowest, highest, 1 if it found any, _).
export function combineBlocks(blocks: ArrayLike<number>): FoundRange {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i + 3 < blocks.length; i += 4) {
    const [a, b] = [blocks[i]!, blocks[i + 1]!];
    if (blocks[i + 2]! < 0.5 || !Number.isFinite(a) || !Number.isFinite(b)) continue;
    lo = Math.min(lo, a);
    hi = Math.max(hi, b);
  }
  return lo <= hi ? [lo, hi] : null;
}

// Whether the values are all the same, give or take rounding.
function isConstant([lo, hi]: [number, number]): boolean {
  return hi - lo <= 1e-6 * Math.max(1, Math.abs(lo), Math.abs(hi));
}

// The values that show as 0 and 1. A value that doesn't vary shows against 0 to 1, widened to include it.
export function rangeFor(mode: RangeMode, found: FoundRange): [number, number] {
  if (mode === "signed") return [-1, 1];
  if (mode === "unit" || !found) return [0, 1];
  return isConstant(found) ? [Math.min(0, found[0]), Math.max(1, found[1])] : found;
}

// `value` mapped linearly so the range's ends are 0 and 1.
export function mapToRange(value: number, [lo, hi]: [number, number]): number {
  return (value - lo) / (hi - lo);
}

// `value` rounded to a multiple of `step`, written plainly, or as e.g. 1.2e6 when far from 1.
function roundedTo(value: number, step: number): string {
  const rounded = Math.round(value / step) * step;
  if (rounded === 0) return "0";
  const size = Math.abs(rounded);
  const stepPower = Math.floor(Math.log10(step) + 1e-9);
  if (size < 1e-3 || size >= 1e5) {
    const digits = Math.min(6, Math.max(0, Math.floor(Math.log10(size)) - stepPower));
    return rounded.toExponential(digits).replace(/\.?0+e/, "e").replace("e+", "e");
  }
  return String(Number(rounded.toFixed(Math.min(12, Math.max(0, -stepPower)))));
}

// Two ends rounded to a power of ten below a thirtieth of the gap between them, so "1.4e-5 to 0.768" reads "0 to 0.77".
export function formatRange(lo: number, hi: number): string {
  const step = 10 ** Math.floor(Math.log10((hi - lo) / 30));
  return `${roundedTo(lo, step)} to ${roundedTo(hi, step)}`;
}

// What the bar says Auto found.
export function describeRange(found: FoundRange): string {
  if (!found) return "no values";
  if (!isConstant(found)) return formatRange(found[0], found[1]);
  const size = Math.abs(found[0]);
  return `all ${size === 0 ? "0" : roundedTo(found[0], 10 ** (Math.floor(Math.log10(size)) - 2))}`;
}
