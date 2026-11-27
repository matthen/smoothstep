import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from 'react';

import {
  clampZoom, DEFAULT_PX_PER_SECOND, fitPxPerSecond, rulerTicks, timeAreaWidth, timeToX, xToTime,
} from './geometry';

// The width of the rows' visible part, and of the row labels to its left.
interface View {
  width: number;
  labels: number;
}

// A time to keep at the same place on screen, `viewX` pixels from the rows' left edge, after a zoom.
interface Anchor {
  time: number;
  viewX: number;
}

interface Pinch {
  distance: number;
  zoom: number;
  time: number;
}

interface Options {
  // The latest time any row or the duration reaches.
  maxTime: number;
  // The scale a drag started at, which holds until it ends, or null.
  frozenPxPerSecond: number | null;
  currentTime: number;
  // A second finger came down, to pinch.
  onPinchStart: () => void;
  // Whether a held finger is dragging out a transition, so a touch move mustn't scroll.
  fingerHeld: () => boolean;
}

// The timeline's scale and scroll: zooming with buttons, ctrl + scroll and pinches, and following the playhead.
export function useTimelineZoom({maxTime, frozenPxPerSecond, currentTime, onPinchStart, fingerHeld}: Options) {
  const gridRef = useRef<HTMLDivElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  // How far the grid is scrolled sideways, so the ruler only draws the ticks in sight.
  const [scrollLeft, setScrollLeft] = useState(0);
  const [view, setView] = useState<View | null>(null);
  const [zoom, setZoom] = useState(1);
  const anchorRef = useRef<Anchor | null>(null);
  const pinchRef = useRef<Pinch | null>(null);
  const lastTimeRef = useRef(currentTime);

  const fitScale = view ? fitPxPerSecond(view.width, maxTime) : DEFAULT_PX_PER_SECOND;
  const zoomLevel = clampZoom(zoom, fitScale);
  const pps = frozenPxPerSecond ?? fitScale * zoomLevel;
  const x = (seconds: number) => timeToX(seconds, pps);
  const width = timeAreaWidth(maxTime, pps);
  const viewWidth = view?.width ?? width;
  const ruler = rulerTicks(pps, Math.max(0, xToTime(scrollLeft, pps) - 1),
    Math.min(maxTime, xToTime(scrollLeft + viewWidth, pps) + 1), maxTime);

  // Measured again when the panel is shown, as a hidden one measures zero.
  useLayoutEffect(() => {
    const grid = gridRef.current;
    const labels = labelsRef.current;
    if (!grid || !labels) {
      return;
    }
    const measure = () => {
      const labelWidth = labels.getBoundingClientRect().width;
      // A pixel spare, so rounding never adds a scrollbar.
      const width = Math.floor(grid.clientWidth - labelWidth) - 1;
      if (width > 0) {
        setView(old => old?.width === width && old.labels === labelWidth ? old : {width, labels: labelWidth});
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(grid);
    observer.observe(labels);
    return () => observer.disconnect();
  }, []);

  // After a zoom, scroll so the anchored time stays where it was.
  useLayoutEffect(() => {
    const grid = gridRef.current;
    const anchor = anchorRef.current;
    if (grid && anchor) {
      anchorRef.current = null;
      grid.scrollLeft = Math.max(0, timeToX(anchor.time, pps) - anchor.viewX);
      setScrollLeft(grid.scrollLeft);
    }
  }, [pps]);

  function zoomTo(next: number, anchor: Anchor) {
    const clamped = clampZoom(next, fitScale);
    if (clamped !== zoomLevel) {
      anchorRef.current = anchor;
      setZoom(clamped);
    }
  }

  // The zoom buttons keep the playhead in place when it's in sight, or else the middle.
  function zoomBy(factor: number) {
    const playheadX = x(currentTime) - scrollLeft;
    const viewX = playheadX >= 0 && playheadX <= viewWidth ? playheadX : viewWidth / 2;
    zoomTo(zoomLevel * factor, {time: xToTime(scrollLeft + viewX, pps), viewX});
  }

  // The time under a point on screen, and how far it is from the rows' visible left edge.
  function anchorAt(clientX: number): Anchor {
    const grid = gridRef.current!;
    const viewX = clientX - grid.getBoundingClientRect().left - (view?.labels ?? 0);
    return {time: xToTime(grid.scrollLeft + viewX, pps), viewX};
  }

  // Ctrl or cmd and the wheel zooms around the pointer, as does a trackpad pinch.
  const onWheel = useEffectEvent((event: WheelEvent) => {
    if (!(event.ctrlKey || event.metaKey)) {
      return;
    }
    event.preventDefault();
    const delta = event.deltaY * (event.deltaMode === 1 ? 20 : 1);
    zoomTo(zoomLevel * Math.exp(-Math.max(-60, Math.min(60, delta)) * 0.01), anchorAt(event.clientX));
  });
  // Two fingers pinch to zoom on touch screens.
  const onTouchStart = useEffectEvent((event: TouchEvent) => {
    if (event.touches.length !== 2) {
      return;
    }
    const [a, b] = [event.touches[0]!, event.touches[1]!];
    onPinchStart();
    pinchRef.current = {
      distance: Math.max(1, Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)),
      zoom: zoomLevel,
      time: anchorAt((a.clientX + b.clientX) / 2).time,
    };
  });
  const onTouchMove = useEffectEvent((event: TouchEvent) => {
    if (fingerHeld()) {
      event.preventDefault();
      return;
    }
    const pinch = pinchRef.current;
    if (!pinch || event.touches.length !== 2) {
      return;
    }
    event.preventDefault();
    const [a, b] = [event.touches[0]!, event.touches[1]!];
    const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    const {viewX} = anchorAt((a.clientX + b.clientX) / 2);
    zoomTo(pinch.zoom * distance / pinch.distance, {time: pinch.time, viewX});
  });
  const onTouchEnd = useEffectEvent((event: TouchEvent) => {
    if (event.touches.length < 2) {
      pinchRef.current = null;
    }
  });
  useEffect(() => {
    const grid = gridRef.current!;
    const wheel = (event: WheelEvent) => onWheel(event);
    const start = (event: TouchEvent) => onTouchStart(event);
    const move = (event: TouchEvent) => onTouchMove(event);
    const end = (event: TouchEvent) => onTouchEnd(event);
    grid.addEventListener("wheel", wheel, {passive: false});
    grid.addEventListener("touchstart", start, {passive: true});
    grid.addEventListener("touchmove", move, {passive: false});
    grid.addEventListener("touchend", end);
    grid.addEventListener("touchcancel", end);
    return () => {
      grid.removeEventListener("wheel", wheel);
      grid.removeEventListener("touchstart", start);
      grid.removeEventListener("touchmove", move);
      grid.removeEventListener("touchend", end);
      grid.removeEventListener("touchcancel", end);
    };
  }, []);

  // Keep the playhead in view when zoomed in: when it runs off the right edge, or jumps back off
  // the left (looping or seeking), scroll it to near the left edge.
  const followPlayhead = useEffectEvent((previous: number) => {
    const grid = gridRef.current;
    if (!grid || grid.scrollWidth <= grid.clientWidth) {
      return;
    }
    const playheadX = x(currentTime);
    // While it plays, only when it was in view a moment ago, so you can scroll away from it. A seek,
    // which jumps further than a frame's worth, always brings it into view.
    const wasInView = x(previous) >= grid.scrollLeft && x(previous) <= grid.scrollLeft + viewWidth;
    const seeked = playheadX - x(previous) > viewWidth / 4;
    const pastRight = currentTime > previous && (wasInView || seeked) && playheadX > grid.scrollLeft + viewWidth - 8;
    const pastLeft = currentTime < previous && playheadX < grid.scrollLeft;
    if (pastRight || pastLeft) {
      grid.scrollLeft = Math.max(0, playheadX - 24);
    }
  });
  useEffect(() => {
    const previous = lastTimeRef.current;
    lastTimeRef.current = currentTime;
    followPlayhead(previous);
  }, [currentTime]);

  return {
    gridRef, labelsRef, setScrollLeft, pps, x, width, viewWidth, ruler, zoomTo, zoomBy,
    canZoomOut: zoomLevel > 1, canZoomIn: zoomLevel < clampZoom(Infinity, fitScale),
  };
}
