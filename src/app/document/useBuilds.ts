// Building the code, and what the editor and canvas report as it's edited and built.
import type { EditorView } from '@codemirror/view';
import { useMemo, useState, type RefObject } from 'react';

import type { Range } from '../../editor/glslDefinitions';
import { canvasLayer } from '../../lib/document';
import type { LineError } from '../../lib/types';
import { useLatest } from '../../lib/useLatest';
import type { CanvasHandle } from '../../render/Canvas';
import type { CompileResult, ShaderId } from '../../render/Renderer';
import type { TipEvent } from '../onboarding/tips';
import type { useCodeTabs } from '../layout/useCodeTabs';
import { useInputWarnings } from '../../console/useInputWarnings';
import type { useConsoleLog } from '../../console/useConsoleLog';
import type { useDocument } from './useDocument';
import type { useProbe } from '../../render/useProbe';
import { usePickerDrag } from './usePickerDrag';

interface Options {
  docState: ReturnType<typeof useDocument>;
  canvasRef: RefObject<CanvasHandle | null>;
  tabs: ReturnType<typeof useCodeTabs>;
  probe: ReturnType<typeof useProbe>;
  log: ReturnType<typeof useConsoleLog>;
  showTip: (event: TipEvent) => void;
  tutorialOpen: boolean;
}

export function useBuilds({docState, canvasRef, tabs, probe, log, showTip, tutorialOpen}: Options) {
  const {dispatch, builtCode, builtExtras, buildId, allBuilt} = docState;
  const pickerDrag = usePickerDrag({docState, canvasRef, probe});
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
    docState.editCode(tab, code);
    pickerDrag.onEdit(isHelperChange);
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

  // Every shader tab's code, so a tip about iPrevFrame shows wherever it's used.
  const builtShaders = useMemo(
    () => [builtCode, builtExtras.shared, ...builtExtras.buffers].join("\n"), [builtCode, builtExtras]);
  // A new one for each build that works. The tutorial's steps say when an input is still empty, so its
  // warnings would only repeat them.
  const {compiled} = docState;
  const builtInputs = useMemo(() => compiled?.ok && !tutorialOpen ? {shaders: builtShaders, canvas: builtExtras.canvas} : null,
    [compiled, tutorialOpen, builtShaders, builtExtras.canvas]);
  useInputWarnings(log.showInputWarnings, builtInputs, docState.doc.textures, docState.doc.variables);

  const onBuilt = (result: CompileResult, ms: number) => {
    const code = builtShaders;
    log.logBuild(buildId, result, ms);
    docState.built(result);
    if (!result.ok && !docsShownRef.current) {
      setCodeTab(result.shader);  // Show the code with the error.
    }
    showTip({kind: "built", ok: result.ok, code, edited: builtCode !== docState.openedCode});
  };

  return {
    build, queueBuild: () => setBuildQueued(true), showExpression, onCodeChange, onEditorView, onLayerStatus, onBuilt,
    onPickerEdit: pickerDrag.onPickerEdit, onPickerRelease: pickerDrag.onPickerRelease,
  };
}
