// The font families a Canvas2D layer can draw text with: the same ones as the font textures. The
// files are in public/fonts/, copied there by tools/buildLayerAssets.mjs.

const LATIN = "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F," +
  "U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD";
const GREEK = "U+0370-0377,U+037A-037F,U+0384-038A,U+038C,U+038E-03A1,U+03A3-03FF";

export interface FontFile {
  family: string;
  file: string;
  // A CSS font-weight: one weight, or a variable font's range.
  weight: string;
  unicodeRange: string;
}

const DEFAULT_FONT_FAMILY = "Inter";

export const FONT_FILES: readonly FontFile[] = [
  {family: "Inter", file: "inter-latin-wght-normal.woff2", weight: "100 900", unicodeRange: LATIN},
  {family: "Inter", file: "inter-greek-wght-normal.woff2", weight: "100 900", unicodeRange: GREEK},
  {family: "Arimo", file: "arimo-latin-wght-normal.woff2", weight: "400 700", unicodeRange: LATIN},
  {family: "Arimo", file: "arimo-greek-wght-normal.woff2", weight: "400 700", unicodeRange: GREEK},
  {family: "Exo 2", file: "exo-2-latin-wght-normal.woff2", weight: "100 900", unicodeRange: LATIN},
  {family: "Tinos", file: "tinos-latin-400-normal.woff2", weight: "400", unicodeRange: LATIN},
  {family: "Tinos", file: "tinos-latin-700-normal.woff2", weight: "700", unicodeRange: LATIN},
  {family: "Tinos", file: "tinos-greek-400-normal.woff2", weight: "400", unicodeRange: GREEK},
  {family: "Courier Prime", file: "courier-prime-latin-400-normal.woff2", weight: "400", unicodeRange: LATIN},
  {family: "Courier Prime", file: "courier-prime-latin-700-normal.woff2", weight: "700", unicodeRange: LATIN},
];

export const FONT_FAMILIES: readonly string[] = [...new Set(FONT_FILES.map(font => font.family))];

// A font's bytes with what the worker needs to register it.
export interface FontData extends Omit<FontFile, "file"> {
  data: ArrayBuffer;
}

// The files for the families the code names, in any case as CSS allows, and the default one. Only these load.
export function fontFilesUsed(code: string): FontFile[] {
  const lower = code.toLowerCase();
  return FONT_FILES.filter(font => font.family === DEFAULT_FONT_FAMILY || lower.includes(font.family.toLowerCase()));
}
