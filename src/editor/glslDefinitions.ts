// Finds where a name in GLSL code is declared: a function, macro, struct, variable or parameter.
import { isBuiltinType, tokenizeGlsl, USER_NAME_TOKENS, type GlslToken } from './glslLanguage';

export interface Range {
  from: number;
  to: number;
}

interface Tok extends Range {
  text: string;
  type: GlslToken | null;
}

type DeclarationKind = 'function' | 'macro' | 'struct' | 'variable' | 'parameter';

export interface Declaration extends Range {
  name: string;
  kind: DeclarationKind;
  // Where it can be used.
  scope: Range;
  // A function with a body, rather than a prototype.
  body: boolean;
}

export interface Analysis {
  code: string;
  tokens: Tok[];
  declarations: Declaration[];
  length: number;
}

// The code's tokens with their offsets, leaving out spaces and comments.
function tokensOf(code: string): Tok[] {
  const out: Tok[] = [];
  let offset = 0;
  for (const line of tokenizeGlsl(code)) {
    for (const t of line) {
      if (t.type !== 'comment' && t.text.trim()) out.push({ text: t.text, type: t.type, from: offset, to: offset + t.text.length });
      offset += t.text.length;
    }
    offset++;
  }
  return out;
}

const isName = (t: Tok | undefined) =>
  t !== undefined && (USER_NAME_TOKENS.has(t.type ?? '') || (t.type === 'typeName' && !isBuiltinType(t.text)));
const isType = (t: Tok | undefined) => t?.type === 'typeName';

// The end of the preprocessor line at `pos`, following `\` continuations.
function logicalLineEnd(code: string, pos: number): number {
  let end = code.indexOf('\n', pos);
  while (end > 0 && code[end - 1] === '\\') end = code.indexOf('\n', end + 1);
  return end < 0 ? code.length : end;
}

// The index of the bracket closing the one at `open`, or the last token.
function closing(tokens: Tok[], open: number): number {
  const [o, c] = tokens[open]!.text === '(' ? ['(', ')'] : ['{', '}'];
  let depth = 0;
  for (let i = open; i < tokens.length; i++) {
    if (tokens[i]!.text === o) depth++;
    else if (tokens[i]!.text === c && --depth === 0) return i;
  }
  return tokens.length - 1;
}

export function analyse(code: string): Analysis {
  const tokens = tokensOf(code);
  const whole = { from: 0, to: code.length };
  const declarations: Declaration[] = [];
  const declare = (t: Tok, kind: DeclarationKind, scope: Range, body = false) =>
    declarations.push({ name: t.text, kind, from: t.from, to: t.to, scope, body });
  // The blocks open at each token, innermost last.
  const blocks: Range[] = [];
  const scope = () => blocks.at(-1) ?? whole;
  const handled = new Set<number>();

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    const prev = tokens[i - 1];
    const next = tokens[i + 1];
    if (t.text === '{') {
      blocks.push({ from: t.from, to: tokens[closing(tokens, i)]!.to });
      continue;
    }
    if (t.text === '}') {
      blocks.pop();
      continue;
    }
    // mainImage is a built-in name, but its parameters are the user's.
    const mainImage = t.text === 'mainImage' && t.type === 'variableName.standard';
    if (handled.has(i) || !(isName(t) || mainImage)) continue;
    if (prev?.type === 'meta' && /^#\s*define$/.test(prev.text)) {
      declare(t, 'macro', whole);
      if (next?.text === '(' && next.from === t.to) {
        const lineScope = { from: t.from, to: logicalLineEnd(code, t.from) };
        for (let j = i + 2; j < closing(tokens, i + 1); j++) {
          if (isName(tokens[j])) declare(tokens[j]!, 'parameter', lineScope);
        }
      }
      continue;
    }
    if (prev?.text === 'struct') {
      declare(t, 'struct', scope());
      continue;
    }
    if (!isType(prev) || tokens[i - 2]?.text === '.') continue;
    // A function: its parameters are known in its body, or only in its brackets for a prototype.
    if (next?.text === '(' && blocks.length === 0) {
      const close = closing(tokens, i + 1);
      const hasBody = tokens[close + 1]?.text === '{';
      if (!mainImage) declare(t, 'function', whole, hasBody);
      const paramScope = hasBody ?
        { from: tokens[close + 1]!.from, to: tokens[closing(tokens, close + 1)]!.to } :
        { from: next.from, to: tokens[close]!.to };
      for (let j = i + 2; j < close; j++) {
        if (isName(tokens[j]) && isType(tokens[j - 1])) {
          declare(tokens[j]!, 'parameter', paramScope);
          handled.add(j);
        }
      }
      continue;
    }
    if (mainImage) continue;
    // A variable, and any more declared after commas in the same statement, as in `float a = f(x, y), b;`.
    declare(t, 'variable', scope());
    for (let j = i + 1, depth = 0; j < tokens.length; j++) {
      const text = tokens[j]!.text;
      if (text === '(' || text === '[') depth++;
      else if (text === ')' || text === ']') {
        if (--depth < 0) break;
      } else if (text === ';' || text === '{' || text === '}') break;
      else if (text === ',' && depth === 0 && isName(tokens[j + 1])) {
        declare(tokens[j + 1]!, 'variable', scope());
        handled.add(j + 1);
      }
    }
  }
  return { code, tokens, declarations, length: code.length };
}

