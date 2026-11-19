import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Alert } from 'react-bootstrap';
import { FaAngleLeft } from 'react-icons/fa';

import AspectRatioPicker from '../dialogs/AspectRatioPicker';
import type { AspectRatio } from '../lib/document';
import type { LineError } from '../lib/types';
import { useLatest } from '../lib/useLatest';
import { fitCanvas } from './layout';
import { Renderer } from './Renderer';

export interface CanvasLayout {
  width: number;   // displayed size in CSS pixels
  height: number;
  top: number;     // bottom edge of the canvas within its container, for the player controls
}

export interface CanvasHandle {
  // Renders the current frame and returns it as a PNG data URL (for thumbnails).
  captureFrame(): string | null;
}

interface CanvasProps {
  code: string | null;  // the last built code
  buildId: number;      // bumps on every build, so building the same code again restarts iPrevFrame
  textureURLs: string[];
  time: number;
  duration: number;
  frameIndex: number;
  variableValues: number[];
  aspectRatio: AspectRatio;
  onAspectRatioChange(aspectRatio: AspectRatio): void;
  onBuilt(errors: LineError[]): void;
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
  const [container, setContainer] = useState<[number, number]>([0, 0]);
  const [fps, setFps] = useState<number | null>(null);
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
      setError("smoothstep needs WebGL 2, which this browser or device doesn't support.");
      return undefined;
    }
  }, []);

  useEffect(() => {
    const element = containerRef.current!;
    const observer = new ResizeObserver(() => setContainer([element.clientWidth, element.clientHeight]));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    rendererRef.current?.setSize(width, height);
    needsRender.current = true;
    props.onLayout({width, height, top: marginTop + height});
  }, [width, height, marginTop]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer || props.code === null) {
      return;
    }
    const result = renderer.setCode(props.code);
    props.onBuilt(result.ok ? [] : result.errors);
    needsRender.current = true;
  }, [props.code, props.buildId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    rendererRef.current?.setTextures(props.textureURLs);
    rendererRef.current?.clearTargets();
    needsRender.current = true;
  }, [props.textureURLs]);

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
    <div id="canvasContainer" ref={containerRef}>
      {error ? <Alert variant="warning">{error}</Alert> : (
        <>
          <button
            type="button" id="toggleWideCanvas" aria-label="Toggle wide canvas"
            onClick={props.onToggleWide}
            style={{left: marginSide - 32, top: marginTop + height / 2}}
          >
            <FaAngleLeft />
          </button>
          <canvas ref={canvasRef} id="canvas" style={{width, height}} />
          <AspectRatioPicker
            value={props.aspectRatio} onChange={props.onAspectRatioChange}
            top={marginTop + 8} left={marginSide + 8}
          />
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
