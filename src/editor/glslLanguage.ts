// GLSL as a CodeMirror stream language: a port of CodeMirror 5's clike mode configured for GLSL.
import { StreamLanguage, StringStream, type StreamParser } from '@codemirror/language';

// With its extension, as the docs build loads this in Node.
import { MAX_BUFFERS } from '../lib/document.ts';

const KEYWORDS = (
  'sampler1D sampler2D sampler3D samplerCube sampler1DShadow sampler2DShadow ' +
  'const attribute uniform varying break continue discard return ' +
  'for while do if else struct in out inout'
).split(' ');

const TYPES = 'float int bool void vec2 vec3 vec4 ivec2 ivec3 ivec4 bvec2 bvec3 bvec4 mat2 mat3 mat4'.split(' ');

const UNIFORMS = [
  'iFrame', 'iTime', 'iPrevFrame', 'iResolution', 'iDuration', 'iCanvas2D',
  ...Array.from({ length: 8 }, (_, i) => `iTexture${i}`),
  ...Array.from({ length: 16 }, (_, i) => `iFloat${i}`),
  ...Array.from({ length: MAX_BUFFERS }, (_, i) => `iBuffer${i}`),
];

const BUILTINS = [
  ...UNIFORMS,
  'mainImage',
  ...(
    'acos acosh asin asinh atan atanh cos cosh degrees radians sin sinh tan tanh ' +
    'abs ceil clamp dFdx dFdy exp exp2 floor fma fract fwidth inversesqrt isinf isnan log log2 max min mix mod modf ' +
    'pow round roundEven sign smoothstep sqrt step trunc ' +
    'floatBitsToInt frexp intBitsToFloat ldexp packHalf2x16 packUnorm unpackHalf2x16 unpackUnorm ' +
    'cross distance dot equal faceforward length normalize notEqual reflect refract ' +
    'all any greaterThan greaterThanEqual lessThan lessThanEqual not ' +
    'texelFetch texelFetchOffset texture textureGather textureGatherOffset textureGrad textureGradOffset textureLod ' +
    'textureLodOffset textureOffset textureProj textureProjGrad textureProjGradOffset textureProjLod ' +
    'textureProjLodOffset textureProjOffset textureSize ' +
    'determinant groupMemoryBarrier inverse matrixCompMult outerProduct transpose ' +
    'bitCount bitfieldExtract bitfieldInsert bitfieldReverse findLSB findMSB uaddCarry umulExtended usubBorrow'
  ).split(' '),
];

const ATOMS = ['true', 'false'];

// Completion words in the old editor's order.
export const HINT_WORDS = [...new Set([...BUILTINS, ...KEYWORDS, ...TYPES, ...ATOMS])];

const keywordSet = new Set(KEYWORDS);
const typeSet = new Set(TYPES);
const builtinSet = new Set(BUILTINS);
const atomSet = new Set(ATOMS);
const blockKeywords = new Set('for while do if else struct'.split(' '));

// Token names are CodeMirror highlight tag names, so syntax nodes carry them too. `meta` is a
// preprocessor directive, and `variableName.local` a function's or macro's parameter.
export type GlslToken =
  | 'keyword' | 'typeName' | 'variableName.standard' | 'atom' | 'number' | 'comment' | 'string'
  | 'meta' | 'operator' | 'variableName' | 'variableName.function' | 'variableName.local' | 'macroName';

// The class each token is coloured with, in the editor, the tutorial and the docs.
export const GLSL_TOKEN_CLASSES: Record<GlslToken, string> = {
  keyword: 'tok-keyword', typeName: 'tok-type', 'variableName.standard': 'tok-builtin', variableName: 'tok-variable',
  'variableName.function': 'tok-function', 'variableName.local': 'tok-parameter', macroName: 'tok-macro',
  atom: 'tok-atom', number: 'tok-number', comment: 'tok-comment', string: 'tok-string', meta: 'tok-meta',
  operator: 'tok-operator',
};

// The user's own names, which can be clicked through to where they're declared.
export const USER_NAME_TOKENS: ReadonlySet<string> =
  new Set<GlslToken>(['variableName', 'variableName.function', 'variableName.local', 'macroName']);

export const isBuiltinType = (name: string) => typeSet.has(name);

