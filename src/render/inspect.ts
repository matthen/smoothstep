// Text for the pixel inspector: colours, values and coordinates.
import type { ProbeType } from './probe';

// A number with three decimals, or in exponent form when that would hide it.
export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return Number.isNaN(value) ? "NaN" : value > 0 ? "inf" : "-inf";
  }
  const size = Math.abs(value);
  return size !== 0 && (size < 0.001 || size >= 1e5) ? value.toExponential(2) : value.toFixed(3);
}

// A value of `type` as it'd be written in GLSL, from the numbers read back.
export function formatValue(values: readonly number[], type: ProbeType): string {
  const parts = values.map(v => type === "bool" ? String(v > 0.5) :
    /^(?:u?int|ivec\d)$/.test(type) ? String(Math.round(v)) : formatNumber(v));
  return parts.length === 1 ? parts[0]! : `${type}(${parts.join(", ")})`;
}

// A colour from 0 to 1 as #rrggbb.
export function hexColor(color: readonly number[]): string {
  return "#" + color.slice(0, 3).map(c => Math.round(Math.min(1, Math.max(0, c)) * 255).toString(16).padStart(2, "0")).join("");
}

// The pixel under a point `x`, `y` CSS pixels from the canvas's top left, counted from the bottom left
// as GL does, for a canvas `width` by `height` in CSS pixels that draws `pixels` across and down.
export function pixelAt(x: number, y: number, width: number, height: number, pixels: [number, number]): [number, number] {
  const [w, h] = pixels;
  return [
    Math.min(w - 1, Math.max(0, Math.floor(x / width * w))),
    Math.min(h - 1, Math.max(0, Math.floor((1 - y / height) * h))),
  ];
}
