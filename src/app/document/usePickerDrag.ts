import { useEffect, useRef, type RefObject } from 'react';

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

// A press on a picker, from its first edit until it's let go. The canvas shows its values through a
// uniform, with the edits held in the editor, or the edits reach the document and build live. `startCode`
// is the tab's code when it started, so a release after another animation opens is dropped.
export type PickerDrag =
  | {kind: "idle"}
  | {kind: "uniform"; startCode: string | undefined}
  | {kind: "rebuild"; startCode: string | undefined};

// The code a released drag hands to the document: what the canvas showed through the uniform, unless
// it's back where it started or the animation changed under it.
export function releasedCode(drag: PickerDrag, edited: string | null, current: string | undefined): string | null {
  return drag.kind === "uniform" && edited !== null && edited !== current && drag.startCode === current ? edited : null;
}

// Live builds of a rebuild drag's edits: none, one waiting for the next frame, or one made that hasn't
// rendered yet, during which the code looks unbuilt but further edits still build.
type LiveBuild = {kind: "off"} | {kind: "scheduled"; frame: number} | {kind: "building"};

// A picker's edits build at most once a frame, with the latest.
function useLiveBuild(dispatch: Options["docState"]["dispatch"], allBuilt: boolean) {
  const state = useRef<LiveBuild>({kind: "off"});
  useEffect(() => {
    if (allBuilt && state.current.kind === "building") {
      state.current = {kind: "off"};
    }
  });
  const cancel = () => {
    if (state.current.kind === "scheduled") {
      cancelAnimationFrame(state.current.frame);
    }
    state.current = {kind: "off"};
  };
  const cancelRef = useLatest(cancel);
  useEffect(() => () => cancelRef.current(), [cancelRef]);
  const allBuiltRef = useLatest(allBuilt);
  return {
    schedule() {
      if (state.current.kind === "scheduled") {
        return;
      }
      state.current = {kind: "scheduled", frame: requestAnimationFrame(() => {
        // Something else built the code since, so this build changes nothing and no render will end it.
        state.current = allBuiltRef.current ? {kind: "off"} : {kind: "building"};
        dispatch({type: "buildLive"});
      })};
    },
    cancel,
    live: () => state.current.kind !== "off",
  };
}

// A picker's drag on built code shows each value on the canvas through a uniform, without building or
// starting the simulation again. The document takes the code, and builds it, once the picker is let go.
// Where the uniform can't take the value, the edits build live instead, with the shown expression held back.
export function usePickerDrag({docState, canvasRef, probe}: Options) {
  const drag = useRef<PickerDrag>({kind: "idle"});
  const docRef = useLatest(docState.doc);
  const liveBuild = useLiveBuild(docState.dispatch, docState.allBuilt);

  const startUniform = (tab: ShaderId, code: string, from: number, to: number) => {
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
    if (drag.current.kind === "idle") {
      const startCode = tabCode(docRef.current, tab);
      drag.current = startUniform(tab, code, from, to) ? {kind: "uniform", startCode} : {kind: "rebuild", startCode};
    }
    if (drag.current.kind === "rebuild") {
      return false;
    }
    const value = pickValue(code.slice(from, to));
    if (value) {
      canvasRef.current?.setPickValues(value.values);
    }
    return true;
  };

  const onPickerRelease = (tab: ShaderId, edited: string | null) => {
    const code = releasedCode(drag.current, edited, tabCode(docRef.current, tab));
    drag.current = {kind: "idle"};
    if (code === null) {
      canvasRef.current?.endPick();
      return;
    }
    docState.editCode(tab, code);
    docState.dispatch({type: "buildLive"});
    probe.refresh();
  };

  // An edit that reached the document. A picker's builds live, as long as the code was built before
  // the drag; typing doesn't build.
  const onEdit = (isHelperChange: boolean) => {
    if (!isHelperChange) {
      liveBuild.cancel();
      return;
    }
    // They've found the pickers, so there's no need for the tip about them.
    markTipSeen("pickers");
    if (docState.allBuilt || liveBuild.live()) {
      liveBuild.schedule();
      probe.holdWhileEditing();
    }
  };

  return {onPickerEdit, onPickerRelease, onEdit};
}
