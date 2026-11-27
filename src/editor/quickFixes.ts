// One-click fixes for common GLSL compile errors: from an error's message, the code and the error's
// line, the edit that fixes it, or null unless that edit is certain to be the one meant.

interface Change {
  from: number;
  to: number;
  insert: string;
}

export interface QuickFix {
  // Says exactly what the edit does, for its button.
  label: string;
  changes: Change[];
}

// A line of the code, with its comments blanked out so positions stay put.
interface CodeLine {
  from: number;
  text: string;
}

// A whole int literal, not part of a name, a float like 1.5 or 1e3, a hex number or an unsigned 1u.
const INT = String.raw`(?<![\w.])\d+(?![\w.])`;

// How tightly each operator binds, lowest number first, as in GLSL. Anything that ends an expression,
// like ; or ), counts as binding loosest.
const PRECEDENCE: Record<string, number> = {
  "*": 3, "/": 3, "%": 3, "+": 4, "-": 4, "<<": 5, ">>": 5, "<": 6, ">": 6, "<=": 6, ">=": 6, "==": 7, "!=": 7,
  "&": 8, "^": 9, "|": 10, "&&": 11, "^^": 12, "||": 13, "?": 15, ":": 15,
  "=": 16, "+=": 16, "-=": 16, "*=": 16, "/=": 16, "%=": 16,
};
const LOOSEST = 99;
const OPERATORS = Object.keys(PRECEDENCE).sort((a, b) => b.length - a.length);

// Built-in functions with no int version, and min, max and clamp, whose int versions an int literal
// next to a float can't be using.
const FLOAT_FUNCTIONS = new Set([
  "pow", "exp", "log", "exp2", "log2", "sqrt", "inversesqrt", "sin", "cos", "tan", "asin", "acos", "atan",
  "sinh", "cosh", "tanh", "radians", "degrees", "floor", "ceil", "fract", "round", "trunc", "mod", "mix", "step",
  "smoothstep", "length", "distance", "dot", "normalize", "cross", "reflect", "refract", "faceforward",
  "min", "max", "clamp",
]);

function blankComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, comment => comment.replace(/[^\n]/g, " "));
}

