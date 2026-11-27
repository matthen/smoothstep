// The pieces of a Canvas2D layer's worker runtime, which workerSource puts in its script as source text.
import { makeDeterministic } from './deterministic';
import { lockdown } from './lockdown';
import { installConsole, makeLogger } from './logger';
import { makeModules } from './modules';
import { makeTimers } from './timers';

export const workerParts = {lockdown, makeTimers, makeLogger, installConsole, makeModules, makeDeterministic};

export type WorkerParts = typeof workerParts;

// The parts as an object literal in source text. Each must survive toString() and minifying, so
// none may use anything from outside its own body.
export function workerPartsSource(): string {
  return "{" + Object.entries(workerParts).map(([name, part]) => `${name}: ${part.toString()}`).join(", ") + "}";
}
