// Showing a selected expression on the canvas. The shader's code gets a call next to the statement the
// expression is in, which keeps its value for main() to output in place of the colour.
import { analyse, findDefinition, type Analysis, type Range } from '../editor/glslDefinitions';

const PROBE_TYPES = ["float", "vec2", "vec3", "vec4", "int", "ivec2", "ivec3", "ivec4", "uint", "bool"] as const;
export type ProbeType = typeof PROBE_TYPES[number];

// How many numbers a value of the type has.
export function probeComponents(type: ProbeType): number {
  const size = /[234]$/.exec(type);
  return size ? Number(size[0]) : 1;
}

// What a pixel the expression never ran for holds: a value no real one is likely to be, which half floats can store.
export const UNREACHED = -65504;

const AS_VEC4: Record<ProbeType, string> = {
  float: "v, 0., 0., 1.", vec2: "v, 0., 1.", vec3: "v, 1.", vec4: "v",
  int: "float(v), 0., 0., 1.", ivec2: "vec2(v), 0., 1.", ivec3: "vec3(v), 1.", ivec4: "vec4(v)",
  uint: "float(v), 0., 0., 1.", bool: "v ? 1. : 0., 0., 0., 1.",
};

// Goes before the shader's code, on one line, so line numbers don't move.
export const PROBE_DECLARATIONS = "vec4 smoothstepProbe; bool smoothstepProbed; " + PROBE_TYPES.map(type =>
  `void smoothstepShow(${type} v) { smoothstepProbe = vec4(${AS_VEC4[type]}); smoothstepProbed = true; } `).join("");

export const PROBE_MAIN = "void main() { smoothstepProbed = false; mainImage(smoothstepColor, gl_FragCoord.xy); " +
  `smoothstepColor = smoothstepProbed ? smoothstepProbe : vec4(${UNREACHED}.); }`;

export type ProbePlan = {
  ok: true;
  // The selection, widened to whole tokens.
  from: number;
  to: number;
  expression: string;
  // Where the call can go, best first: before or after the expression's statement.
  sites: Site[];
  // The function it's in, and the types to try, most likely first.
  functionName: string;
  types: ProbeType[];
} | {ok: false; message: string};

// Where to insert the call, and where to put braces around a statement that has none, so the call
// runs only when it does.
export interface Site {
  at: number;
  braces?: [number, number];
}

const STATEMENT_KEYWORDS = new Set(
  "if else for while do return break continue discard switch case default struct const uniform in out inout precision".split(" "));
const JUMPS = new Set(["return", "break", "continue", "discard"]);
const ASSIGNMENTS = /^(?:[-+*/%&|^]|<<|>>)?=$|^(?:\+\+|--)$/;
const OPEN: Record<string, string> = {"(": ")", "[": "]"};
const CLOSE = new Set([")", "]"]);

const fail = (message: string): ProbePlan => ({ok: false, message});
const NOT_ONE = "Select a single expression, such as a variable or a calculation.";

