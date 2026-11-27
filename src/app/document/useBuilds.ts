import type { EditorView } from '@codemirror/view';
import { useState } from 'react';

import type { Range } from '../../editor/glslDefinitions';
import { canvasLayer } from '../../lib/document';
import type { LineError } from '../../lib/types';
import { useLatest } from '../../lib/useLatest';
import type { CompileResult, ShaderId } from '../../render/Renderer';
import { markTipSeen, type TipEvent } from '../onboarding/tips';
import type { useCodeTabs } from '../layout/useCodeTabs';
import type { useConsoleLog } from '../../console/useConsoleLog';
import type { useDocument } from './useDocument';
import type { useProbe } from '../../render/useProbe';

interface Options {
  docState: ReturnType<typeof useDocument>;
  tabs: ReturnType<typeof useCodeTabs>;
  probe: ReturnType<typeof useProbe>;
  log: ReturnType<typeof useConsoleLog>;
  showTip: (event: TipEvent) => void;
}

// Building the code, and what the editor and canvas report as it's edited and built.
export function useBuilds({docState, tabs, probe, log, showTip}: Options) {
  const {dispatch, builtCode, builtExtras, buildId, allBuilt} = docState;
  const {setCodeTab, docsShownRef} = tabs;
  const docRef = useLatest(docState.doc);

  const build = () => {
    docState.build();
    probe.refresh();
  };
  // A build asked for along with an edit, made once the edit has reached `doc`.
  const [buildQueued, setBuildQueued] = useState(false);
  if (buildQueued) {
    setBuildQueued(false);
    build();
  }

  // Shows an expression selected in a tab on the canvas, building the code first if it's changed.
  const showExpression = (tab: ShaderId, view: EditorView, range: Range | null) => {
    if (range && !allBuilt) {
      build();
    }
    probe.show(tab, view, range);
  };

  const onCodeChange = (tab: ShaderId, code: string, isHelperChange: boolean) => {
    // Picker drags rebuild live, as long as the code was built before the drag.
    const live = isHelperChange && allBuilt;
    docState.editCode(tab, code, live);
    if (isHelperChange) {
      // They've found the pickers, so there's no need for the tip about them.
      markTipSeen("pickers");
    }
    if (live) {
      probe.holdWhileEditing();
    }
  };

  const onEditorView = (tab: ShaderId, view: EditorView | null) => {
    tabs.setView(tab, view);
    if (!view) {
      probe.dropTab(tab);
    }
  };

  const onLayerStatus = (errors: LineError[], layerLoading = false) => {
    dispatch({type: "layerErrors", errors});
    log.logLayerStatus(errors, layerLoading);
    // Show the code with the error, unless the docs are open: its tab shows the error.
    if (errors.length > 0 && docState.errorShader === null && canvasLayer(docRef.current) && !docsShownRef.current) {
      setCodeTab("canvas");
    }
  };

  const onBuilt = (result: CompileResult, ms: number) => {
    log.logBuild(buildId, result, ms);
    docState.built(result);
    if (!result.ok && !docsShownRef.current) {
      setCodeTab(result.shader);  // Show the code with the error.
    }
    if (builtCode !== null) {
      // Every tab's code, so a tip about iPrevFrame shows wherever it's used.
      const code = [builtCode, builtExtras.shared, ...builtExtras.buffers].join("\n");
      showTip({kind: "built", ok: result.ok, code, edited: builtCode !== docState.openedCode});
    }
  };

  return {
    build, queueBuild: () => setBuildQueued(true), showExpression, onCodeChange, onEditorView, onLayerStatus, onBuilt,
  };
}
