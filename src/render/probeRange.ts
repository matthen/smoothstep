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

// A number short enough for the bar: three significant figures, or exponent form when far from 1.
function shortNumber(value: number): string {
  const size = Math.abs(value);
  if (size !== 0 && (size < 1e-3 || size >= 1e5)) return value.toExponential(1);
  return String(Number(value.toPrecision(3)));
}

// What the bar says Auto found.
export function describeRange(found: FoundRange): string {
  if (!found) return "no values";
  return isConstant(found) ? `all ${shortNumber(found[0])}` : `${shortNumber(found[0])} to ${shortNumber(found[1])}`;
}
