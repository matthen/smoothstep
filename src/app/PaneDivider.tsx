// The bar between the code and the canvas on desktop: drag it, or use the arrow keys, to set how wide
// the canvas's side is. Double-click puts it back.
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type RefObject } from 'react';

// The narrowest each side can be.
export const MIN_PREVIEW = 240;
export const MIN_EDITOR = 320;
const KEY_STEP = 32;

export function clampPreviewWidth(width: number, workspaceWidth: number): number {
  return Math.round(Math.max(MIN_PREVIEW, Math.min(width, workspaceWidth - MIN_EDITOR)));
}

// The CSS width for a chosen one, kept within the limits if the window narrows later.
export function previewWidthCSS(width: number): string {
  return `min(${width}px, max(${MIN_PREVIEW}px, 100% - ${MIN_EDITOR}px))`;
}

// Whether a width is nearer the wide preset than the narrow one, as set in _app.scss's --preview-width.
export function nearerWidePreset(width: number, viewportWidth: number): boolean {
  const narrow = Math.min(512, 0.45 * viewportWidth);
  const wide = Math.min(768, 0.6 * viewportWidth);
  return width > (narrow + wide) / 2;
}

const KEY = "smoothstep.previewWidth";

export function storedPreviewWidth(): number | null {
  try {
    const value = Number(window.localStorage.getItem(KEY));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

export function storePreviewWidth(width: number | null) {
  try {
    if (width === null) {
      window.localStorage.removeItem(KEY);
    } else {
      window.localStorage.setItem(KEY, String(width));
    }
  } catch {
    // Not kept, so the next visit starts at the preset.
  }
}

interface PaneDividerProps {
  workspace: RefObject<HTMLElement | null>;
  onChange(width: number): void;
  onReset(): void;
  onDragging(dragging: boolean): void;
}

// How far the pointer must move before a press becomes a drag, so a click doesn't change the width.
const DRAG_THRESHOLD = 3;

export default function PaneDivider({workspace, onChange, onReset, onDragging}: PaneDividerProps) {
  const ref = useRef<HTMLDivElement>(null);
  // Where the press was, and how far it was from the canvas side's edge, so the edge doesn't jump to it.
  const drag = useRef<{startX: number; offset: number; moved: boolean} | null>(null);
  // The canvas side's width and the workspace's, for screen readers and the arrow keys.
  const [sizes, setSizes] = useState({width: 0, workspace: 0});

  useEffect(() => {
    const side = ref.current!.parentElement!;
    const whole = workspace.current!;
    const measure = () => setSizes({width: Math.round(side.clientWidth), workspace: Math.round(whole.clientWidth)});
    const observer = new ResizeObserver(measure);
    observer.observe(side);
    observer.observe(whole);
    return () => observer.disconnect();
  }, [workspace]);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    const box = workspace.current!.getBoundingClientRect();
    drag.current = {startX: event.clientX, offset: sizes.width - (box.right - event.clientX), moved: false};
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current) {
      return;
    }
    if (!current.moved && Math.abs(event.clientX - current.startX) < DRAG_THRESHOLD) {
      return;
    }
    if (!current.moved) {
      current.moved = true;
      onDragging(true);
    }
    const box = workspace.current!.getBoundingClientRect();
    onChange(clampPreviewWidth(box.right - event.clientX + current.offset, box.width));
  };

  // Ends the drag however the pointer was let go of, including losing it to another window.
  const onLostPointerCapture = () => {
    if (drag.current?.moved) {
      onDragging(false);
    }
    drag.current = null;
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey) {
      return;
    }
    const step = event.key === "ArrowLeft" ? KEY_STEP : event.key === "ArrowRight" ? -KEY_STEP : 0;
    if (step) {
      event.preventDefault();
      onChange(clampPreviewWidth(sizes.width + step, sizes.workspace));
    }
  };

  return (
    <div
      ref={ref} className="paneDivider" role="separator" aria-orientation="vertical"
      aria-label="Resize the canvas" aria-valuenow={sizes.width} aria-valuemin={MIN_PREVIEW}
      aria-valuemax={Math.max(MIN_PREVIEW, sizes.workspace - MIN_EDITOR)} tabIndex={0}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onLostPointerCapture={onLostPointerCapture}
      onDoubleClick={onReset} onKeyDown={onKeyDown}
    />
  );
}
