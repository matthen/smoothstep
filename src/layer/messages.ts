// Checks what a Canvas2D layer's worker sends. The worker runs the user's code, so nothing it sends is
// taken on trust: a message of the wrong shape is null, and fields are cut down to a sensible size.
import type { FromWorker, LogLevel, WorkerLog } from './runtime';

const LEVELS: readonly LogLevel[] = ["log", "info", "warn", "error"];
const MAX_LOGS = 1000;
const MAX_LOG_LINES = 50;
const MAX_LOG_TEXT = 2000;
const MAX_MESSAGE = 500;
const MAX_STACK = 5000;

type Fields = Partial<Record<string, unknown>>;

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function checkLog(item: unknown): WorkerLog | null {
  const log = item as Fields | null;
  if (typeof log !== "object" || log === null || typeof log.text !== "string" || !LEVELS.includes(log.level as LogLevel)) {
    return null;
  }
  const lines = Array.isArray(log.lines) ? (log.lines as unknown[]).slice(0, MAX_LOG_LINES) : [];
  return {
    level: log.level as LogLevel, text: log.text.slice(0, MAX_LOG_TEXT), frame: finite(log.frame), time: finite(log.time),
    lines: lines.filter(line => typeof line === "number"), count: Math.max(1, Math.floor(finite(log.count) ?? 1)),
  };
}

export function checkFromWorker(data: unknown): FromWorker | null {
  if (typeof data !== "object" || data === null) {
    return null;
  }
  const message = data as Fields;
  switch (message.type) {
    case "ready":
      return {
        type: "ready", registered: message.registered === true, hasDraw: message.hasDraw === true,
        stoppedEarly: message.stoppedEarly === true,
      };
    case "drawing":
      return typeof message.frame === "number" && Number.isInteger(message.frame) ? {type: "drawing", frame: message.frame} : null;
    case "frame":
      return message.bitmap instanceof ImageBitmap && typeof message.id === "number"
        ? {type: "frame", id: message.id, bitmap: message.bitmap} : null;
    case "error":
      return {
        type: "error",
        message: typeof message.message === "string" ? message.message.slice(0, MAX_MESSAGE) : "",
        stack: typeof message.stack === "string" ? message.stack.slice(0, MAX_STACK) : "",
        line: typeof message.line === "number" ? message.line : null,
      };
    case "logs":
      return {
        type: "logs",
        logs: (Array.isArray(message.logs) ? message.logs as unknown[] : []).slice(0, MAX_LOGS).flatMap(item => checkLog(item) ?? []),
        dropped: Math.max(0, Math.floor(finite(message.dropped) ?? 0)),
      };
    default:
      return null;
  }
}

// What a worker's "ready" says about its code's first run: it set up a draw function, set up none,
// returned before setting anything up, or threw, whose error arrives on its own.
export type ReadyOutcome = "draws" | "no draw" | "stopped early" | "threw";

export function readyOutcome(message: Extract<FromWorker, {type: "ready"}>): ReadyOutcome {
  if (message.registered) {
    return message.hasDraw ? "draws" : "no draw";
  }
  return message.stoppedEarly ? "stopped early" : "threw";
}