function codeLines(code: string): CodeLine[] {
  let from = 0;
  return blankComments(code).split("\n").map(text => {
    const line = {from, text};
    from += text.length + 1;
    return line;
  });
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// How tightly the token starting at `at` binds: an operator's precedence, or LOOSEST for the end of the
// line or a token that ends an expression. Null for anything else, such as a name or a bracket that opens.
function precedenceAt(text: string, at: number, closers: string): number | null {
  const rest = text.slice(at).trimStart();
  if (rest === "" || closers.includes(rest[0]!)) {
    return LOOSEST;
  }
  const op = OPERATORS.find(o => rest.startsWith(o));
  return op === undefined ? null : PRECEDENCE[op]!;
}

// The same, for the token that ends just before `at`.
function precedenceBefore(text: string, at: number): number | null {
  const before = text.slice(0, at).trimEnd();
  if (before === "" || "(,[{;".includes(before.at(-1)!) || /\breturn$/.test(before)) {
    return LOOSEST;
  }
  const op = OPERATORS.find(o => before.endsWith(o));
  return op === undefined ? null : PRECEDENCE[op]!;
}

// "Change 2 to 2.0", or "Change 0 and 1 to 0.0 and 1.0".
function toFloats(line: CodeLine, literals: {index: number; digits: string}[]): QuickFix {
  const list = (items: string[]) => items.length === 1 ? items[0]! :
    items.slice(0, -1).join(", ") + " and " + items.at(-1)!;
  const digits = literals.map(l => l.digits);
  return {
    label: `Change ${list(digits)} to ${list(digits.map(d => d + ".0"))}`,
    changes: literals.map(l => ({from: line.from + l.index + l.digits.length, to: line.from + l.index + l.digits.length,
      insert: ".0"})),
  };
}

const OPERAND_TYPES = /^'([^']+)' : wrong operand types - no operation '[^']+' exists that takes a left-hand operand of type '([^']*)' and a right operand of type '([^']*)'/;

// A float and an int literal either side of an operator, as in `x * 2` or `2 * x`.
function intOperand(message: string, line: CodeLine): QuickFix | null {
  const match = OPERAND_TYPES.exec(message);
  if (!match) {
    return null;
  }
  const [, op, left, right] = match as unknown as [string, string, string, string];
  const prec = PRECEDENCE[op];
  const intOnRight = right === "const int" && left.includes("float");
  const intOnLeft = left === "const int" && right.includes("float");
  if (prec === undefined || !(intOnRight || intOnLeft)) {
    return null;
  }
  // The operator, not part of a longer one, and the literal beside it.
  const opPattern = String.raw`(?<![-+*/%<>=!&|^])${escape(op)}(?![-+*/%<>=!&|^])`;
  const pattern = intOnRight ? new RegExp(`${opPattern}\\s*(?:-\\s*)?(${INT})`, "dg") :
    new RegExp(`(${INT})\\s*${opPattern}`, "dg");
  const found = [...line.text.matchAll(pattern)].filter(m => {
    const [start, end] = m.indices![1]!;
    if (intOnRight) {
      const next = precedenceAt(line.text, end, ";),]}");
      return next !== null && next >= prec;
    }
    // A minus before the literal belongs to it.
    const before = line.text.slice(0, start).trimEnd();
    const from = before.endsWith("-") && precedenceBefore(before, before.length - 1) !== null ? before.length - 1 : start;
    const previous = precedenceBefore(line.text, from);
    return previous !== null && previous > prec;
  });
  if (found.length !== 1) {
    return null;
  }
  const [start] = found[0]!.indices![1]!;
  return toFloats(line, [{index: start, digits: found[0]![1]!}]);
}

const ASSIGN_INT = /^'(?:=|assign)' : cannot convert from 'const int' to '(?:(?:out|inout|highp|mediump|lowp) )*float'$/;

// An int literal given to a float, as in `float x = 1;` or `x += 1;`.
function intAssigned(message: string, line: CodeLine): QuickFix | null {
  if (!ASSIGN_INT.test(message)) {
    return null;
  }
  const pattern = new RegExp(String.raw`(?<![-+*/%<>=!&|^])[-+*/%]?=(?!=)\s*(?:-\s*)?(${INT})\s*[;,]`, "dg");
  const found = [...line.text.matchAll(pattern)];
  if (found.length !== 1) {
    return null;
  }
  return toFloats(line, [{index: found[0]!.indices![1]![0], digits: found[0]![1]!}]);
}

// The arguments of the call whose ( is at `open`, with where each starts, or null if it doesn't close on the line.
function callArguments(text: string, open: number): {index: number; text: string}[] | null {
  const args: {index: number; text: string}[] = [];
  let depth = 0;
  let start = open + 1;
  for (let i = open; i < text.length; i++) {
    const char = text[i]!;
    if ("([".includes(char)) {
      depth++;
    } else if (")]".includes(char)) {
      depth--;
    }
    if ((char === "," && depth === 1) || depth === 0) {
      args.push({index: start, text: text.slice(start, i)});
      start = i + 1;
    }
    if (depth === 0) {
      return args;
    }
  }
  return null;
}

const NO_OVERLOAD = /^'(\w+)' : no matching overloaded function found$/;

// Int literals given to a function that takes floats, as in `pow(x, 2)`.
function intArguments(message: string, line: CodeLine): QuickFix | null {
  const name = NO_OVERLOAD.exec(message)?.[1];
  if (name === undefined || !FLOAT_FUNCTIONS.has(name)) {
    return null;
  }
  const calls = [...line.text.matchAll(new RegExp(String.raw`(?<![\w.])${name}\s*\(`, "g"))];
  if (calls.length !== 1) {
    return null;
  }
  const args = callArguments(line.text, calls[0]!.index + calls[0]![0].length - 1);
  const literals = (args ?? []).flatMap(arg => {
    const literal = /^\s*(?:-\s*)?(\d+)\s*$/d.exec(arg.text);
    return literal && new RegExp(`^${INT}$`).test(literal[1]!) ?
      [{index: arg.index + literal.indices![1]![0], digits: literal[1]!}] : [];
  });
  return literals.length > 0 ? toFloats(line, literals) : null;
}

const VECTOR_SIZES = /^'(?:=|assign)' : cannot convert from '(?:\w+ )*?(\d)-component vector of float' to '((?:\w+ )*?)(\d)-component vector of float'$/;
// `lhs = rhs;` alone on a line, where lhs is a declaration or something like `fragColor.rgb`.
const ASSIGNMENT = /^(\s*(?:(?:const|highp|mediump|lowp)\s+)*(?:\w+\s+)?[\w.[\]]+\s*=\s*)([^;=]+?)\s*;\s*$/d;

// Whether an expression can take a swizzle without brackets, like `texture(t, uv)` or `c.rg`.
function isPostfix(expression: string): boolean {
  let rest = expression.trim();
  for (let before = ""; before !== rest;) {
    before = rest;
    rest = rest.replace(/\([^()]*\)|\[[^[\]]*\]/g, "");
  }
  return /^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*$/.test(rest);
}

// A vector of the wrong size: a bigger one cut down with a swizzle, or a vec3 given to a vec4 out
// parameter like fragColor, with an alpha of 1.
function vectorSize(message: string, line: CodeLine): QuickFix | null {
  const sizes = VECTOR_SIZES.exec(message);
  const statement = ASSIGNMENT.exec(line.text);
  if (!sizes || !statement) {
    return null;
  }
  const from = Number(sizes[1]);
  const to = Number(sizes[3]);
  const rhs = statement[2]!;
  const [start, end] = statement.indices![2]!;
  if (from > to) {
    const swizzle = "." + "xyzw".slice(0, to);
    return isPostfix(rhs) ?
      {label: `Add ${swizzle}`, changes: [{from: line.from + end, to: line.from + end, insert: swizzle}]} :
      {label: `Change to (…)${swizzle}`, changes: [
        {from: line.from + start, to: line.from + start, insert: "("},
        {from: line.from + end, to: line.from + end, insert: ")" + swizzle},
      ]};
  }
  if (from === 3 && to === 4 && sizes[2]!.split(" ").includes("out")) {
    return {label: "Change to vec4(…, 1.0)", changes: [
      {from: line.from + start, to: line.from + start, insert: "vec4("},
      {from: line.from + end, to: line.from + end, insert: ", 1.0)"},
    ]};
  }
  return null;
}

// Whether a line's brackets all close on it.
function balanced(text: string): boolean {
  let depth = 0;
  for (const char of text) {
    depth += "([".includes(char) ? 1 : ")]".includes(char) ? -1 : 0;
    if (depth < 0) {
      return false;
    }
  }
  return depth === 0;
}

// Whether a line could end a statement that's missing its ;. It mustn't end in a way that carries on to
// the next line, like an operator or an open bracket, or be a line that needs no ;, like `if (x)`.
function endsStatement(text: string): boolean {
  const trimmed = text.trim();
  const last = trimmed.at(-1)!;
  const endsInOperator = "+-*/%=<>!&|^?:,.".includes(last) && !/\d\.$/.test(trimmed);
  return !endsInOperator && !";{}([".includes(last) && !trimmed.startsWith("#") && balanced(trimmed) &&
    !/^(?:if|for|while|else|do|switch)\b/.test(trimmed) && !/^\w+\s+\w+\s*\([^=]*\)$/.test(trimmed);
}

const SYNTAX_ERROR = /^'([^']+)' : syntax error$/;

