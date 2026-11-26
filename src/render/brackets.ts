// Checks that a tab's braces and parentheses pair up, outside comments and strings, before it's
// compiled. Otherwise the app's code after it would be read as part of an unclosed function, and
// GLSL's errors would be about that instead.
import type { LineError } from '../lib/types';

const CLOSERS: Record<string, string> = {"{": "}", "(": ")"};
const OPENERS: Record<string, string> = {"}": "{", ")": "("};

function unclosed(open: string): string {
  return `This ${open} is never closed. Add a ${CLOSERS[open]} to end it.`;
}

function stray(close: string): string {
  return `This ${close} has no ${OPENERS[close]} before it to close. Remove it, or add the ${OPENERS[close]} it ends.`;
}

// The first unpaired brace or parenthesis, as one error on its line (from 0), or null if they all pair up.
export function bracketError(code: string): LineError | null {
  const open: {char: string; line: number}[] = [];
  let line = 0;
  for (let i = 0; i < code.length; i++) {
    const char = code[i]!;
    const next = code[i + 1];
    if (char === "\n") {
      line++;
    } else if (char === "/" && next === "/") {
      while (i + 1 < code.length && code[i + 1] !== "\n") {
        i++;
      }
    } else if (char === "/" && next === "*") {
      const end = code.indexOf("*/", i + 2);
      const comment = code.slice(i, end < 0 ? code.length : end + 2);
      line += comment.split("\n").length - 1;
      i += comment.length - 1;
    } else if (char === "\"") {
      // GLSL has no strings, but a #include or #error line may quote text.
      while (i + 1 < code.length && code[i + 1] !== "\"" && code[i + 1] !== "\n") {
        i++;
      }
      i++;
      if (code[i] === "\n") {
        line++;
      }
    } else if (char in CLOSERS) {
      open.push({char, line});
    } else if (char in OPENERS) {
      const last = open.pop();
      if (!last) {
        return {line, message: stray(char)};
      }
      if (last.char !== OPENERS[char]) {
        return {line: last.line, message: unclosed(last.char)};
      }
    }
  }
  const last = open.pop();
  return last ? {line: last.line, message: unclosed(last.char)} : null;
}