// Works out where to show the expression selected from `from` to `to` in a shader's code.
export function planProbe(code: string, from: number, to: number, analysis: Analysis = analyse(code)): ProbePlan {
  const tokens = analysis.tokens;
  const first = tokens.findIndex(t => t.to > from);
  let last = -1;
  tokens.forEach((t, i) => { if (t.from < to) last = i; });
  if (first < 0 || last < first || tokens[first]!.from >= to) {
    return fail("Select an expression first.");
  }
  const lineStart = code.lastIndexOf("\n", tokens[first]!.from - 1) + 1;
  if (code.slice(lineStart).trimStart().startsWith("#")) {
    return fail("Select an expression inside a function, not on a # line.");
  }
  const selected = tokens.slice(first, last + 1);
  let depth = 0;
  for (const [i, t] of selected.entries()) {
    if (t.text === ";" || t.text === "{" || t.text === "}" || (t.type === "keyword" && STATEMENT_KEYWORDS.has(t.text))) {
      return fail(NOT_ONE);
    }
    if (t.type === "operator" && ASSIGNMENTS.test(t.text)) {
      return fail("Select an expression that doesn't change a variable.");
    }
    // A type is only an expression as a constructor; before a name it declares a variable.
    if (t.type === "typeName" && selected[i + 1]?.text !== "(" && selected[i + 1]?.text !== "[") {
      return fail(NOT_ONE);
    }
    if (OPEN[t.text]) depth++;
    else if (CLOSE.has(t.text)) depth--;
    else if (t.text === "," && depth === 0) return fail(NOT_ONE);
    if (depth < 0) return fail(NOT_ONE);
  }
  const lastToken = selected.at(-1)!;
  if (depth !== 0 || (selected[0]!.type === "operator" && !/^[-+!~]$/.test(selected[0]!.text)) ||
      lastToken.type === "operator" || lastToken.text === "." || selected[0]!.text === ".") {
    return fail(NOT_ONE);
  }

  // The function body the selection is in.
  const body = enclosingBody(analysis, first);
  if (!body) {
    return fail("Select an expression inside a function.");
  }
  const sites = insertionSites(analysis, first, last, body);
  const from2 = selected[0]!.from;
  const to2 = lastToken.to;
  return {
    ok: true, from: from2, to: to2, expression: code.slice(from2, to2), sites, functionName: body.name,
    types: orderTypes(guessType(analysis, from2, to2)),
  };
}

interface Body extends Range {
  // Token indices of its braces.
  open: number;
  close: number;
  name: string;
}

// The top-level function body around token `index`, if any.
function enclosingBody({tokens}: Analysis, index: number): Body | null {
  let depth = 0;
  let open = -1;
  for (let i = 0; i < tokens.length; i++) {
    const text = tokens[i]!.text;
    if (text === "{" && depth++ === 0) open = i;
    else if (text === "}" && --depth === 0) {
      if (open < index && index < i) {
        // A function's body follows its parameters' closing bracket.
        if (tokens[open - 1]?.text !== ")") return null;
        let d = 0;
        let j = open - 1;
        for (; j >= 0; j--) {
          if (tokens[j]!.text === ")") d++;
          else if (tokens[j]!.text === "(" && --d === 0) break;
        }
        return {from: tokens[open]!.from, to: tokens[i]!.to, open, close: i, name: tokens[j - 1]?.text ?? ""};
      }
    }
  }
  return null;
}

// Places to insert the call, best first.
function insertionSites({tokens}: Analysis, first: number, last: number, body: Body): Site[] {
  // The outermost bracket around the selection, if it's in one: a for loop's brackets hold `;`s too.
  let outer = -1;
  let depth = 0;
  for (let i = first - 1; i > body.open; i--) {
    const text = tokens[i]!.text;
    if ((text === "{" || text === "}") && depth === 0) break;
    if (CLOSE.has(text)) depth++;
    else if (OPEN[text]) {
      if (depth === 0) outer = i;
      else depth--;
    }
  }
  const header = outer >= 0 ? tokens[outer - 1]?.text : undefined;
  const inHeader = header === "if" || header === "while" || header === "for" || header === "switch";
  // A statement's first token: the one after the last `;` or brace outside brackets before `index`.
  let start = body.open + 1;
  for (let i = (inHeader ? outer - 1 : outer >= 0 ? outer : first) - 1, d = 0; i > body.open; i--) {
    const text = tokens[i]!.text;
    if (CLOSE.has(text)) d++;
    else if (OPEN[text]) d--;
    else if (d <= 0 && (text === ";" || text === "{" || text === "}")) {
      start = i + 1;
      break;
    }
  }
  // Into the bodies of `if`s, `else`s and loops without braces, which get braces so the call runs only with them.
  let braced = false;
  for (;;) {
    const text = tokens[start]!.text;
    if (text === "else") {
      start++;
    } else if (CONTROL.has(text) && tokens[start + 1]?.text === "(" && matching(tokens, start + 1) < first) {
      start = matching(tokens, start + 1) + 1;
    } else {
      break;
    }
    braced = true;
  }
  const end = statementEnd(tokens, start, body.close);
  const braces: [number, number] | undefined = braced ? [tokens[start]!.from, tokens[end]!.to] : undefined;
  const before = {at: tokens[start]!.from, braces};
  if (inHeader) {
    const close = matching(tokens, outer);
    const bodyStart = tokens[close + 1]?.text === "{" ? [{at: tokens[close + 1]!.to}] : [];
    // A for loop's variable is only known inside it.
    return header === "for" ? [...bodyStart, before] : [before, ...bodyStart];
  }
  if (tokens[end]!.text !== ";" || tokens.slice(start, end).some(t => JUMPS.has(t.text))) {
    return [before];
  }
  const after = {at: tokens[end]!.to, braces};
  // Before the statement, the expression reads what the statement reads. After it is only for a
  // variable it declares or assigns, or a declaration's whole initialiser.
  const parts = statementParts(tokens, start, end);
  if (parts.targets.some(([a, b]) => a === first && b === last) || parts.values.some(([a, b]) => a === first && b === last)) {
    return [after, before];
  }
  return parts.declaration ? [before, after] : [before];
}

