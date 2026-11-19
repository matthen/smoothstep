// GLSL as a CodeMirror stream language: a port of CodeMirror 5's clike mode configured for GLSL.
import { StreamLanguage, StringStream, type StreamParser } from '@codemirror/language';

export const KEYWORDS = (
  'sampler1D sampler2D sampler3D samplerCube sampler1DShadow sampler2DShadow ' +
  'const attribute uniform varying break continue discard return ' +
  'for while do if else struct in out inout'
).split(' ');

export const TYPES = 'float int bool void vec2 vec3 vec4 ivec2 ivec3 ivec4 bvec2 bvec3 bvec4 mat2 mat3 mat4'.split(' ');

export const UNIFORMS = [
  'iFrame', 'iTime', 'iPrevFrame', 'iResolution', 'iDuration',
  ...Array.from({ length: 8 }, (_, i) => `iTexture${i}`),
  ...Array.from({ length: 16 }, (_, i) => `iFloat${i}`),
];

export const BUILTINS = [
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

export const ATOMS = ['true', 'false'];

// Completion words in the old editor's order.
export const HINT_WORDS = [...new Set([...BUILTINS, ...KEYWORDS, ...TYPES, ...ATOMS])];

const keywordSet = new Set(KEYWORDS);
const typeSet = new Set(TYPES);
const builtinSet = new Set(BUILTINS);
const atomSet = new Set(ATOMS);
const blockKeywords = new Set('for while do if else struct'.split(' '));

// Token names are CodeMirror highlight tag names, so syntax nodes carry them too.
export type GlslToken =
  | 'keyword' | 'typeName' | 'variableName.standard' | 'atom' | 'number' | 'comment' | 'string'
  | 'meta' | 'operator' | 'variableName';

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
  let ch: string | void;
  while ((ch = stream.next())) {
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
    let next: string | void;
    while ((next = stream.next()) != null) {
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

function tokenBase(stream: StringStream, state: GlslState): GlslToken | null {
  const ch = stream.next() ?? '';
  if (ch === '#' && state.startOfLine) return tokenPreprocessor(stream, state);
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
  return 'variableName';
}

export const glslParser: StreamParser<GlslState> = {
  name: 'glsl',
  startState: () => ({
    tokenize: null,
    context: { indented: -INDENT_UNIT, column: 0, type: 'top', info: null, align: false, prev: null },
    indented: 0,
    startOfLine: true,
    prevToken: null,
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
    }
    if (stream.eatSpace()) return null;
    curPunc = null;
    const style = (state.tokenize ?? tokenBase)(stream, state);
    if (style === 'comment' || style === 'meta') return style;
    if (ctx.align == null) ctx.align = true;

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
