import { useRef, type RefObject } from 'react';

import { useLatest } from '../../lib/useLatest';
import type { CanvasHandle } from '../../render/Canvas';
import { pickValue } from '../../render/pick';
import type { ShaderId } from '../../render/Renderer';
import type { useProbe } from '../../render/useProbe';
import { markTipSeen } from '../onboarding/tips';
import { tabCode } from './documentState';
import type { useDocument } from './useDocument';

interface Options {
  docState: ReturnType<typeof useDocument>;
  canvasRef: RefObject<CanvasHandle | null>;
  probe: ReturnType<typeof useProbe>;
}

// A picker's drag on built code shows each value on the canvas through a uniform, without building or
// starting the simulation again. The document takes the code, and builds it, once the picker is let go.
export function usePickerDrag({docState, canvasRef, probe}: Options) {
  // For the press under way: whether the canvas took it, or it rebuilds as other edits do.
  const mode = useRef<"uniform" | "rebuild" | null>(null);
  const docRef = useLatest(docState.doc);

  const start = (tab: ShaderId, code: string, from: number, to: number) => {
    const value = pickValue(code.slice(from, to));
    const canvas = canvasRef.current;
    const built = docState.allBuilt && docState.errorShader === null;
    const started = tab !== "canvas" && built && value !== null && canvas !== null &&
      canvas.startPick(tab, code, from, to, value.type, value.values);
    if (started) {
      markTipSeen("pickers");
    }
    return started;
  };

  // Whether the canvas shows the edit, so it needn't reach the document yet.
  const onPickerEdit = (tab: ShaderId, code: string, from: number, to: number): boolean => {
    mode.current ??= start(tab, code, from, to) ? "uniform" : "rebuild";
    if (mode.current === "rebuild") {
      return false;
    }
    const value = pickValue(code.slice(from, to));
    if (value) {
      canvasRef.current?.setPickValues(value.values);
    }
    return true;
  };

  const onPickerRelease = (tab: ShaderId, code: string | null) => {
    mode.current = null;
    if (code === null) {
      return;
    }
    if (code === tabCode(docRef.current, tab)) {
      canvasRef.current?.endPick();
      return;
    }
    docState.editCode(tab, code);
    docState.dispatch({type: "buildLive"});
    probe.refresh();
  };

  return {onPickerEdit, onPickerRelease};
}