// A syntax error at the start of a line, after a line that ends without its ;.
function missingSemicolon(message: string, lines: CodeLine[], index: number): QuickFix | null {
  const token = SYNTAX_ERROR.exec(message)?.[1];
  const line = lines[index];
  if (token === undefined || !line?.text.trimStart().startsWith(token)) {
    return null;
  }
  const afterToken = line.text.trimStart().slice(token.length);
  if (/\w$/.test(token) && /^\w/.test(afterToken)) {
    return null;
  }
  const previous = lines.slice(0, index).findLastIndex(l => l.text.trim() !== "");
  const before = lines[previous];
  if (!before || !endsStatement(before.text)) {
    return null;
  }
  const at = before.from + before.text.trimEnd().length;
  return {label: `Add ; to the end of line ${previous + 1}`, changes: [{from: at, to: at, insert: ";"}]};
}

// The fix for an error on `line` (from 0) of `code`, or null if there isn't a certain one.
export function quickFix(message: string, code: string, line: number): QuickFix | null {
  const lines = codeLines(code);
  const errorLine = lines[line];
  if (!errorLine) {
    return null;
  }
  return intOperand(message, errorLine) ?? intAssigned(message, errorLine) ?? intArguments(message, errorLine) ??
    vectorSize(message, errorLine) ?? missingSemicolon(message, lines, line);
}
