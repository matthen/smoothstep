import { Alert } from '@mantine/core';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, type PointerEvent } from 'react';

import type { LayerLog } from '../layer/CanvasLayer';
import type { AspectRatio, ShaderExtras } from '../lib/document';
import type { LineError } from '../lib/types';
import { useLatest } from '../lib/useLatest';
import { CanvasTools, PixelReadout, type ShownProbe } from './CanvasTools';
import { pixelAt } from './inspect';
import type { RangeMode } from './probeRange';
import { drawingSize, fitCanvas, SlowFrames } from './layout';
import { Renderer, type CompileResult, type ProbeRequest, type ProbeResult } from './Renderer';
import { useCanvasLayer, type CanvasRefs } from './useCanvasLayer';
import { useContainerSize } from './useContainerSize';
import { useFrameAtPlayhead, type FrameProps } from './useFrameAtPlayhead';
import { usePixelInspector } from './usePixelInspector';
import { useRenderLoop } from './useRenderLoop';

export interface CanvasLayout {
  width: number;   // displayed size in CSS pixels
  height: number;
  top: number;     // bottom edge of the canvas within the container's offset parent, for the player controls
  containerWidth: number;
}

export interface CanvasHandle {
  // Renders the current frame and returns it as a PNG data URL (for thumbnails).
  captureFrame(): string | null;
  // A picker's drag sets its literal as a uniform: see Renderer.startPick. False if that doesn't build.
  startPick(...args: Parameters<Renderer["startPick"]>): boolean;
  setPickValues(values: number[]): void;
  endPick(): void;
}

// The image's code, each buffer's, the code they share and the Canvas2D layer's, as last built.
export interface Shaders extends ShaderExtras {
  code: string;
}

interface CanvasProps extends FrameProps {
  shaders: Shaders | null;
  buildId: number;      // bumps on every build, so building the same code again restarts iPrevFrame
  textureURLs: string[];
  // For the Canvas2D layer: each slot's image, or null for an empty slot.
  layerTextures: readonly (string | null)[];
  // Whether the Canvas2D layer is drawn over the image.
  layerOverlay: boolean;
  // The Canvas2D layer's errors, and whether its code failed to load; none once it draws.
  onLayerStatus(errors: LineError[], loading?: boolean): void;
  // The Canvas2D code's console calls, from runs of the latest build.
  onLayerLog(logs: LayerLog[], dropped: number): void;
  // The Canvas2D layer started its code again, other than for a build.
  onLayerRestart(): void;
  // A texture slot whose image or video didn't load.
  onTextureFailed(slot: number, video: boolean): void;
  aspectRatio: AspectRatio;
  // What the shaders' code built to, and how long that took.
  onBuilt(result: CompileResult, ms: number): void;
  onLayout(layout: CanvasLayout): void;
  // An expression to show in place of the image, what became of it, and the way to turn it off.
  probe: ProbeRequest | null;
  onProbe(result: ProbeResult): void;
  onProbeOff(): void;
  // Whether pointing at the canvas shows a pixel's values.
  inspect: boolean;
  onInspectChange(on: boolean): void;
}

// The canvas as a PNG, at its CSS size. Called in the same task as the draw, so the buffer is still there.
function pngAtSize(canvas: HTMLCanvasElement, width: number, height: number): string {
  if (canvas.width === width && canvas.height === height) {
    return canvas.toDataURL("image/png");
  }
  const thumbnail = document.createElement("canvas");
  thumbnail.width = width;
  thumbnail.height = height;
  thumbnail.getContext("2d")?.drawImage(canvas, 0, 0, width, height);
  return thumbnail.toDataURL("image/png");
}

// Touch screens can't hover, so a tap shows the size and frame rate for a few seconds.
function useTapOverlays(): [boolean, (event: PointerEvent) => void] {
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
  return [overlays, showOverlays];
}

