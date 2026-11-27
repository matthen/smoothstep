import { describe, expect, it } from 'vitest';

import type { FromWorker } from '../runtime';
import { installConsole, makeLogger } from './logger';

type LogsMessage = Extract<FromWorker, {type: "logs"}>;

function logger({maxLogs = 10, canPost = true, formatLog = (args: readonly unknown[]) => args.join(" ")} = {}) {
  const sent: LogsMessage[] = [];
  const due: (() => void)[] = [];
  const state = {canPost};
  const made = makeLogger({
    formatLog, maxLogs,
    post: message => {
      if (state.canPost) {
        sent.push(message);
      }
      return state.canPost;
    },
    setTimeout: callback => due.push(callback),
  });
  return {...made, sent, due, state};
}

describe("makeLogger", () => {
  it("folds the same call in a row into one with a count, keeping the latest step", () => {
    const {log, flush, setStep, sent} = logger();
    for (const frame of [1, 2]) {
      setStep(frame, frame / 60);
      log("log", ["same"]);
    }
    log("warn", ["same"]);
    flush();
    expect(sent[0]?.logs.map(({level, text, frame, count}) => ({level, text, frame, count}))).toEqual([
      {level: "log", text: "same", frame: 2, count: 2},
      {level: "warn", text: "same", frame: 2, count: 1},
    ]);
  });

  it("logs calls before the first step with no step or time", () => {
    const {log, flush, sent} = logger();
    log("info", ["loaded"]);
    flush();
    expect(sent[0]?.logs[0]).toMatchObject({frame: null, time: null});
  });

  it("keeps up to its limit, counting the rest", () => {
    const {log, flush, sent} = logger({maxLogs: 3});
    for (let i = 0; i < 10; i++) {
      log("log", [i]);
    }
    flush();
    expect(sent[0]?.logs.map(l => l.text)).toEqual(["0", "1", "2"]);
    expect(sent[0]?.dropped).toBe(7);
  });

  it("schedules one send for a run of calls", () => {
    const {log, due, sent} = logger();
    log("log", ["a"]);
    log("log", ["b"]);
    expect(due).toHaveLength(1);
    due[0]!();
    expect(sent.map(m => m.logs.length)).toEqual([2]);
  });

  it("keeps the calls until they can be sent", () => {
    const {log, flush, sent, state} = logger({canPost: false});
    log("log", ["early"]);
    flush();
    state.canPost = true;
    flush();
    expect(sent.map(m => m.logs.map(l => l.text))).toEqual([["early"]]);
  });

  it("ignores a call made while formatting another, as a getter that logs would", () => {
    const made = logger({formatLog: args => {
      made.log("log", ["inner"]);
      return String(args[0]);
    }});
    made.log("log", ["outer"]);
    made.flush();
    expect(made.sent[0]?.logs.map(l => l.text)).toEqual(["outer"]);
  });
});

describe("installConsole", () => {
  it("logs each console call at its level, and passes it on to the console that was there", () => {
    const seen: unknown[][] = [];
    const logged: unknown[][] = [];
    const global: Record<string, unknown> = {console: {debug: (...args: unknown[]) => seen.push(args)}};
    installConsole(global, (level, args) => logged.push([level, ...args]), Reflect.apply);
    const console = global.console as Record<string, (...args: unknown[]) => void>;
    console.debug!("x", 1);
    console.assert!(false, "bad");
    console.assert!(true, "fine");
    expect(seen).toEqual([["x", 1]]);
    expect(logged).toEqual([["log", "x", 1], ["error", "Assertion failed:", "bad"]]);
  });
});
