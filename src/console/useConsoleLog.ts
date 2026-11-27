// Writes the Console tab's lines about builds and the Canvas2D code, from the preview and from renders.
import { useCallback, useEffect, useRef, useState } from 'react';

import type { ConsoleStore } from './consoleStore';
import type { LayerLog } from '../layer/CanvasLayer';
import type { LineError } from '../lib/types';
import type { CompileResult } from '../render/Renderer';

// Restarts of the Canvas2D code this close together, as for a resize, make one line in the console.
const RESTART_MERGE_MS = 500;
// A build that takes longer than this says how long in the console.
const SLOW_BUILD_MS = 100;
// A restart of the Canvas2D code this soon after the animation loops is the loop's.
const LOOP_RESTART_MS = 1000;

function buildLineText(errors: number, ms: number): string {
  return errors > 0 ? `Build failed: ${errors} ${errors === 1 ? "error" : "errors"}` :
    ms > SLOW_BUILD_MS ? `Built in ${Math.round(ms)} ms` : "Built";
}

// Adds the Canvas2D code's lines to the console, from the preview or a render.
export function logLayer(store: ConsoleStore, logs: LayerLog[], dropped: number, render: boolean) {
  for (const log of logs) {
    store.add({
      level: log.level, text: log.text, tab: "canvas", line: log.line, frame: log.frame, time: log.time,
      count: log.count, render,
    });
  }
  if (dropped > 0) {
    store.add({level: "note", text: `${dropped.toLocaleString("en-GB")} more lines weren't kept`});
  }
}

// What the Console tab says about builds and the Canvas2D code running in the preview. `exporting` says
// whether a render is running, whose lines the preview's would break up.
export function useConsoleLog(store: ConsoleStore, exporting: () => boolean, shown: boolean) {
  // The build the console last started afresh for; a picker drag recompiles without a new build.
  const [consoleBuild, setConsoleBuild] = useState(-1);
  // When the animation last looped, the console's line for the latest build, and its last restart line.
  const loopedAt = useRef(-Infinity);
  const buildLine = useRef<{id: number; shaderErrors: number; ms: number} | null>(null);
  const lastRestart = useRef<{id: number; at: number} | null>(null);
  // The input warnings listed, by their text, with their entries' ids.
  const inputWarningIds = useRef(new Map<string, number>());

  // The console counts its errors as seen while it shows.
  useEffect(() => store.setViewing(shown), [store, shown]);

  const looped = useCallback(() => {loopedAt.current = performance.now();}, []);
  const rewound = useCallback(() => {loopedAt.current = -Infinity;}, []);

  // Each build starts the console afresh, with a line saying how it went.
  const logBuild = (buildId: number, result: CompileResult, ms: number) => {
    if (buildId === consoleBuild) {
      return;
    }
    const errors = result.ok ? [] : result.errors;
    setConsoleBuild(buildId);
    store.clear();
    inputWarningIds.current.clear();
    store.add({level: "note", text: buildLineText(errors.length, ms)});
    buildLine.current = {id: store.last()!.id, shaderErrors: errors.length, ms};
    if (!result.ok) {
      errors.forEach(error => store.add({level: "error", text: error.message, tab: result.shader, line: error.line}));
    }
  };

  // Lists the input warnings that are true now, adding new ones and dropping those that no longer are.
  const showInputWarnings = useCallback((texts: readonly string[]) => {
    const listed = inputWarningIds.current;
    const gone = [...listed].filter(([text]) => !texts.includes(text));
    if (gone.length > 0) {
      store.remove(gone.map(([, id]) => id));
      gone.forEach(([text]) => listed.delete(text));
    }
    for (const text of texts.filter(t => !listed.has(t))) {
      store.add({level: "warn", text});
      listed.set(text, store.last()!.id);
    }
  }, [store]);

  const logLayerStatus = (errors: LineError[], loading: boolean) => {
    errors.forEach(error => store.add({level: "error", text: error.message, tab: "canvas", line: error.line}));
    // Code that doesn't load counts towards the build's errors.
    const line = buildLine.current;
    if (loading && errors.length > 0 && line) {
      store.update(line.id, buildLineText(line.shaderErrors + errors.length, line.ms));
    }
  };

  const addLayerLogs = (logs: LayerLog[], dropped: number) => {
    if (!exporting()) {
      logLayer(store, logs, dropped, false);
    }
  };

  // A line saying the Canvas2D code started again, so its setup's lines showing again make sense.
  // A resize restarts it twice in quick succession, which counts as once.
  const onLayerRestart = () => {
    if (exporting()) {
      return;
    }
    const now = performance.now();
    const text = now - loopedAt.current < LOOP_RESTART_MS ? "Looped to the start" : "Restarted";
    loopedAt.current = -Infinity;
    const last = store.last();
    if (last && last.level === "note" && last.text === text && lastRestart.current?.id === last.id &&
        now - lastRestart.current.at < RESTART_MERGE_MS) {
      return;
    }
    store.add({level: "note", text});
    lastRestart.current = {id: store.last()!.id, at: now};
  };

  const onTextureFailed = (slot: number, video: boolean) => store.add({
    level: "warn",
    text: `iTexture${slot}'s ${video ? "video couldn't be loaded or played" : "image couldn't be loaded"}, so it reads as black.`,
  });

  return {
    looped, rewound, logBuild, showInputWarnings, logLayerStatus, addLayerLogs, onLayerRestart, onTextureFailed,
  };
}