const Canvas = forwardRef<CanvasHandle, CanvasProps>(function Canvas(props, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const propsRef = useLatest(props);
  const needsRender = useRef(true);
  const [error, setError] = useState<string | null>(null);
  const container = useContainerSize(containerRef);
  const [overlays, showOverlays] = useTapOverlays();
  const [width, height] = fitCanvas(container[0], container[1], props.aspectRatio);
  // Set when this build's preview was too slow to draw at the screen's full resolution.
  const [lowRes, setLowRes] = useState(false);
  const lowerRes = useCallback(() => setLowRes(true), []);
  const [pixelWidth, pixelHeight] = drawingSize(width, height, window.devicePixelRatio, lowRes);
  // The Canvas2D layer stays at full resolution, so dropping to 1× doesn't start it again.
  const [layerWidth, layerHeight] = drawingSize(width, height, window.devicePixelRatio);
  const marginTop = Math.max(0, (container[1] - height) / 2);
  const marginSide = Math.max(0, (container[0] - width) / 2);

  const [probe, setProbe] = useState<ShownProbe | null>(null);
  const [rangeMode, setRangeMode] = useState<RangeMode>("auto");
  const {point, reading, inspecting, needsReadRef, readIfDue, canvasHandlers} = usePixelInspector({
    rendererRef, width, height, pixels: [pixelWidth, pixelHeight], inspect: props.inspect, probeShown: probe !== null,
  });

  const layerRef: CanvasRefs["layerRef"] = useRef(null);
  const needsPresent = useRef(false);
  const refs: CanvasRefs = {rendererRef, layerRef, needsRender, needsPresent};
  const {restart, renderFrame, stepShown} = useFrameAtPlayhead(refs, props);

  useImperativeHandle(ref, () => ({
    captureFrame() {
      const canvas = canvasRef.current;
      const renderer = rendererRef.current;
      if (!renderer || !canvas) {
        return null;
      }
      // The thumbnail is the image, even while the canvas shows an expression.
      renderer.showProbe = false;
      try {
        if (layerRef.current) {
          renderer.refresh();  // Drawing a step would also step the layer, whose frame comes later.
        } else {
          renderFrame();
        }
        return pngAtSize(canvas, width, height);
      } finally {
        renderer.showProbe = true;
        needsPresent.current = true;
      }
    },
    startPick(...args) {
      return rendererRef.current?.startPick(...args) ?? false;
    },
    // Paused, the frame draws again at the same step.
    setPickValues(values) {
      rendererRef.current?.setPickValues(values);
      needsRender.current = true;
    },
    endPick() {
      rendererRef.current?.endPick();
      needsRender.current = true;
    },
  }));

  useEffect(() => {
    try {
      const renderer = new Renderer(canvasRef.current!);
      renderer.onTextureLoaded = () => {needsRender.current = true;};
      renderer.onVideoFrame = () => {needsRender.current = true;};
      renderer.onTextureFailed = (slot, video) => propsRef.current.onTextureFailed(slot, video);
      rendererRef.current = renderer;
      // No dispose(): StrictMode remounts with the same canvas, and a lost context can't be reused.
      return () => {
        rendererRef.current = null;
      };
    } catch (e) {
      console.error(e);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- WebGL only fails when the mounted canvas asks for a context
      setError("smoothstep.io needs WebGL 2, which this browser or device doesn't support.");
      return undefined;
    }
  }, [propsRef]);

  // The CSS size last drawn at: when only the resolution changes, the simulation carries on.
  const drawnSize = useRef<[number, number]>([0, 0]);
  useEffect(() => {
    const resample = drawnSize.current[0] === width && drawnSize.current[1] === height;
    drawnSize.current = [width, height];
    if (rendererRef.current?.setSize(pixelWidth, pixelHeight, resample)) {
      restart();
    }
    needsRender.current = true;
    props.onLayout({width, height, top: container[2] + marginTop + height, containerWidth: container[0]});
  }, [width, height, pixelWidth, pixelHeight, marginTop, container[0], container[2]]); // eslint-disable-line react-hooks/exhaustive-deps -- runs on a change of size, not of the callbacks

  // Each build gets another try at full resolution, watched afresh.
  const frames = useRef(new SlowFrames());
  useEffect(() => {
    frames.current = new SlowFrames();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset with the frame watcher, which the render loop reads
    setLowRes(false);
  }, [props.buildId]);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer || props.shaders === null) {
      return;
    }
    const started = performance.now();
    const result = renderer.setCode(props.shaders.code, props.shaders.buffers, props.shaders.shared);
    built.current = result.ok;
    props.onBuilt(result, performance.now() - started);
    if (result.ok) {
      restart();
    }
    needsRender.current = true;
  }, [props.shaders, props.buildId]); // eslint-disable-line react-hooks/exhaustive-deps -- builds only on new code or a build, not when callbacks change

  // After a build that failed, the probe shown stays, with the code that built.
  const built = useRef(true);
  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) {
      return;
    }
    if (props.probe && !built.current) {
      if (!probe) {
        props.onProbe({ok: false, message: "The code needs to build first. Fix its errors, then try again."});
      }
      return;
    }
    const result = renderer.setProbe(props.probe);
    setProbe(result?.ok && props.probe ? {...result, tab: props.probe.tab} : null);
    if (result) {
      props.onProbe(result);
    }
    if (renderer.takeProbeRestart()) {
      restart();
      needsRender.current = true;
    }
    renderer.redrawProbe();
    needsReadRef.current = true;
  }, [props.probe, props.shaders, props.buildId]); // eslint-disable-line react-hooks/exhaustive-deps -- sets the probe on a new request or build; the probe shown and callbacks mustn't retrigger it

  useEffect(() => {
    rendererRef.current?.setRangeMode(rangeMode);
  }, [rangeMode]);

  const layerBusy = useCanvasLayer({
    refs, restart,
    code: props.shaders === null ? undefined : props.shaders.canvas, buildId: props.buildId, duration: props.duration,
    textures: props.layerTextures, size: {width, height, layerWidth, layerHeight}, propsRef,
  });

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

  const {fps, found} = useRenderLoop({refs, needsReadRef, frames, renderFrame, readIfDue, onSlow: lowerRes});

  // Leaves room for the size and frame rate at the top right.
  const toolsRoom = Math.max(0, width - 16 - 88);

  return (
    <div id="canvasContainer" ref={containerRef} data-overlays={overlays || undefined} onPointerDown={showOverlays}>
      {error ? <Alert color="yellow" className="webglError">{error}</Alert> : (
        <>
          <canvas
            ref={canvasRef} id="canvas" data-probe={probe !== null || undefined}
            style={{
              width, height, ...(inspecting ? {cursor: "crosshair"} : {}), ...(props.inspect ? {touchAction: "none"} : {}),
            }}
            {...canvasHandlers}
          />
          <CanvasTools
            style={{top: marginTop + 8, left: marginSide + 8, maxWidth: toolsRoom}} room={toolsRoom}
            inspect={props.inspect} onInspectChange={props.onInspectChange}
            probe={probe} rangeMode={rangeMode} onRangeModeChange={setRangeMode} found={found} onProbeOff={props.onProbeOff}
          />
          {point && reading &&
            <PixelReadout
              reading={reading} probe={probe} left={marginSide + point.x} top={marginTop + point.y}
              flipX={point.x > width - 270} flipY={point.touch ? point.y < 90 : point.y > height - 70}
              touch={point.touch} pixel={pixelAt(point.x, point.y, width, height, [pixelWidth, pixelHeight])}
              resolution={[pixelWidth, pixelHeight]}
            />}
          <div className="fps" style={{top: marginTop + 8, right: marginSide + 8}}>
            <p>{pixelWidth}&times;{pixelHeight}px</p>
            {fps ? <p>{fps} fps</p> : null}
            <p ref={stepShown} />
          </div>
          {layerBusy !== null ? (
            <p className="layerBusy" role="status" style={{top: marginTop + 44, left: marginSide + 8}}>
              {layerBusy === "starting" ? "Running the Canvas2D code…" : `Drawing step ${layerBusy}…`}
            </p>
          ) : null}
        </>
      )}
    </div>
  );
});

export default Canvas;
