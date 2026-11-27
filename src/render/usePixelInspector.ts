import { useCallback, useEffect, useRef, useState, type PointerEvent, type RefObject } from 'react';

import { useLatest } from '../lib/useLatest';
import { pixelAt } from './inspect';
import type { PixelReading, Renderer } from './Renderer';

// How often, at most, the inspector reads its pixel again while the animation plays or the pointer moves.
const READ_INTERVAL_MS = 100;

interface Options {
  rendererRef: RefObject<Renderer | null>;
  // The canvas's CSS size, and its drawing size in pixels.
  width: number;
  height: number;
  pixels: [number, number];
  // Whether the inspector is on, and whether an expression shows in place of the image.
  inspect: boolean;
  probeShown: boolean;
}

// The point the inspector reads, in CSS pixels from the canvas's top left, and the values it read there.
export function usePixelInspector({rendererRef, width, height, pixels, inspect, probeShown}: Options) {
  const [point, setPoint] = useState<{x: number; y: number; touch: boolean} | null>(null);
  const [reading, setReading] = useState<PixelReading | null>(null);
  // A mouse reads values while an expression shows; a finger only with the inspector on, as it otherwise scrolls.
  const inspecting = inspect || probeShown;
  const sizeRef = useLatest({width, height, pixels});
  const pointRef = useLatest(point);
  // Set when the canvas has drawn or the point has moved since it was last read.
  const needsReadRef = useRef(false);
  const lastRead = useRef(0);
  const readPoint = useCallback(() => {
    const at = pointRef.current;
    const renderer = rendererRef.current;
    if (!renderer || !at) {
      return;
    }
    const {width, height, pixels} = sizeRef.current;
    const [x, y] = pixelAt(at.x, at.y, width, height, pixels);
    const next = renderer.readPixel(x, y);
    setReading(last => JSON.stringify(last) === JSON.stringify(next) ? last : next);
    needsReadRef.current = false;
    lastRead.current = performance.now();
  }, [pointRef, sizeRef, rendererRef]);
  const movePoint = (event: PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const at = {
      x: Math.min(rect.width, Math.max(0, event.clientX - rect.left)),
      y: Math.min(rect.height, Math.max(0, event.clientY - rect.top)),
      touch: event.pointerType !== "mouse",
    };
    setPoint(at);
    // The render loop's readIfDue reads it, so a fast pointer reads at most every READ_INTERVAL_MS.
    pointRef.current = at;
    needsReadRef.current = true;
  };
  useEffect(() => {
    if (!inspecting || !inspect) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- forgets the point, so it doesn't come back when inspecting does
      setPoint(p => inspecting && !p?.touch ? p : null);
    }
  }, [inspecting, inspect]);

  // Reads the point again once the canvas has drawn, at most every READ_INTERVAL_MS.
  const readIfDue = useCallback((now: number) => {
    if (pointRef.current && needsReadRef.current && now - lastRead.current > READ_INTERVAL_MS) {
      readPoint();
    }
  }, [pointRef, readPoint]);

  const canvasHandlers = {
    onPointerDown: (event: PointerEvent<HTMLCanvasElement>) => {
      if (inspect && event.pointerType !== "mouse") {
        event.currentTarget.setPointerCapture(event.pointerId);
        movePoint(event);
      }
    },
    onPointerMove: (event: PointerEvent<HTMLCanvasElement>) => {
      if (event.pointerType === "mouse" ? inspecting : inspect && event.buttons) {
        movePoint(event);
      }
    },
    onPointerLeave: (event: PointerEvent<HTMLCanvasElement>) => {
      if (event.pointerType === "mouse") {
        setPoint(null);
        // Or it shows at the next point until that's read.
        setReading(null);
      }
    },
  };

  return {point, reading, inspecting, needsReadRef, readIfDue, canvasHandlers};
}
