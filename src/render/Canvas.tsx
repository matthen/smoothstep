import { Alert } from '@mantine/core';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, type PointerEvent } from 'react';

import type { CanvasLayer } from '../layer/CanvasLayer';
import type { AspectRatio, ShaderExtras } from '../lib/document';
import type { LineError } from '../lib/types';
import { useLatest } from '../lib/useLatest';
import { LayerSteps } from './layerSteps';
import { drawingSize, fitCanvas, SlowFrames } from './layout';
import { Renderer, type CompileResult } from './Renderer';
import { renderSteps, RESTART } from './steps';

export interface CanvasLayout {
  width: number;   // displayed size in CSS pixels
  height: number;
  top: number;     // bottom edge of the canvas within the container's offset parent, for the player controls
  containerWidth: number;
}

export interface CanvasHandle {
  // Renders the current frame and returns it as a PNG data URL (for thumbnails).
  captureFrame(): string | null;
}

// The image's code, each buffer's, the code they share and the Canvas2D layer's, as last built.
export interface Shaders extends ShaderExtras {
  code: string;
}

// How long a change of size or length is left to settle before the Canvas2D layer starts again with it.
const LAYER_SETTLE_MS = 80;

interface CanvasProps {
  shaders: Shaders | null;
  buildId: number;      // bumps on every build, so building the same code again restarts iPrevFrame
  textureURLs: string[];
  // For the Canvas2D layer: each slot's image, or null for an empty slot.
  layerTextures: readonly (string | null)[];
  // Whether the Canvas2D layer is drawn over the image.
  layerOverlay: boolean;
  // The Canvas2D layer's errors; none once it draws.
  onLayerStatus(errors: LineError[]): void;
  time: number;
  duration: number;
  stepClock: number;  // seconds played since the simulation restarted
  variableValues: number[];
  aspectRatio: AspectRatio;
  onBuilt(result: CompileResult): void;
  // The previous frame was cleared (new build, size or textures), so iFrame should restart at 0.
  onRestart(): void;
  onLayout(layout: CanvasLayout): void;
}