const CONTROL = new Set(["if", "for", "while"]);

// The index of the last token of the statement starting at `start`, which for an `if` includes its `else`.
function statementEnd(tokens: Analysis["tokens"], start: number, limit: number): number {
  const text = tokens[start]?.text;
  if (start >= limit) return limit - 1;
  if (text === "{") {
    for (let i = start, d = 0; i < limit; i++) {
      if (tokens[i]!.text === "{") d++;
      else if (tokens[i]!.text === "}" && --d === 0) return i;
    }
    return limit - 1;
  }
  if (CONTROL.has(text!) && tokens[start + 1]?.text === "(") {
    const end = statementEnd(tokens, matching(tokens, start + 1) + 1, limit);
    return text === "if" && tokens[end + 1]?.text === "else" ? statementEnd(tokens, end + 2, limit) : end;
  }
  for (let i = start, d = 0; i < limit; i++) {
    const t = tokens[i]!.text;
    if (OPEN[t]) d++;
    else if (CLOSE.has(t)) d--;
    else if (d === 0 && (t === ";" || t === "{" || t === "}")) return t === ";" ? i : i - 1;
  }
  return limit - 1;
}

// Token ranges in a simple statement: the names it declares or the variable it assigns, and the
// declarations' initialisers.
function statementParts(tokens: Analysis["tokens"], start: number, end: number) {
  const targets: [number, number][] = [];
  const values: [number, number][] = [];
  let i = start;
  while (tokens[i]?.type === "keyword" && /^(?:const|highp|mediump|lowp)$/.test(tokens[i]!.text)) i++;
  const declaration = tokens[i]?.type === "typeName" && tokens[i + 1]?.text !== "(" && tokens[i + 1]?.text !== ".";
  if (declaration) {
    // Each declarator: a name, maybe an array size, then maybe `=` and its initialiser.
    let j = i + 1;
    while (j < end) {
      if (tokens[j]!.text === "[") j = matching(tokens, j) + 1;
      targets.push([j, j]);
      let k = j + 1;
      if (tokens[k]?.text === "[") k = matching(tokens, k) + 1;
      let next = k;
      for (let d = 0; next < end; next++) {
        const t = tokens[next]!.text;
        if (OPEN[t]) d++;
        else if (CLOSE.has(t)) d--;
        else if (d === 0 && t === ",") break;
      }
      if (tokens[k]?.text === "=" && k + 1 < next) values.push([k + 1, next - 1]);
      j = next + 1;
    }
  } else {
    for (let j = start, d = 0; j < end; j++) {
      const t = tokens[j]!;
      if (OPEN[t.text]) d++;
      else if (CLOSE.has(t.text)) d--;
      else if (d === 0 && /^(?:[-+*/%&|^]|<<|>>)?=$/.test(t.text)) {
        if (j > start) targets.push([start, j - 1]);
        break;
      }
    }
  }
  return {declaration, targets, values};
}

