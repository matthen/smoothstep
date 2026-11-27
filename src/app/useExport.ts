import { useCallback, useRef, useState } from 'react';

import type { ConsoleStore } from '../console/consoleStore';
import type { ExportOptions, ExportProgress } from '../dialogs/exportTypes';
import * as archive from '../lib/archive';
import type { AnimationDocument } from '../lib/document';
import { showMessage } from './statusMessage';
import { logLayer } from './useConsoleLog';

const EXPORT_NAMES: Record<ExportOptions["type"], string> = {webm: "a WebM video", mp4: "an MP4 video", gif: "a GIF", png: "PNG frames"};

// Rendering the animation to a video or frames, logging to the console as it goes. `closeDialog` closes
// the Render dialog when the render is done or cancelled.
export function useExport(store: ConsoleStore, doc: AnimationDocument, closeDialog: () => void) {
  const [exportOptions, setExportOptions] = useState<ExportOptions>({width: 512, fps: 30, type: "webm"});
  const [exportProgress, setExportProgress] = useState<ExportProgress | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const exportAbort = useRef<AbortController | null>(null);
  const exporting = useCallback(() => exportAbort.current !== null, []);

  const startExport = async () => {
    const controller = new AbortController();
    exportAbort.current = controller;
    setExportError(null);
    setExportProgress({stage: "rendering", fraction: 0});
    const started = performance.now();
    store.add({level: "note", text: `Rendering ${EXPORT_NAMES[exportOptions.type]}`});
    try {
      // Loaded on first export, since the encoders are a large part of the app's size.
      const {exportVideo} = await import('../export/exportVideo');
      archive.download(await exportVideo(doc, exportOptions, setExportProgress, controller.signal, {
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
