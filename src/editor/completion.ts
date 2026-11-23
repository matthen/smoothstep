import type { Completion, CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import { Facet } from '@codemirror/state';
import { HINT_WORDS } from './glslLanguage';
import { glslSnippetCompletions } from './snippets';

const WORD_RE = /[a-zA-Z][\w$]*/g;
const NEARBY_LINES = 500;

// How the tab's code reads what it drew last frame, for the feedback snippet.
export const lastFrameName = Facet.define<string, string>({ combine: (values) => values[0] ?? 'iPrevFrame' });

// Built-ins then words from up to 500 lines around the cursor, that start with `prefix`, in the old editor's order.
export function completionCandidates(lines: readonly string[], cursorLine: number, prefix: string): string[] {
  const found = HINT_WORDS.filter((w) => w.startsWith(prefix));
  const seen = new Set(HINT_WORDS);
  const first = Math.max(0, cursorLine - NEARBY_LINES);
  const last = Math.min(lines.length - 1, cursorLine + NEARBY_LINES);
  const order: number[] = [];
  for (let line = cursorLine; line >= first; line--) order.push(line);
  for (let line = cursorLine + 1; line <= last; line++) order.push(line);
  for (const line of order) {
    for (const [word] of lines[line]!.matchAll(WORD_RE)) {
      if (line === cursorLine && word === prefix) continue;
      if (word.startsWith(prefix) && !seen.has(word)) {
        seen.add(word);
        found.push(word);
      }
    }
  }
  return found;
}

export function glslCompletionSource(context: CompletionContext): CompletionResult | null {
  const word = context.matchBefore(/[a-zA-Z][\w$]*/);
  if (!word || (word.from === word.to && !context.explicit)) return null;
  const { doc } = context.state;
  const line = doc.lineAt(context.pos);
  const lines: string[] = [];
  const first = Math.max(1, line.number - NEARBY_LINES);
  const last = Math.min(doc.lines, line.number + NEARBY_LINES);
  for (let n = first; n <= last; n++) lines.push(doc.line(n).text);
  const words = completionCandidates(lines, line.number - first, word.text);
  const snippets = glslSnippetCompletions(context.state.facet(lastFrameName))
    .filter((s) => s.label.startsWith(word.text));
  const options: Completion[] = [...words.map((label) => ({ label })), ...snippets];
  if (!options.length) return null;
  return { from: word.from, options, filter: false };
}
