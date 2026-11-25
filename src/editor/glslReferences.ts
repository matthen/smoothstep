// Every use of one of the user's names, and renaming it, across the GLSL tabs.
import { isGlobal, nameAt, resolve, topLevel, type Analysis, type Declaration, type Range } from './glslDefinitions';
import { tokenizeGlsl } from './glslLanguage';

// One tab's code. The shared tab's top-level names are seen by every other tab.
export interface Source {
  id: string;
  analysis: Analysis;
  shared: boolean;
}

export interface Target {
  name: string;
  declaration: Declaration;
  // The tab it's declared in.
  home: Source;
  // The tabs it can be used in.
  sources: Source[];
}

export interface Reference extends Range {
  source: Source;
}

// The name at `pos` in `current`, and where it can be used. `sources` are all the GLSL tabs.
export function targetAt(sources: Source[], current: Source, pos: number): Target | null {
  const name = nameAt(current.analysis, pos);
  if (!name) return null;
  const declaration = resolve(current.analysis, pos);
  if (declaration) {
    const everywhere = current.shared && isGlobal(current.analysis, declaration);
    return { name: name.text, declaration, home: current, sources: everywhere ? sources : [current] };
  }
  const shared = sources.find((s) => s.shared && s !== current);
  const elsewhere = shared && topLevel(shared.analysis, name.text);
  return elsewhere ? { name: name.text, declaration: elsewhere, home: shared, sources } : null;
}

// Overloads and prototypes of a top-level function are all one name.
const isFunction = (analysis: Analysis, d: Declaration | null, name: string) =>
  d !== null && d.kind === 'function' && d.name === name && isGlobal(analysis, d);

function refersTo(target: Target, source: Source, pos: number): boolean {
  const { name, declaration, home } = target;
  const found = resolve(source.analysis, pos);
  const overload = isFunction(home.analysis, declaration, name) && isFunction(source.analysis, found, name);
  if (source === home) return found !== null && (found.from === declaration.from || overload);
  // Another tab uses the shared name unless it declares its own there.
  return found === null || overload;
}

export function findReferences(target: Target): Reference[] {
  const out: Reference[] = [];
  for (const source of target.sources) {
    for (const t of source.analysis.tokens) {
      if (t.text === target.name && nameAt(source.analysis, t.from)?.from === t.from && refersTo(target, source, t.from)) {
        out.push({ source, from: t.from, to: t.to });
      }
    }
  }
  return out;
}

// A struct's field, whose uses after a dot can't be told apart from other structs' fields.
function isField(analysis: Analysis, d: Declaration): boolean {
  if (d.kind !== 'variable') return false;
  const i = analysis.tokens.findIndex((t) => t.from === d.scope.from);
  return analysis.tokens[i]?.text === '{' && analysis.tokens[i - 2]?.text === 'struct';
}

// Why the name can't be renamed at all, if it can't.
export function renameRefusal(target: Target): string | null {
  return isField(target.home.analysis, target.declaration) ? "A struct's fields can't be renamed." : null;
}

// Words GLSL keeps for itself beyond its keywords, types and built-ins, and `main`, which wraps mainImage.
const RESERVED = new Set((
  'main switch case default layout flat smooth centroid invariant precise sample patch buffer shared coherent ' +
  'volatile restrict readonly writeonly subroutine common partition active asm class union enum typedef template ' +
  'this goto inline noinline public static extern external interface long short double half fixed unsigned ' +
  'superp input output sizeof cast namespace using true false'
).split(' '));

const isValidName = (name: string) => /^[A-Za-z_]\w*$/.test(name);

// Whether GLSL already means something by `name`: a keyword, type or built-in.
export function isGlslWord(name: string): boolean {
  if (RESERVED.has(name) || name.startsWith('gl_') || name.includes('__')) return true;
  const tokens = tokenizeGlsl(name)[0] ?? [];
  return tokens.length !== 1 || tokens[0]!.type !== 'variableName';
}

const overlaps = (a: Range, b: Range) => a.from < b.to && b.from < a.to;

// Why `target` can't become `newName`, or null if it can. `sources` are all the GLSL tabs.
export function renameProblem(target: Target, newName: string, sources: Source[]): string | null {
  if (!isValidName(newName)) return 'A name has letters, digits and _, and starts with a letter or _.';
  if (isGlslWord(newName)) return `${newName} is part of GLSL. Choose another name.`;
  if (newName === target.name) return null;
  // The shared tab's top-level names are seen everywhere.
  const shared = sources.find((s) => s.shared);
  if (shared && !target.sources.includes(shared) && topLevel(shared.analysis, newName)) {
    return `${newName} is already a name in ${shared.id}.`;
  }
  for (const source of target.sources) {
    const scope = source === target.home ? target.declaration.scope : { from: 0, to: source.analysis.length };
    if (source.analysis.declarations.some((d) => d.name === newName && overlaps(d.scope, scope))) {
      return `${newName} is already a name in ${source.id}.`;
    }
  }
  return null;
}