function matching(tokens: Analysis["tokens"], open: number): number {
  let depth = 0;
  for (let i = open; i < tokens.length; i++) {
    if (OPEN[tokens[i]!.text]) depth++;
    else if (CLOSE.has(tokens[i]!.text) && --depth === 0) return i;
  }
  return tokens.length - 1;
}

// The code with the call to show `expression` inserted at `site`, on the same line. With a type, it
// only builds if the expression has that type.
export function withProbe(code: string, site: Site, expression: string, type: ProbeType | null): string {
  const call = type === null ? ` smoothstepShow((${expression})); ` :
    ` { ${type} smoothstepValue = (${expression}); smoothstepShow(smoothstepValue); } `;
  const inserts: [number, string][] = site.braces ?
    [[site.braces[0], " { "], [site.at, call], [site.braces[1], " } "]] : [[site.at, call]];
  let out = "";
  let pos = 0;
  for (const [at, text] of inserts) {
    out += code.slice(pos, at) + text;
    pos = at;
  }
  return out + code.slice(pos);
}

// The guess first, then the likely types before the rare ones.
const TYPE_ORDER: ProbeType[] = ["float", "vec2", "vec3", "vec4", "int", "bool", "ivec2", "ivec3", "ivec4", "uint"];
function orderTypes(guess: ProbeType | null): ProbeType[] {
  return guess ? [guess, ...TYPE_ORDER.filter(t => t !== guess)] : [...TYPE_ORDER];
}

// `name`, and the functions in `code` that call it, directly or through each other.
export function sharedCallers(code: string, name: string): string[] {
  const {tokens} = analyse(code);
  // Each function's name, and the names it calls.
  const calls = new Map<string, Set<string>>();
  for (let i = 0, depth = 0, current: Set<string> | null = null; i < tokens.length; i++) {
    const text = tokens[i]!.text;
    if (text === "{" && depth++ === 0 && tokens[i - 1]?.text === ")") {
      current = new Set();
      calls.set(tokens[closingBackwards(tokens, i - 1) - 1]?.text ?? "", current);
    } else if (text === "}" && --depth === 0) {
      current = null;
    } else if (current && tokens[i + 1]?.text === "(") {
      current.add(text);
    }
  }
  const found = new Set([name]);
  for (let grew = true; grew;) {
    grew = false;
    for (const [caller, callees] of calls) {
      if (!found.has(caller) && [...callees].some(c => found.has(c))) {
        found.add(caller);
        grew = true;
      }
    }
  }
  return [...found];
}

// The index of the `(` that the `)` at `close` closes.
function closingBackwards(tokens: Analysis["tokens"], close: number): number {
  for (let i = close, depth = 0; i >= 0; i--) {
    if (tokens[i]!.text === ")") depth++;
    else if (tokens[i]!.text === "(" && --depth === 0) return i;
  }
  return 0;
}

// The expression's type, from a compiler's complaint that it can't be converted to the type tried.
export function typeFromError(log: string): ProbeType | null {
  const match = /cannot convert from '(?:const )?(?:(?:high|medium|low)p )?(?:(\d)-component vector of )?(float|int|uint|bool)'/
    .exec(log);
  if (!match) return null;
  const [, size, base] = match;
  if (!size) return base as ProbeType;
  const prefix = base === "float" ? "" : base === "int" ? "i" : null;
  return prefix === null ? null : `${prefix}vec${size}` as ProbeType;
}

const INPUT_TYPES: Record<string, ProbeType> = {
  iTime: "float", iDuration: "float", iResolution: "vec2", iFrame: "int",
};
const FLOAT_FUNCTIONS = new Set(["length", "distance", "dot", "determinant"]);
const VEC4_FUNCTIONS = new Set(["texture", "texelFetch", "textureLod", "textureGrad", "textureProj", "textureOffset"]);
const BOOL_FUNCTIONS = new Set(["all", "any"]);
const SWIZZLE = /^(?:[xyzw]{1,4}|[rgba]{1,4}|[stpq]{1,4})$/;

