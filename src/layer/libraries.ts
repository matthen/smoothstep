// The libraries a Canvas2D layer can use, and the `import` lines that ask for them. The files are
// in public/libs/, made by tools/buildLayerAssets.mjs.
import type { LineError } from '../lib/types';

interface Library {
  // What it's imported as, which is also its file's name in public/libs/.
  name: string;
  title: string;
  url: string;
  licence: string;
  // What it's for, and a line that imports it, for Help.
  about: string;
  example: string;
}

export const LIBRARIES: readonly Library[] = [
  {name: "planck", title: "planck.js", url: "https://piqnt.com/planck.js/", licence: "MIT",
    about: "2D physics (a JavaScript Box2D)", example: 'import planck from "planck";'},
  {name: "matter-js", title: "matter.js", url: "https://brm.io/matter-js/", licence: "MIT",
    about: "2D physics", example: 'import Matter from "matter-js";'},
  {name: "simplex-noise", title: "simplex-noise", url: "https://github.com/jwagner/simplex-noise.js", licence: "MIT",
    about: "Smooth noise in 2D, 3D and 4D", example: 'import {createNoise2D} from "simplex-noise";'},
  {name: "d3-delaunay", title: "d3-delaunay", url: "https://github.com/d3/d3-delaunay", licence: "ISC",
    about: "Delaunay triangulations and Voronoi diagrams", example: 'import {Delaunay} from "d3-delaunay";'},
];

// Other names people write for them.
const ALIASES: Record<string, string> = {
  "planck-js": "planck", "planck.js": "planck", "matter": "matter-js", "matter.js": "matter-js",
};

function libraryNamed(name: string): Library | undefined {
  const known = ALIASES[name.toLowerCase()] ?? name.toLowerCase();
  return LIBRARIES.find(library => library.name === known);
}

export interface ParsedImports {
  // The code with each import line turned into a line that reads the library, so line numbers hold.
  code: string;
  // The libraries to put in the worker, by name.
  libraries: string[];
  errors: LineError[];
}

const NAME = "[A-Za-z_$][\\w$]*";
export const IMPORT_LINE = /^\s*import\s+(?:(.+?)\s+from\s+)?(["'])([^"']*)\2\s*;?\s*(?:\/\/.*)?$/;
const DEFAULT_CLAUSE = new RegExp(`^(${NAME})$`);
const NAMESPACE_CLAUSE = new RegExp(`^\\*\\s*as\\s+(${NAME})$`);
const NAMED_ONE = `${NAME}(?:\\s+as\\s+${NAME})?`;
const NAMED_CLAUSE = new RegExp(`^\\{\\s*((?:${NAMED_ONE}(?:\\s*,\\s*${NAMED_ONE})*\\s*,?)?)\\s*\\}$`);

// What an import clause, like `planck`, `* as planck` or `{Delaunay, Voronoi as V}`, declares.
function declarations(clause: string, read: string): string[] | null {
  const parts = clause.includes("{") ? clause.split(/,(?=\s*\{)/) : clause.split(/,(?=\s*\*)/);
  const out: string[] = [];
  for (const part of parts.map(p => p.trim())) {
    const byDefault = DEFAULT_CLAUSE.exec(part);
    const namespace = NAMESPACE_CLAUSE.exec(part);
    const named = NAMED_CLAUSE.exec(part);
    if (byDefault) {
      out.push(`${byDefault[1]} = ${read.replace(")", ", true)")}`);
    } else if (namespace) {
      out.push(`${namespace[1]} = ${read}`);
    } else if (named) {
      const names = named[1]!.split(",").map(n => n.trim()).filter(Boolean).map(n => n.replace(/\s+as\s+/, ": "));
      out.push(`{${names.join(", ")}} = ${read}`);
    } else {
      return null;
    }
  }
  return out;
}

// Reads the import lines at the top of a layer's code. Only comments and blank lines may come
// before or between them.
export function parseImports(code: string): ParsedImports {
  const lines = code.split("\n");
  const libraries: string[] = [];
  const errors: LineError[] = [];
  let inComment = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const trimmed = line.trim();
    if (inComment) {
      inComment = !trimmed.includes("*/");
      continue;
    }
    if (trimmed === "" || trimmed.startsWith("//")) {
      continue;
    }
    if (trimmed.startsWith("/*")) {
      inComment = !trimmed.includes("*/");
      continue;
    }
    const match = IMPORT_LINE.exec(line);
    if (!match) {
      if (/^import\b/.test(trimmed)) {
        errors.push({line: i, message: 'Imports are written on one line, like: import planck from "planck";'});
        continue;
      }
      break;
    }
    const library = libraryNamed(match[3]!);
    if (!library) {
      errors.push({line: i, message: `There's no built-in library called "${match[3]}". ` +
        "The libraries are " + LIBRARIES.map(l => l.name).join(", ") + "."});
      continue;
    }
    const read = `__smoothstep.lib(${JSON.stringify(library.name)})`;
    const declared = match[1] === undefined ? [] : declarations(match[1], read);
    if (!declared) {
      errors.push({line: i, message: 'Imports are written like: import planck from "planck";'});
      continue;
    }
    if (!libraries.includes(library.name)) {
      libraries.push(library.name);
    }
    lines[i] = declared.length > 0 ? `const ${declared.join(", ")};` : read + ";";
  }
  return {code: lines.join("\n"), libraries, errors};
}