// Directives whose whole line is one token.
const plainDirectives = new Set(['version', 'extension', 'pragma', 'line', 'error']);
// Directives followed by a macro's name.
const namingDirectives = new Set(['define', 'undef', 'ifdef', 'ifndef']);

const INDENT_UNIT = 2;
const number = /^(?:0x[a-f\d]+|0b[01]+|(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?)(u|ll?|l|f)?/i;
const isPunctuationChar = /[[\]{}(),;:.]/;
const isOperatorChar = /[+\-*&%=<>!?|/]/;
const isIdentifierChar = /[\w$_\xa1-￿]/;

interface Context {
  indented: number;
  column: number;
  type: string;
  info: string | null;
  align: boolean | null;
  prev: Context | null;
}

type Tokenizer = (stream: StringStream, state: GlslState) => GlslToken | null;

export interface GlslState {
  tokenize: Tokenizer | null;
  context: Context;
  indented: number;
  startOfLine: boolean;
  prevToken: string | null;
  // Names #defined so far, and struct types declared so far. Replaced, never mutated, so copies can share them.
  macros: readonly string[];
  structs: readonly string[];
  // The enclosing function's parameters, and a function-like macro's on its own lines.
  params: readonly string[];
  macroParams: readonly string[];
  // How far through a function definition: its name, its parameter list, between `)` and `{`, or its body.
  header: 'none' | 'name' | 'params' | 'after' | 'body';
  headerParams: readonly string[];
  bodyDepth: number;
  braceDepth: number;
  parenDepth: number;
  structNext: boolean;
  // On a preprocessor line: its directive, whether the macro's name comes next, and whether it ends in `\`.
  directive: string | null;
  macroNameNext: boolean;
  continued: boolean;
}

let curPunc: string | null = null;

function pushContext(state: GlslState, column: number, type: string, info: string | null = null): Context {
  let indent = state.indented;
  if (state.context.type === 'statement' && type !== 'statement') indent = state.context.indented;
  return (state.context = { indented: indent, column, type, info, align: null, prev: state.context });
}

function popContext(state: GlslState): Context {
  const t = state.context.type;
  if (t === ')' || t === ']' || t === '}') state.indented = state.context.indented;
  return (state.context = state.context.prev ?? state.context);
}

function tokenComment(stream: StringStream, state: GlslState): GlslToken {
  let maybeEnd = false;
  for (let ch = stream.next(); ch; ch = stream.next()) {
    if (ch === '/' && maybeEnd) {
      state.tokenize = null;
      break;
    }
    maybeEnd = ch === '*';
  }
  return 'comment';
}

function tokenString(quote: string): Tokenizer {
  return (stream, state) => {
    let escaped = false;
    for (let next = stream.next(); next != null; next = stream.next()) {
      if (next === quote && !escaped) break;
      escaped = !escaped && next === '\\';
    }
    state.tokenize = null;
    return 'string';
  };
}

function tokenPreprocessor(stream: StringStream, state: GlslState): GlslToken {
  let next: Tokenizer | null = null;
  for (let ch; (ch = stream.peek()); ) {
    if (ch === '\\' && stream.match(/^.$/)) {
      next = tokenPreprocessor;
      break;
    } else if (ch === '/' && stream.match(/^\/[/*]/, false)) {
      break;
    }
    stream.next();
  }
  state.tokenize = next;
  return 'meta';
}

// The `#directive` starting a preprocessor line. The rest of the line is code, except after a plain directive.
function tokenDirective(stream: StringStream, state: GlslState): GlslToken {
  stream.eatSpace();
  const directive = stream.match(/^\w*/) as RegExpMatchArray;
  state.directive = directive[0];
  if (plainDirectives.has(state.directive)) return tokenPreprocessor(stream, state);
  state.macroNameNext = namingDirectives.has(state.directive);
  return 'meta';
}

// The macro's name after #define, #ifdef and the like. A function-like macro's parameters count for its lines.
function tokenMacroName(stream: StringStream, state: GlslState, name: string): GlslToken {
  state.macroNameNext = false;
  if (state.directive !== 'define') return 'macroName';
  if (!state.macros.includes(name)) state.macros = [...state.macros, name];
  const params = stream.match(/^\(([^)]*)\)/, false) as RegExpMatchArray | null;
  if (!params) return 'macroName';
  state.macroParams = params[1]!.split(',').map((p) => p.trim()).filter(Boolean);
  return 'variableName.function';
}

function tokenIdentifier(stream: StringStream, state: GlslState, name: string): GlslToken {
  if (state.macroNameNext) return tokenMacroName(stream, state, name);
  if (state.directive !== null && name === 'defined') return 'meta';
  if (state.structNext) {
    if (!state.structs.includes(name)) state.structs = [...state.structs, name];
    return 'typeName';
  }
  if (state.params.includes(name) || state.macroParams.includes(name)) return 'variableName.local';
  if (state.header === 'params' && state.prevToken === 'typeName') {
    state.headerParams = [...state.headerParams, name];
    return 'variableName.local';
  }
  if (state.structs.includes(name)) return 'typeName';
  // A function-like macro's call has no space before its `(`.
  if (state.macros.includes(name)) return stream.match(/^\(/, false) ? 'variableName.function' : 'macroName';
  return stream.match(/^\s*\(/, false) ? 'variableName.function' : 'variableName';
}

function tokenBase(stream: StringStream, state: GlslState): GlslToken | null {
  const ch = stream.next() ?? '';
  if (ch === '#' && state.startOfLine) return tokenDirective(stream, state);
  if (ch === '\\' && state.directive !== null) {
    state.continued = stream.eol();
    return null;
  }
  if (ch === '"' || ch === "'") {
    state.tokenize = tokenString(ch);
    return state.tokenize(stream, state);
  }
  if (/[\d.]/.test(ch)) {
    stream.backUp(1);
    if (stream.match(number)) return 'number';
    stream.next();
  }
  if (isPunctuationChar.test(ch)) {
    curPunc = ch;
    return null;
  }
  if (ch === '/') {
    if (stream.eat('*')) {
      state.tokenize = tokenComment;
      return tokenComment(stream, state);
    }
    if (stream.eat('/')) {
      stream.skipToEnd();
      return 'comment';
    }
  }
  if (isOperatorChar.test(ch)) {
    while (!stream.match(/^\/[/*]/, false) && stream.eat(isOperatorChar)) {
      // Consume the whole operator.
    }
    return 'operator';
  }
  stream.eatWhile(isIdentifierChar);
  const cur = stream.current();
  if (keywordSet.has(cur)) {
    if (blockKeywords.has(cur)) curPunc = 'newstatement';
    return 'keyword';
  }
  if (typeSet.has(cur)) return 'typeName';
  if (builtinSet.has(cur)) return 'variableName.standard';
  if (atomSet.has(cur)) return 'atom';
  return tokenIdentifier(stream, state, cur);
}

// Follows function definitions, so their parameters are known in their bodies.
function trackHeader(state: GlslState, style: GlslToken | null) {
  switch (state.header) {
    case 'name':
      state.header = curPunc === '(' ? 'params' : 'none';
      break;
    case 'params':
      if (curPunc === ')' && state.parenDepth === 0) state.header = 'after';
      else if (curPunc === '{' || curPunc === ';') state.header = 'none';
      break;
    case 'after':
      if (curPunc === '{') {
        state.header = 'body';
        state.params = state.headerParams;
        state.bodyDepth = state.braceDepth - 1;
      } else state.header = 'none';
      break;
    case 'body':
      if (curPunc === '}' && state.braceDepth === state.bodyDepth) {
        state.header = 'none';
        state.params = [];
      }
      break;
  }
  // mainImage is a built-in name, but the user defines it.
  const named = style === 'variableName.function' || style === 'variableName.standard';
  if (named && state.prevToken === 'typeName' && state.braceDepth === 0) {
    state.header = 'name';
    state.headerParams = [];
  }
}

// Resets curPunc here rather than in token(), where TS would then narrow it to null across the tokenizer call.
function readToken(stream: StringStream, state: GlslState): GlslToken | null {
  curPunc = null;
  return (state.tokenize ?? tokenBase)(stream, state);
}

const glslParser: StreamParser<GlslState> = {
  name: 'glsl',
  startState: () => ({
    tokenize: null,
    context: { indented: -INDENT_UNIT, column: 0, type: 'top', info: null, align: false, prev: null },
    indented: 0,
    startOfLine: true,
    prevToken: null,
    macros: [],
    structs: [],
    params: [],
    macroParams: [],
    header: 'none',
    headerParams: [],
    bodyDepth: 0,
    braceDepth: 0,
    parenDepth: 0,
    structNext: false,
    directive: null,
    macroNameNext: false,
    continued: false,
  }),
  copyState: (state) => {
    const copyContext = (c: Context | null): Context | null => c && { ...c, prev: copyContext(c.prev) };
    return { ...state, context: copyContext(state.context)! };
  },
  token(stream, state) {
    let ctx = state.context;
    if (stream.sol()) {
      if (ctx.align == null) ctx.align = false;
      state.indented = stream.indentation();
      state.startOfLine = true;
      if (state.continued) state.continued = false;
      else if (state.directive !== null) {
        state.directive = null;
        state.macroNameNext = false;
        state.macroParams = [];
      }
    }
    if (stream.eatSpace()) return null;
    const style = readToken(stream, state);
    if (style === 'comment') return style;
    // Preprocessor lines don't open blocks or statements.
    if (state.directive !== null) {
      state.startOfLine = false;
      state.prevToken = style ?? curPunc;
      return style;
    }
    if (style === 'meta') return style;
    if (ctx.align == null) ctx.align = true;

    // Brackets left open by half-typed code are forgotten at the next brace.
    if (curPunc === '{' || curPunc === '}') state.parenDepth = 0;
    if (curPunc === '{') state.braceDepth++;
    else if (curPunc === '}') state.braceDepth = Math.max(0, state.braceDepth - 1);
    else if (curPunc === '(') state.parenDepth++;
    else if (curPunc === ')') state.parenDepth = Math.max(0, state.parenDepth - 1);
    trackHeader(state, style);
    state.structNext = style === 'keyword' && stream.current() === 'struct';

    if (curPunc === ';' || curPunc === ':' || (curPunc === ',' && stream.match(/^\s*(?:\/\/.*)?$/, false))) {
      while (state.context.type === 'statement') popContext(state);
    } else if (curPunc === '{') pushContext(state, stream.column(), '}');
    else if (curPunc === '[') pushContext(state, stream.column(), ']');
    else if (curPunc === '(') pushContext(state, stream.column(), ')');
    else if (curPunc === '}') {
      while (ctx.type === 'statement') ctx = popContext(state);
      if (ctx.type === '}') ctx = popContext(state);
      while (ctx.type === 'statement') ctx = popContext(state);
    } else if (curPunc === ctx.type) popContext(state);
    else if (
      ((ctx.type === '}' || ctx.type === 'top') && curPunc !== ';') ||
      (ctx.type === 'statement' && curPunc === 'newstatement')
    ) {
      pushContext(state, stream.column(), 'statement', stream.current());
    }
    state.startOfLine = false;
    state.prevToken = style ?? curPunc;
    return style;
  },
  indent(state, textAfter) {
    if (state.tokenize != null) return null;
    let ctx = state.context;
    const firstChar = textAfter.charAt(0);
    const closing = firstChar === ctx.type;
    if (ctx.type === 'statement' && firstChar === '}') ctx = ctx.prev ?? ctx;
    if (ctx.type === 'statement') return ctx.indented + (firstChar === '{' ? 0 : INDENT_UNIT);
    if (ctx.align) return ctx.column + (closing ? 0 : 1);
    if (ctx.type === ')' && !closing) return ctx.indented + INDENT_UNIT;
    return ctx.indented + (closing ? 0 : INDENT_UNIT);
  },
  languageData: {
    commentTokens: { line: '//', block: { open: '/*', close: '*/' } },
    indentOnInput: /^\s*[{}]$/,
    closeBrackets: { brackets: ['(', '[', '{', "'", '"'] },
  },
};

export const glslLanguage = StreamLanguage.define(glslParser);

export interface Token {
  text: string;
  type: GlslToken | null;
}

// Tokenises code line by line, for tests and for finding the token under a click.
export function tokenizeGlsl(code: string): Token[][] {
  const state = glslParser.startState!(INDENT_UNIT);
  return code.split('\n').map((line) => {
    const tokens: Token[] = [];
    const stream = new StringStream(line, 2, INDENT_UNIT);
    if (!line) glslParser.blankLine?.(state, INDENT_UNIT);
    while (!stream.eol()) {
      stream.start = stream.pos;
      const type = glslParser.token(stream, state) as GlslToken | null;
      tokens.push({ text: stream.current(), type });
    }
    return tokens;
  });
}