// A guess at the type of the code from `from` to `to`, from how its names are declared. Building checks it.
export function guessType(analysis: Analysis, from: number, to: number): ProbeType | null {
  const tokens = analysis.tokens.filter(t => t.from >= from && t.to <= to);
  if (tokens.length === 0) return null;
  const [head, second] = [tokens[0]!, tokens[1]];
  const tail = tokens.at(-1)!;
  // A comparison or logic outside brackets makes a bool.
  let depth = 0;
  for (const t of tokens) {
    if (OPEN[t.text]) depth++;
    else if (CLOSE.has(t.text)) depth--;
    else if (depth === 0 && t.type === "operator" && /^(?:[<>]=?|[!=]=|&&|\|\||\^\^|!)$/.test(t.text)) return "bool";
  }
  // A swizzle at the end gives the size.
  if (tokens.length > 2 && tokens.at(-2)!.text === "." && SWIZZLE.test(tail.text)) {
    const n = tail.text.length;
    const base = guessType(analysis, from, tokens.at(-3)!.to);
    const ints = base?.startsWith("i");
    return n === 1 ? (ints ? "int" : "float") : `${ints ? "i" : ""}vec${n}` as ProbeType;
  }
  const whole = tail.text === ")" && second?.text === "(" && closingIndex(tokens, 1) === tokens.length - 1;
  if (whole && head.type === "typeName") {
    return (PROBE_TYPES as readonly string[]).includes(head.text) ? head.text as ProbeType : null;
  }
  if (whole && FLOAT_FUNCTIONS.has(head.text)) return "float";
  if (whole && VEC4_FUNCTIONS.has(head.text)) return "vec4";
  if (whole && BOOL_FUNCTIONS.has(head.text)) return "bool";
  if (tokens.length === 1 || whole) {
    const declared = declaredType(analysis, head.from);
    if (declared) return declared;
    if (tokens.length === 1) return head.type === "number" ? (/[.eE]/.test(head.text) ? "float" : "int") : null;
  }
  // Otherwise the widest vector among its names, outside functions that make a float.
  let widest: ProbeType | null = null;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    if (FLOAT_FUNCTIONS.has(t.text) && tokens[i + 1]?.text === "(") {
      i = closingIndex(tokens, i + 1);
      widest ??= "float";
      continue;
    }
    if (tokens[i - 1]?.text === ".") continue;
    const type = t.type === "typeName" ? t.text as ProbeType : t.type === "number" ? "float" :
      declaredType(analysis, t.from);
    const size = type && PROBE_TYPES.includes(type) && type.includes("vec") ? probeComponents(type) : 1;
    const swizzled = tokens[i + 1]?.text === "." && SWIZZLE.test(tokens[i + 2]?.text ?? "") ? tokens[i + 2]!.text.length : null;
    const n = swizzled ?? size;
    if (type && (widest === null || n > probeComponents(widest))) widest = n === 1 ? "float" : `vec${n}` as ProbeType;
  }
  return widest;
}

function closingIndex(tokens: Analysis["tokens"], open: number): number {
  let depth = 0;
  for (let i = open; i < tokens.length; i++) {
    if (OPEN[tokens[i]!.text]) depth++;
    else if (CLOSE.has(tokens[i]!.text) && --depth === 0) return i;
  }
  return tokens.length - 1;
}

// The type a name at `pos` is declared with, or a function's return type.
function declaredType(analysis: Analysis, pos: number): ProbeType | null {
  const name = analysis.tokens.find(t => t.from === pos);
  if (!name) return null;
  if (INPUT_TYPES[name.text]) return INPUT_TYPES[name.text]!;
  if (/^iFloat\d+$/.test(name.text)) return "float";
  const declaration = findDefinition(analysis, pos);
  if (!declaration) return null;
  const at = analysis.tokens.findIndex(t => t.from === declaration.from);
  // Back past any other names declared before it in the same statement, as in `float a, b`.
  for (let i = at - 1; i >= 0; i--) {
    const t = analysis.tokens[i]!;
    if (t.type === "typeName") return (PROBE_TYPES as readonly string[]).includes(t.text) ? t.text as ProbeType : null;
    if (t.text === ";" || t.text === "{" || t.text === "}" || t.text === "(") return null;
  }
  return null;
}
