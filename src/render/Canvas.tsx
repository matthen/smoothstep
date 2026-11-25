import { Alert } from '@mantine/core';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, type PointerEvent } from 'react';

import type { CanvasLayer } from '../layer/CanvasLayer';
import type { AspectRatio, ShaderExtras } from '../lib/document';
import type { LineError } from '../lib/types';
import { useLatest } from '../lib/useLatest';
import { CanvasTools, PixelReadout, type ShownProbe } from './CanvasTools';
import { pixelAt } from './inspect';
import type { FoundRange, RangeMode } from './probeRange';
import { LayerSteps } from './layerSteps';
import { drawingSize, fitCanvas, SlowFrames } from './layout';
import { Renderer, type CompileResult, type PixelReading, type ProbeRequest, type ProbeResult } from './Renderer';
import { renderSteps, RESTART, restarts } from './steps';

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
  // An expression to show in place of the image, what became of it, and the way to turn it off.
  probe: ProbeRequest | null;
  onProbe(result: ProbeResult): void;
  onProbeOff(): void;
  // Whether pointing at the canvas shows a pixel's values.
  inspect: boolean;
  onInspectChange(on: boolean): void;
}

// How often, at most, the inspector reads its pixel again while the animation plays.
const READ_INTERVAL_MS = 100;

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
  // The step the Canvas2D layer has been drawing for a while, or "starting" while its code first runs.
  const [layerBusy, setLayerBusy] = useState<number | "starting" | null>(null);
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
  // The Canvas2D layer stays at full resolution, so dropping to 1× doesn't start it again.
  const [layerWidth, layerHeight] = drawingSize(width, height, window.devicePixelRatio);
  const marginTop = Math.max(0, (container[1] - height) / 2);
  const marginSide = Math.max(0, (container[0] - width) / 2);

  const [probe, setProbe] = useState<ShownProbe | null>(null);
  const [rangeMode, setRangeMode] = useState<RangeMode>("auto");
  // What Auto found, as last shown in the bar.
  const [found, setFound] = useState<FoundRange>(null);
  const foundRef = useRef<FoundRange>(null);
  // The inspector's point, in CSS pixels from the canvas's top left, and what it read there.
  const [point, setPoint] = useState<{x: number; y: number; touch: boolean} | null>(null);
  const [reading, setReading] = useState<PixelReading | null>(null);
  // A mouse reads values while an expression shows; a finger only with the inspector on, as it otherwise scrolls.
  const inspecting = props.inspect || probe !== null;
  const sizeRef = useLatest({width, height, pixels: [pixelWidth, pixelHeight] as [number, number]});
  const pointRef = useLatest(point);
  // Set when the canvas has drawn since the point was last read.
  const needsRead = useRef(false);
  const lastRead = useRef(0);
  const readPoint = useCallback((at = pointRef.current) => {
    const renderer = rendererRef.current;
    if (!renderer || !at) {
      return;
    }
    const {width, height, pixels} = sizeRef.current;
    const [x, y] = pixelAt(at.x, at.y, width, height, pixels);
    const next = renderer.readPixel(x, y);
    setReading(last => JSON.stringify(last) === JSON.stringify(next) ? last : next);
    needsRead.current = false;
    lastRead.current = performance.now();
  }, [pointRef, sizeRef]);
  const movePoint = (event: PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const at = {
      x: Math.min(rect.width, Math.max(0, event.clientX - rect.left)),
      y: Math.min(rect.height, Math.max(0, event.clientY - rect.top)),
      touch: event.pointerType !== "mouse",
    };
    setPoint(at);
    readPoint(at);
  };
  useEffect(() => {
    if (!inspecting || !props.inspect) {
      setPoint(p => inspecting && !p?.touch ? p : null);
    }
  }, [inspecting, props.inspect]);

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
    // A restart goes ahead, which also stops a layer stuck on a step.
    if (layerSteps?.busy && !restarts(steps.current, p.stepClock)) {
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
      // The thumbnail is the image, even while the canvas shows an expression.
      renderer.showProbe = false;
      try {
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
      } finally {
        renderer.showProbe = true;
        needsPresent.current = true;
      }
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
    // A hidden canvas (the bottom panel taking the screen above a tablet's keyboard) keeps its size,
    // so its simulation carries on when it comes back.
    const observer = new ResizeObserver(() => {
      if (element.clientWidth > 0 && element.clientHeight > 0) {
        setContainer([element.clientWidth, element.clientHeight, element.offsetTop]);
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

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
  }, [width, height, pixelWidth, pixelHeight, marginTop, container[0], container[2]]); // eslint-disable-line react-hooks/exhaustive-deps

  // Each build gets another try at full resolution, watched afresh.
  const frames = useRef(new SlowFrames());
  useEffect(() => {
    frames.current = new SlowFrames();
    setLowRes(false);
  }, [props.buildId]);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer || props.shaders === null) {
      return;
    }
    const result = renderer.setCode(props.shaders.code, props.shaders.buffers, props.shaders.shared);
    built.current = result.ok;
    props.onBuilt(result);
    if (result.ok) {
      restart();
    }
    needsRender.current = true;
  }, [props.shaders, props.buildId]); // eslint-disable-line react-hooks/exhaustive-deps

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
    needsRead.current = true;
  }, [props.probe, props.shaders, props.buildId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    rendererRef.current?.setRangeMode(rangeMode);
  }, [rangeMode]);

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
      code: layerCode, width: layerWidth, height: layerHeight, duration: props.duration, textures: props.layerTextures,
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
            onBusy: setLayerBusy,
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
  }, [layerCode, props.buildId, width, height, layerWidth, layerHeight, props.duration, props.layerTextures, propsRef, restart]);

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
    const loop = (now: number) => {
      if (!needsRender.current && needsPresent.current) {
        rendererRef.current?.refresh();
        needsRead.current = true;
      }
      needsPresent.current = false;
      if (needsRender.current) {
        needsRender.current = false;
        needsRead.current = true;
        renderFrame();
        const rate = frames.current.frame(now);
        if (rate !== null) {
          updates += 1;
          if (updates % 10 === 0) {
            const value = Math.round(rate);
            setFps(value > 20 ? Math.round(value / 3) * 3 : value);
          }
          if (frames.current.slow) {
            setLowRes(true);
          }
        }
      } else {
        frames.current.idle();
        // While nothing new draws, Auto catches up with the last frame.
        if (rendererRef.current?.findRange(now, true)) {
          rendererRef.current.present();
        }
      }
      const nextFound = rendererRef.current?.foundRange ?? null;
      if (nextFound?.[0] !== foundRef.current?.[0] || nextFound?.[1] !== foundRef.current?.[1]) {
        foundRef.current = nextFound;
        setFound(nextFound);
      }
      if (pointRef.current && needsRead.current && now - lastRead.current > READ_INTERVAL_MS) {
        readPoint();
      }
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, [renderFrame, pointRef, readPoint]);

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
            onPointerDown={event => {
              if (props.inspect && event.pointerType !== "mouse") {
                event.currentTarget.setPointerCapture(event.pointerId);
                movePoint(event);
              }
            }}
            onPointerMove={event => {
              if (event.pointerType === "mouse" ? inspecting : props.inspect && event.buttons) {
                movePoint(event);
              }
            }}
            onPointerLeave={event => {
              if (event.pointerType === "mouse") {
                setPoint(null);
              }
            }}
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
            <p>{Math.max(0, steps.current.rendered)}</p>
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
