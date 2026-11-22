import { Alert } from '@mantine/core';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, type PointerEvent } from 'react';
import { TbChevronLeft } from 'react-icons/tb';

import type { AspectRatio } from '../lib/document';
import { useLatest } from '../lib/useLatest';
import { fitCanvas } from './layout';
import { Renderer, type CompileResult } from './Renderer';

export interface CanvasLayout {
  width: number;   // displayed size in CSS pixels
  height: number;
  top: number;     // bottom edge of the canvas within the container's offset parent, for the player controls
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
  frameIndex: number;
  variableValues: number[];
  aspectRatio: AspectRatio;
  onBuilt(result: CompileResult): void;
  // The previous frame was cleared (new build, size or textures), so iFrame should restart at 0.
  onRestart(): void;
  onLayout(layout: CanvasLayout): void;
  onToggleWide(): void;
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
  const marginTop = Math.max(0, (container[1] - height) / 2);
  const marginSide = Math.max(0, (container[0] - width) / 2);

  const renderFrame = useCallback(() => {
    const p = propsRef.current;
    rendererRef.current?.render({
      time: p.time, duration: p.duration, frameIndex: p.frameIndex, variableValues: p.variableValues,
    });
  }, [propsRef]);

  useImperativeHandle(ref, () => ({
    captureFrame() {
      const canvas = canvasRef.current;
      if (!rendererRef.current || !canvas) {
        return null;
      }
      renderFrame();
      return canvas.toDataURL("image/png");  // Same task as the draw, so the buffer is still there.
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
    if (rendererRef.current?.setSize(width, height)) {
      props.onRestart();
    }
    needsRender.current = true;
    props.onLayout({width, height, top: container[2] + marginTop + height});
  }, [width, height, marginTop, container[2]]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer || props.shaders === null) {
      return;
    }
    const result = renderer.setCode(props.shaders.code, props.shaders.buffers, props.shaders.shared);
    props.onBuilt(result);
    if (result.ok) {
      props.onRestart();
    }
    needsRender.current = true;
  }, [props.shaders, props.buildId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    rendererRef.current?.setTextures(props.textureURLs);
    rendererRef.current?.clearTargets();
    propsRef.current.onRestart();
    needsRender.current = true;
  }, [props.textureURLs, propsRef]);

  useEffect(() => {
    needsRender.current = true;
  }, [props.time, props.variableValues, props.duration]);

  // Render on animation frames when something changed, keeping a smoothed frame rate.
  useEffect(() => {
    let id = 0;
    let last: number | null = null;
    let frameMs = 0;
    let updates = 0;
    const loop = (now: number) => {
      if (needsRender.current) {
        needsRender.current = false;
        renderFrame();
        if (last !== null) {
          frameMs = frameMs ? 0.9 * frameMs + 0.1 * (now - last) : now - last;
          updates += 1;
          if (updates % 10 === 0 && frameMs > 0) {
            const value = Math.round(1000 / frameMs);
            setFps(value > 20 ? Math.round(value / 3) * 3 : value);
          }
        }
        last = now;
      } else {
        last = null;
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
          <button
            type="button" id="toggleWideCanvas" aria-label="Toggle wide canvas"
            onClick={props.onToggleWide}
            style={{left: marginSide - 32, top: marginTop + height / 2}}
          >
            <TbChevronLeft />
          </button>
          <canvas ref={canvasRef} id="canvas" style={{width, height}} />
          <div className="fps" style={{top: marginTop + 8, right: marginSide + 8}}>
            <p>{width}&times;{height}px</p>
            {fps ? <p>{fps} fps</p> : null}
            <p>{props.frameIndex}</p>
          </div>
        </>
      )}
    </div>
  );
});

export default Canvas;
