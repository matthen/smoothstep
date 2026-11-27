// The Render dialog's settings, progress and errors, and starting or cancelling a render.
import { useCallback, useRef, useState } from 'react';

import type { ConsoleStore } from '../console/consoleStore';
import type { ExportOptions, ExportProgress } from '../dialogs/exportTypes';
import * as archive from '../lib/archive';
import type { AnimationDocument } from '../lib/document';
import { showMessage } from '../lib/statusMessage';
import { logLayer } from '../console/useConsoleLog';

const EXPORT_NAMES: Record<ExportOptions["type"], string> = {webm: "a WebM video", mp4: "an MP4 video", gif: "a GIF", png: "PNG frames"};
// How often, at most, the Render dialog's progress bar moves, as each move re-renders the app.
const PROGRESS_INTERVAL_MS = 100;

// The preview pauses while a render runs, so it doesn't compete for the GPU.
export interface Preview {
  isPlaying: boolean;
  setIsPlaying: (playing: boolean) => void;
}

// Passes on progress at most every PROGRESS_INTERVAL_MS, but always a new stage and the end.
function throttledProgress(set: (progress: ExportProgress) => void) {
  let shown: {progress: ExportProgress; at: number} | null = null;
  return (progress: ExportProgress) => {
    const now = performance.now();
    if (!shown || progress.stage !== shown.progress.stage || progress.fraction >= 1 || now - shown.at >= PROGRESS_INTERVAL_MS) {
      shown = {progress, at: now};
      set(progress);
    }
  };
}

// Rendering the animation to a video or frames, logging to the console as it goes. `closeDialog` closes
// the Render dialog when the render is done or cancelled.
export function useExport(store: ConsoleStore, doc: AnimationDocument, closeDialog: () => void) {
  const [exportOptions, setExportOptions] = useState<ExportOptions>({width: 512, fps: 30, type: "webm"});
  const [exportProgress, setExportProgress] = useState<ExportProgress | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const exportAbort = useRef<AbortController | null>(null);
  const exporting = useCallback(() => exportAbort.current !== null, []);
  // Whether to play again once renders stop, taken from before the first of a run of back-to-back renders.
  const resumePlaying = useRef(false);

  const startExport = async (preview: Preview) => {
    if (exportAbort.current === null) {
      resumePlaying.current = preview.isPlaying;
    }
    const controller = new AbortController();
    exportAbort.current = controller;
    preview.setIsPlaying(false);
    setExportError(null);
    setExportProgress({stage: "rendering", fraction: 0});
    const started = performance.now();
    store.add({level: "note", text: `Rendering ${EXPORT_NAMES[exportOptions.type]}`});
    try {
      // Loaded on first export, since the encoders are a large part of the app's size.
      const {exportVideo} = await import('./exportVideo');
      archive.download(await exportVideo(doc, exportOptions, throttledProgress(setExportProgress), controller.signal, {
        layer: (logs, dropped) => logLayer(store, logs, dropped, true),
        layerErrors: errors => errors.forEach(error =>
          store.add({level: "error", text: error.message, tab: "canvas", line: error.line, render: true})),
        warn: text => store.add({level: "warn", text}),
      }));
      store.add({level: "note", text: `Rendered in ${((performance.now() - started) / 1000).toFixed(1)} s`});
      closeDialog();
      showMessage("Video rendered.");
    } catch (error) {
      if (controller.signal.aborted) {
        store.add({level: "note", text: "Render cancelled"});
      } else {
        console.error(error);
        const message = error instanceof Error ? error.message : String(error);
        store.add({level: "error", text: `Render failed: ${message}`});
        setExportError(message);
      }
    } finally {
      // A cancelled run can finish after a new one has started; leave the new one's state alone.
      if (exportAbort.current === controller) {
        exportAbort.current = null;
        setExportProgress(null);
        if (resumePlaying.current) {
          preview.setIsPlaying(true);
        }
      }
    }
  };

  const cancelExport = () => {
    exportAbort.current?.abort();
    closeDialog();
  };

  return {
    exportOptions, setExportOptions, exportProgress, exportError, setExportError, exporting, startExport, cancelExport,
  };
}
