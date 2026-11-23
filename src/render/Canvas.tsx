import { Alert } from '@mantine/core';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, type PointerEvent } from 'react';

import type { AspectRatio } from '../lib/document';
import { useLatest } from '../lib/useLatest';
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

// The image's code, each buffer's and the code they share, as last built.
export interface Shaders {
  code: string;
  buffers: string[];
  shared: string;
}

interface CanvasProps {
  shaders: Shaders | null;
  buildId: number;      // bumps on every build, so building the same code again restarts iPrevFrame
  textureURLs: string[];
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
  const restart = useCallback(() => {
    steps.current = RESTART;
    propsRef.current.onRestart();
  }, [propsRef]);

  const renderFrame = useCallback(() => {
    const p = propsRef.current;
    const renderer = rendererRef.current;
    if (renderer) {
      steps.current = renderSteps(renderer, steps.current, p.stepClock, p.time,
        (time, frameIndex) => ({time, duration: p.duration, frameIndex, variableValues: p.variableValues}), 4);
    }
  }, [propsRef]);

  useImperativeHandle(ref, () => ({
    captureFrame() {
      const canvas = canvasRef.current;
      if (!rendererRef.current || !canvas) {
        return null;
      }
      renderFrame();
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
