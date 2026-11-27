// Puts together the script a Canvas2D layer's worker runs: the runtime, the helpers, the libraries
// the code imports, then the code itself. It also maps errors in that script back to lines of the code.
import type { LineError } from '../lib/types';
import { FORMAT_LIMITS, formatLogWithin } from './formatLog';
import { HELPER_NAMES, makeHelpers } from './helpers';
import { MAX_WORKER_LOGS, workerRuntime, type LogLevel, type WorkerLog } from './runtime';

export interface WorkerSource {
  source: string;
  // The script's line (counting from 1) that holds the code's first line, and how many lines the code has.
  firstLine: number;
  lines: number;
}

// `code` is the layer's code after parseImports; each library is its file's text.
export function workerSource(code: string, libraries: readonly {name: string; code: string}[]): WorkerSource {
  const helpers = HELPER_NAMES.map(name => "__smoothstep.helpers." + name).join(", ");
  const prefix =
    `const __smoothstep = (${workerRuntime.toString()})(${makeHelpers.toString()}, ` +
    `args => (${formatLogWithin.toString()})(args, ${JSON.stringify(FORMAT_LIMITS)}), ${MAX_WORKER_LOGS});\n` +
    libraries.map(library =>
      `__smoothstep.define(${JSON.stringify(library.name)}, function (module, exports) {\n${library.code}\n});\n`).join("") +
    // The runtime runs the code once it has its port. The helpers are parameters of an outer function,
    // so the code can declare its own things with their names.
    `__smoothstep.run(function () { (function (${HELPER_NAMES.join(", ")}) { (function () {\n`;
  const suffix = "\n;__smoothstep.start(typeof setup === \"function\" ? setup : null, " +
    "typeof draw === \"function\" ? draw : null);\n})(); })(" + helpers + "); });\n";
  return {source: prefix + code + suffix, firstLine: prefix.split("\n").length, lines: code.split("\n").length};
}

// The line of the code (counting from 0) that a line of the script is, or null if it's outside the code.
function codeLine(scriptLine: number, source: WorkerSource): number | null {
  const line = scriptLine - source.firstLine;
  return line >= 0 && line < source.lines ? line : null;
}

// A console call from the layer's code, or a run of the same one, on its line of the code.
export interface LayerLog {
  level: LogLevel;
  text: string;
  // The step and its time, or null for code outside setup and draw that ran before the first step.
  frame: number | null;
  time: number | null;
  line: number | null;
  count: number;
}

// The worker's console calls, checked by checkFromWorker, on lines of the code. A call inside a
// library or helper is on the line of the code that called it.
export function logsFromWorker(logs: readonly WorkerLog[], source: WorkerSource): LayerLog[] {
  return logs.map(({lines, ...log}) =>
    ({...log, line: lines.map(line => codeLine(line, source)).find(line => line !== null) ?? null}));
}

function tidy(message: string): string {
  return message.replace(/^Uncaught\s+/, "").trim() || "The Canvas2D code has an error.";
}

// An error the worker couldn't start with, such as a syntax error, from its error event.
export function errorFromEvent(event: {message: string; line: number}, source: WorkerSource): LineError {
  const line = event.line - source.firstLine;
  return {line: Math.max(0, Math.min(source.lines - 1, line)), message: tidy(event.message)};
}

// An error thrown by setup or draw: on the innermost line of the code in its stack, so an error
// inside a library or helper shows on the line that called it.
export function errorFromStack(
  error: {message: string; stack: string; line: number | null}, source: WorkerSource,
): LineError {
  const message = tidy(error.message);
  // Chromium: "at draw (blob:null/…:12:5)". Firefox and Safari: "draw@blob:null/…:12:5".
  for (const frame of error.stack.split("\n")) {
    const match = /:(\d+):\d+\)?\s*$/.exec(frame);
    const line = match ? codeLine(Number(match[1]), source) : null;
    if (line !== null) {
      return {line, message};
    }
  }
  return {line: (error.line === null ? null : codeLine(error.line, source)) ?? 0, message};
}
