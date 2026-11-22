// The bar between the code and the canvas on desktop: drag it, or use the arrow keys, to set how wide
// the canvas's side is. Double-click puts it back.
import { useRef, type KeyboardEvent, type PointerEvent, type RefObject } from 'react';

// The narrowest each side can be.
const MIN_PREVIEW = 240;
const MIN_EDITOR = 320;
const KEY_STEP = 32;

export function clampPreviewWidth(width: number, workspaceWidth: number): number {
  return Math.round(Math.max(MIN_PREVIEW, Math.min(width, workspaceWidth - MIN_EDITOR)));
}

// The CSS width for a chosen one, kept within the limits if the window narrows later.
export function previewWidthCSS(width: number): string {
  return `min(${width}px, max(${MIN_PREVIEW}px, 100% - ${MIN_EDITOR}px))`;
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
  // The canvas side's width as shown now, in pixels.
  current(): number;
  onChange(width: number): void;
  onReset(): void;
  onDragging(dragging: boolean): void;
}

export default function PaneDivider({workspace, current, onChange, onReset, onDragging}: PaneDividerProps) {
  const dragging = useRef(false);

  const widthAt = (clientX: number) => {
    const box = workspace.current!.getBoundingClientRect();
    return clampPreviewWidth(box.right - clientX, box.width);
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragging.current = true;
    onDragging(true);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (dragging.current) {
      onChange(widthAt(event.clientX));
    }
  };

  const onPointerUp = () => {
    if (dragging.current) {
      dragging.current = false;
      onDragging(false);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.key === "ArrowLeft" ? KEY_STEP : event.key === "ArrowRight" ? -KEY_STEP : 0;
    if (step) {
      event.preventDefault();
      onChange(clampPreviewWidth(current() + step, workspace.current!.getBoundingClientRect().width));
    }
  };

  return (
    <div
      className="paneDivider" role="separator" aria-orientation="vertical" aria-label="Resize the canvas"
      tabIndex={0} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp} onDoubleClick={onReset} onKeyDown={onKeyDown}
    />
  );
}
