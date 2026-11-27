// Collects a Canvas2D layer's console calls in its worker and sends them to the app together, ahead
// of any other message, so they arrive in order. A run of the same call is kept as one with a count,
// and past maxLogs they're only counted. The worker gets these as source text, so they must not use
// anything from outside their own bodies.
import type { FromWorker, LogLevel, WorkerLog } from '../runtime';

type Callback = (...args: unknown[]) => void;

export function makeLogger({formatLog, maxLogs, post, setTimeout}: {
  formatLog(args: readonly unknown[]): string;
  maxLogs: number;
  // Sends the message, or says it can't yet, so the logs wait.
  post(message: Extract<FromWorker, {type: "logs"}>): boolean;
  setTimeout(callback: () => void, ms: number): unknown;
}) {
  // Taken now, before the code could replace it.
  const ErrorType = Error;
  let logs: WorkerLog[] = [];
  let dropped = 0;
  let due = false;
  let logging = false;
  let frame: number | null = null;
  let time: number | null = null;
  const flush = () => {
    due = false;
    if ((logs.length > 0 || dropped > 0) && post({type: "logs", logs, dropped})) {
      logs = [];
      dropped = 0;
    }
  };
  // The lines of the worker's script in the call's stack, innermost first.
  const stackLines = (): number[] => {
    try {
      const stack = new ErrorType().stack ?? "";
      return stack.split("\n").flatMap(line => {
        const match = /:(\d+):\d+\)?\s*$/.exec(line);
        return match ? [Number(match[1])] : [];
      });
    } catch {
      return [];
    }
  };
  const log = (level: LogLevel, args: unknown[]) => {
    // Formatting can run the code's own getters, which may log too.
    if (logging) {
      return;
    }
    logging = true;
    try {
      const last = logs[logs.length - 1];
      if (dropped > 0) {
        dropped++;
      } else {
        const text = formatLog(args);
        const lines = stackLines();
        if (last && last.level === level && last.text === text && last.lines.join() === lines.join()) {
          last.count++;
          last.frame = frame;
          last.time = time;
        } else if (logs.length >= maxLogs) {
          dropped++;
        } else {
          logs.push({level, text, frame, time, lines, count: 1});
        }
      }
      if (!due) {
        due = true;
        setTimeout(flush, 0);
      }
    } finally {
      logging = false;
    }
  };
  return {
    log, flush,
    // The step being drawn and its time, which each call is logged with.
    setStep(stepFrame: number, stepTime: number) {
      frame = stepFrame;
      time = stepTime;
    },
  };
}

// Sends the code's console calls to `log`, and still to the worker's own console, so devtools shows
// them even from a loop that never ends.
export function installConsole(
  global: Record<string, unknown>, log: (level: LogLevel, args: unknown[]) => void, apply: typeof Reflect.apply,
) {
  const consoleObject = (global.console ?? {}) as Record<string, unknown>;
  global.console = consoleObject;
  ([["log", "log"], ["debug", "log"], ["dir", "log"], ["trace", "log"], ["info", "info"], ["warn", "warn"],
    ["error", "error"]] as const).forEach(([name, level]) => {
    const original = consoleObject[name];
    consoleObject[name] = (...args: unknown[]) => {
      if (typeof original === "function") {
        apply(original as Callback, consoleObject, args);
      }
      log(level, args);
    };
  });
  const originalAssert = consoleObject.assert;
  consoleObject.assert = (condition: unknown, ...args: unknown[]) => {
    if (typeof originalAssert === "function") {
      apply(originalAssert as Callback, consoleObject, [condition, ...args]);
    }
    if (!condition) {
      log("error", ["Assertion failed" + (args.length > 0 ? ":" : ""), ...args]);
    }
  };
}