const Canvas = forwardRef<CanvasHandle, CanvasProps>(function Canvas(props, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const propsRef = useLatest(props);
  const needsRender = useRef(true);
  const [error, setError] = useState<string | null>(null);
  // The container's width, height and offset within the pane, where the play bar is placed.
  const [container, setContainer] = useState<[number, number, number]>([0, 0, 0]);
  const [fps, setFps] = useState<number | null>(null);
  // Touch screens can't hover, so a tap shows the size and frame rate for a few seconds.
  const [overlays, setOverlays] = useState(false);
  const overlayTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(overlayTimer.current), []);
  const showOverlays = (event: PointerEvent) => {
    if (event.pointerType !== "mouse") {
      setOverlays(true);
      window.clearTimeout(overlayTimer.current);
      overlayTimer.current = window.setTimeout(() => setOverlays(false), 3000);
    }
  };
  const [width, height] = fitCanvas(container[0], container[1], props.aspectRatio);
  // Set when this build's preview was too slow to draw at the screen's full resolution.
  const [lowRes, setLowRes] = useState(false);
  const [pixelWidth, pixelHeight] = drawingSize(width, height, window.devicePixelRatio, lowRes);
  const marginTop = Math.max(0, (container[1] - height) / 2);
  const marginSide = Math.max(0, (container[0] - width) / 2);

  const steps = useRef(RESTART);
  // The animation's Canvas2D layer, once it has loaded, and the stepping that keeps it with the shaders.
  const layerRef = useRef<{layer: CanvasLayer; steps: LayerSteps} | null>(null);
  const layerBuildId = useRef(-1);
  // The layer sent a frame, to show even when nothing else changed.
  const needsPresent = useRef(false);
  const restart = useCallback(() => {
    steps.current = RESTART;
    layerRef.current?.steps.restart();
    propsRef.current.onRestart();
  }, [propsRef]);

  const renderFrame = useCallback(() => {
    const p = propsRef.current;
    const renderer = rendererRef.current;
    const layerSteps = layerRef.current?.steps;
    if (!renderer) {
      return;
    }
    if (layerSteps?.busy) {
      needsRender.current = true;  // Try again next frame, when the layer may have caught up.
      return;
    }
    steps.current = renderSteps(layerSteps ?? renderer, steps.current, p.stepClock, p.time,
      (time, frameIndex) => ({time, duration: p.duration, frameIndex, variableValues: p.variableValues}), 4);
  }, [propsRef]);

  useImperativeHandle(ref, () => ({
    captureFrame() {
      const canvas = canvasRef.current;
      const renderer = rendererRef.current;
      if (!renderer || !canvas) {
        return null;
      }
      if (layerRef.current) {
        renderer.refresh();  // Drawing a step would also step the layer, whose frame comes later.
      } else {
        renderFrame();
      }
      // In the same task as the draw, so the buffer is still there. Thumbnails stay at the CSS size.
      if (canvas.width === width && canvas.height === height) {
        return canvas.toDataURL("image/png");
      }
      const thumbnail = document.createElement("canvas");
      thumbnail.width = width;
      thumbnail.height = height;
      thumbnail.getContext("2d")?.drawImage(canvas, 0, 0, width, height);
      return thumbnail.toDataURL("image/png");
    },
  }));

  useEffect(() => {
    try {
      const renderer = new Renderer(canvasRef.current!);
      renderer.onTextureLoaded = () => {needsRender.current = true;};
      rendererRef.current = renderer;
      // No dispose(): StrictMode remounts with the same canvas, and a lost context can't be reused.
      return () => {
        rendererRef.current = null;
      };
    } catch (e) {
      console.error(e);
      setError("smoothstep.io needs WebGL 2, which this browser or device doesn't support.");
      return undefined;
    }
  }, []);

  useEffect(() => {
    const element = containerRef.current!;
    const observer = new ResizeObserver(() =>
      setContainer([element.clientWidth, element.clientHeight, element.offsetTop]));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (rendererRef.current?.setSize(pixelWidth, pixelHeight)) {
      restart();
    }
    needsRender.current = true;
    props.onLayout({width, height, top: container[2] + marginTop + height, containerWidth: container[0]});
  }, [width, height, pixelWidth, pixelHeight, marginTop, container[0], container[2]]); // eslint-disable-line react-hooks/exhaustive-deps

  // Each build gets another try at full resolution.
  useEffect(() => setLowRes(false), [props.buildId]);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer || props.shaders === null) {
      return;
    }
    const result = renderer.setCode(props.shaders.code, props.shaders.buffers, props.shaders.shared);
    props.onBuilt(result);
    if (result.ok) {
      restart();
    }
    needsRender.current = true;
  }, [props.shaders, props.buildId]); // eslint-disable-line react-hooks/exhaustive-deps

  // The Canvas2D layer: started when a build has one, and again when what it runs with changes.
  const layerCode = props.shaders === null ? undefined : props.shaders.canvas;
  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer || layerCode === undefined) {
      return undefined;
    }
    renderer.setLayer(layerCode !== null);
    needsRender.current = true;
    if (layerCode === null) {
      layerRef.current?.layer.dispose();
      layerRef.current = null;
      propsRef.current.onLayerStatus([]);
      return undefined;
    }
    if (width === 0 || height === 0) {
      return undefined;
    }
    const force = layerBuildId.current !== props.buildId;
    const config = {
      code: layerCode, width: pixelWidth, height: pixelHeight, duration: props.duration, textures: props.layerTextures,
    };
    const timer = window.setTimeout(() => {
      void import('../layer/bundled').then(({CanvasLayer, bundledAssets}) => {
        if (rendererRef.current !== renderer || propsRef.current.shaders?.canvas !== layerCode) {
          return;
        }
        if (!layerRef.current) {
          const layer = new CanvasLayer(bundledAssets, {
            onFrame: bitmap => {
              renderer.setLayerFrame(bitmap);
              needsPresent.current = true;
            },
            onStatus: errors => propsRef.current.onLayerStatus(errors),
          });
          layerRef.current = {layer, steps: new LayerSteps(renderer, layer)};
        }
        layerBuildId.current = props.buildId;
        if (layerRef.current.layer.configure(config, force)) {
          restart();
          needsRender.current = true;
        }
      }).catch((error: unknown) => {
        console.error(error);
        propsRef.current.onLayerStatus([{line: 0, message: "Couldn't load the Canvas2D layer. Check your connection and build again."}]);
      });
    }, force || !layerRef.current ? 0 : LAYER_SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [layerCode, props.buildId, width, height, pixelWidth, pixelHeight, props.duration, props.layerTextures, propsRef, restart]);

  useEffect(() => () => {
    layerRef.current?.layer.dispose();
    layerRef.current = null;
  }, []);

  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.layerOverlay = props.layerOverlay;
      needsPresent.current = true;
    }
  }, [props.layerOverlay]);

  useEffect(() => {
    rendererRef.current?.setTextures(props.textureURLs);
    rendererRef.current?.clearTargets();
    restart();
    needsRender.current = true;
  }, [props.textureURLs, restart]);

  useEffect(() => {
    needsRender.current = true;
  }, [props.time, props.stepClock, props.variableValues, props.duration]);

  // Render on animation frames when something changed, keeping a smoothed frame rate, and dropping
  // to 1× if it stays slow.
  useEffect(() => {
    let id = 0;
    let updates = 0;
    const frames = new SlowFrames();
    const loop = (now: number) => {
      if (!needsRender.current && needsPresent.current) {
        rendererRef.current?.refresh();
      }
      needsPresent.current = false;
      if (needsRender.current) {
        needsRender.current = false;
        renderFrame();
        const rate = frames.frame(now);
        if (rate !== null) {
          updates += 1;
          if (updates % 10 === 0) {
            const value = Math.round(rate);
            setFps(value > 20 ? Math.round(value / 3) * 3 : value);
          }
          if (frames.slow) {
            setLowRes(true);
          }
        }
      } else {
        frames.idle();
      }
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, [renderFrame]);

  return (
    <div id="canvasContainer" ref={containerRef} data-overlays={overlays || undefined} onPointerDown={showOverlays}>
      {error ? <Alert color="yellow" className="webglError">{error}</Alert> : (
        <>
          <canvas ref={canvasRef} id="canvas" style={{width, height}} />
          <div className="fps" style={{top: marginTop + 8, right: marginSide + 8}}>
            <p>{pixelWidth}&times;{pixelHeight}px</p>
            {fps ? <p>{fps} fps</p> : null}
            <p>{Math.max(0, steps.current.rendered)}</p>
          </div>
        </>
      )}
    </div>
  );
});

export default Canvas;