// The name at `pos`, or just before it as when the cursor is at a word's end, if it's one of the user's.
export function nameAt(analysis: Analysis, pos: number): Tok | null {
  const { tokens } = analysis;
  const i = tokens.findIndex((t) => t.from <= pos && pos <= t.to && (pos < t.to || !tokens.some((u) => u.from === pos)));
  const t = tokens[i];
  // A field or swizzle after a dot isn't declared on its own.
  return t && isName(t) && tokens[i - 1]?.text !== '.' ? t : null;
}

const size = (r: Range) => r.to - r.from;

// The declaration `pos` is in or refers to: the nearest enclosing one in scope, else the first in the code.
export function findDefinition(analysis: Analysis, pos: number): Declaration | null {
  const name = nameAt(analysis, pos);
  if (!name) return null;
  const same = analysis.declarations.filter((d) => d.name === name.text);
  const own = same.find((d) => d.from === name.from);
  if (own) return own;
  const global = (d: Declaration) => size(d.scope) === analysis.length;
  const visible = same.filter((d) => d.scope.from <= pos && pos <= d.scope.to && (global(d) || d.from <= pos));
  visible.sort((a, b) => size(a.scope) - size(b.scope) || Number(b.body) - Number(a.body) || b.from - a.from);
  return visible[0] ?? topLevel(analysis, name.text) ?? same[0] ?? null;
}

// A declaration of `name` that the whole code can see, preferring a function's body to its prototype.
export function topLevel(analysis: Analysis, name: string): Declaration | null {
  const same = analysis.declarations.filter((d) => d.name === name && isGlobal(analysis, d));
  return same.find((d) => d.body) ?? same[0] ?? null;
}

const isGlobal = (analysis: Analysis, d: Declaration) => size(d.scope) === analysis.length;

export interface Description {
  signature: string;
  // The `//` comment lines just above it.
  comment: string;
}

const MAX_SIGNATURE = 120;

// How a function, macro, struct or global is declared, with its comment, for a popup. Locals and
// parameters are declared close by, so they have none.
export function describe(analysis: Analysis, d: Declaration): Description | null {
  if (d.kind === 'parameter' || (d.kind === 'variable' && !isGlobal(analysis, d))) return null;
  const { code, tokens } = analysis;
  const lineStart = code.lastIndexOf('\n', d.from - 1) + 1;
  let end: number;
  if (d.kind === 'function') {
    const i = tokens.findIndex((t) => t.from === d.from);
    end = tokens[closing(tokens, i + 1)]!.to;
  } else if (d.kind === 'macro') {
    end = logicalLineEnd(code, d.from);
  } else if (d.kind === 'struct') {
    end = d.to;
  } else {
    const semicolon = code.indexOf(';', d.to);
    end = semicolon < 0 ? code.indexOf('\n', d.to) : semicolon + 1;
  }
  let signature = code.slice(lineStart, end < 0 ? code.length : end).replace(/\\\n/g, ' ').replace(/\s+/g, ' ').trim();
  if (signature.length > MAX_SIGNATURE) signature = signature.slice(0, MAX_SIGNATURE - 1) + '…';
  const comment: string[] = [];
  for (let to = lineStart - 1; to > 0; ) {
    const from = code.lastIndexOf('\n', to - 1) + 1;
    const line = code.slice(from, to).trim();
    if (!line.startsWith('//')) break;
    comment.unshift(line.replace(/^\/\/\s?/, ''));
    to = from - 1;
  }
  return { signature, comment: comment.join(' ') };
}
