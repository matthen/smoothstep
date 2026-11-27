import { useCallback, useEffect, useRef } from 'react';

import { useLatest } from '../lib/useLatest';
import type { Playhead } from '../timeline/playhead';
import { renderSteps, RESTART, restarts } from './steps';
import type { CanvasRefs } from './useCanvasLayer';

export interface FrameProps {
  // Its time and step clock, read as it draws rather than passed every frame.
  playhead: Playhead;
  // Whether time is moving on by itself, so videos play along rather than seek to each frame.
  playing: boolean;
  duration: number;
  valuesAt(time: number): number[];
  // The previous frame was cleared (new build, size or textures), so iFrame should restart at 0.
  onRestart(): void;
}

// Drawing the frame at the playhead, stepping the simulation up to it, and asking for a draw whenever the
// playhead or what's drawn at it changes. `restart` starts the simulation again from step 0.
export function useFrameAtPlayhead(refs: CanvasRefs, props: FrameProps) {
  const {rendererRef, layerRef, needsRender: needsRenderRef} = refs;
  const propsRef = useLatest(props);
  const steps = useRef(RESTART);
  // The step drawn, which changes every frame, too often for state, so drawing writes it.
  const stepShown = useRef<HTMLParagraphElement>(null);

  const restart = useCallback(() => {
    steps.current = RESTART;
    layerRef.current?.steps.restart();
    propsRef.current.onRestart();
  }, [layerRef, propsRef]);

  const renderFrame = useCallback(() => {
    const p = propsRef.current;
    const renderer = rendererRef.current;
    const layerSteps = layerRef.current?.steps;
    if (!renderer) {
      return;
    }
    const {time, stepClock} = p.playhead;
    renderer.followVideos(time, p.playing);
    // A restart goes ahead, which also stops a layer stuck on a step. Videos the layer reads are
    // waited for, so it gets the same frames as the shaders.
    if (layerSteps?.waitingForVideos || (layerSteps?.busy && !restarts(steps.current, stepClock))) {
      needsRenderRef.current = true;  // Try again next frame, when the layer may have caught up.
      return;
    }
    const variableValues = p.valuesAt(time);
    steps.current = renderSteps(layerSteps ?? renderer, steps.current, stepClock, time,
      (t, frameIndex) => ({time: t, duration: p.duration, frameIndex, variableValues}), 4);
    if (stepShown.current) {
      stepShown.current.textContent = String(Math.max(0, steps.current.rendered));
    }
  }, [propsRef, rendererRef, layerRef, needsRenderRef]);

  const {playhead, playing, valuesAt, duration} = props;
  useEffect(() => playhead.subscribe(() => {needsRenderRef.current = true;}), [playhead, needsRenderRef]);
  useEffect(() => {
    needsRenderRef.current = true;
  }, [playing, valuesAt, duration, needsRenderRef]);

  return {restart, renderFrame, stepShown};
}
