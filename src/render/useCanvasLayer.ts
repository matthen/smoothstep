import { useEffect, useRef, useState, type RefObject } from 'react';

import type { CanvasLayer, LayerLog } from '../layer/CanvasLayer';
import type { LineError } from '../lib/types';
import { LayerSteps } from './layerSteps';
import type { Renderer } from './Renderer';

// How long a change of size or length is left to settle before the Canvas2D layer starts again with it.
const LAYER_SETTLE_MS = 80;

// What the canvas's effects and its render loop share.
export interface CanvasRefs {
  rendererRef: RefObject<Renderer | null>;
  // The Canvas2D layer, once it has loaded, and the stepping that keeps it with the shaders.
  layerRef: RefObject<{layer: CanvasLayer; steps: LayerSteps} | null>;
  // Something changed, so the next animation frame draws.
  needsRender: RefObject<boolean>;
  // The layer sent a frame, to show even when nothing else changed.
  needsPresent: RefObject<boolean>;
}

// The canvas's props the layer reads when it reports back, as they are then.
interface LayerCallbacks {
  shaders: {canvas?: string | null} | null;
  buildId: number;
  onLayerStatus(errors: LineError[], loading?: boolean): void;
  onLayerLog(logs: LayerLog[], dropped: number): void;
  onLayerRestart(): void;
}

interface Options {
  refs: CanvasRefs;
  restart: () => void;
  // The Canvas2D code as last built: null for none, or undefined before the first build.
  code: string | null | undefined;
  buildId: number;
  duration: number;
  textures: readonly (string | null)[];
  // The canvas's CSS size, and the layer's drawing size.
  size: {width: number; height: number; layerWidth: number; layerHeight: number};
  propsRef: RefObject<LayerCallbacks>;
}

// The Canvas2D layer: started when a build has one, and again when what it runs with changes. Returns the
// step it has been drawing for a while, or "starting" while its code first runs.
export function useCanvasLayer({refs, restart, code, buildId, duration, textures, size, propsRef}: Options) {
  const {rendererRef, layerRef, needsRender: needsRenderRef, needsPresent: needsPresentRef} = refs;
  const {width, height, layerWidth, layerHeight} = size;
  const [layerBusy, setLayerBusy] = useState<number | "starting" | null>(null);
  const layerBuildId = useRef(-1);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer || code === undefined) {
      return undefined;
    }
    renderer.setLayer(code !== null);
    needsRenderRef.current = true;
    if (code === null) {
      layerRef.current?.layer.dispose();
      layerRef.current = null;
      propsRef.current.onLayerStatus([]);
      return undefined;
    }
    if (width === 0 || height === 0) {
      return undefined;
    }
    const force = layerBuildId.current !== buildId;
    const config = {code, width: layerWidth, height: layerHeight, duration, textures};
    // Reports from a run of the code before the latest build are dropped until the layer takes the new code.
    const current = () => layerBuildId.current === propsRef.current.buildId;
    const timer = window.setTimeout(() => {
      void import('../layer/bundled').then(({CanvasLayer, bundledAssets}) => {
        if (rendererRef.current !== renderer || propsRef.current.shaders?.canvas !== code) {
          return;
        }
        if (!layerRef.current) {
          const layer = new CanvasLayer(bundledAssets, {
            onFrame: bitmap => {
              renderer.setLayerFrame(bitmap);
              needsPresentRef.current = true;
            },
            onStatus: (errors, loading) => {
              if (current()) {
                propsRef.current.onLayerStatus(errors, loading);
              }
            },
            onBusy: setLayerBusy,
            onLog: (logs, dropped) => {
              if (current()) {
                propsRef.current.onLayerLog(logs, dropped);
              }
            },
            onRestart: () => {
              if (current()) {
                propsRef.current.onLayerRestart();
              }
            },
          });
          layerRef.current = {layer, steps: new LayerSteps(renderer, layer)};
        }
        layerBuildId.current = buildId;
        if (layerRef.current.layer.configure(config, force)) {
          restart();
          needsRenderRef.current = true;
        }
      }).catch((error: unknown) => {
        console.error(error);
        propsRef.current.onLayerStatus([{line: 0, message: "Couldn't load the Canvas2D layer. Check your connection and build again."}], true);
      });
    }, force || !layerRef.current ? 0 : LAYER_SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [
    code, buildId, width, height, layerWidth, layerHeight, duration, textures, propsRef, restart,
    rendererRef, layerRef, needsRenderRef, needsPresentRef,
  ]);

  useEffect(() => () => {
    layerRef.current?.layer.dispose();
    layerRef.current = null;
  }, [layerRef]);

  return layerBusy;
}
