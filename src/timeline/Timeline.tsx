import {useEffect, useEffectEvent, useLayoutEffect, useRef, useState} from "react";
import type {PointerEvent as ReactPointerEvent} from "react";
import {ActionIcon, NativeSelect, NumberInput, Tooltip} from "@mantine/core";
import {useMediaQuery} from "@mantine/hooks";
import {TbArrowAutofitWidth, TbPlus, TbTrash, TbZoomIn, TbZoomOut} from "react-icons/tb";
import {variableValue} from "../lib/document";
import type {Transition, TransitionType, Variable} from "../lib/document";
import {rowPaths, valueRange} from "./curves";
import {
  clampTime, clampZoom, DEFAULT_PX_PER_SECOND, dragDeltaDSecs, draggedDuration, durationDSecs, fitPxPerSecond,
  grabMode, hoverEndDSecs, hoverStartDSecs, maxTimeFor, ROW_HEIGHT, roundDSecs, roundDuration, rowAt, rulerTicks,
  snapDSecs, timeAreaWidth, timeToX, xToTime,
} from "./geometry";
import type {GrabMode} from "./geometry";
import {keyAction, shortcutsAllowed} from "./keys";
import {
  dragTransition, insertTransition, isInsertable, parseValue, removeTransition, replaceTransition,
  withTransitions,
} from "./transitions";
import {useEasedRanges} from "./useEasedRanges";
import "./timeline.scss";

export interface TimelineProps {
  variables: Variable[];
  // What the code calls each variable with #define, if anything (see names.ts).
  names?: (string | null)[];
  variableValues: number[];
  onVariablesChange(variables: Variable[]): void;
  // How many rows to show, from iFloat0, and a way to show one more.
  rowCount: number;
  onAddRow(): void;
  duration: number;
  currentTime: number;
  onSeek(time: number): void;
  onDurationChange(duration: number): void;
}

// Transitions are identified by their row and start, which are unique as they don't overlap.
interface Selection {
  row: number;
  startDSecs: number;
}

type Gesture =
  | {kind: "idle"}
  // A new transition: dragged out with the button held, or clicked twice (`released` after the first).
  | {kind: "creating"; row: number; startDSecs: number; endDSecs: number; released: boolean; byTouch: boolean}
  // The scale stays put while dragging, though the timeline's length can change.
  | {kind: "dragging"; mode: GrabMode; row: number; index: number; original: Transition[]; startX: number;
     moved: Transition; pxPerSecond: number}
  | {kind: "scrubbing"}
  | {kind: "duration"; startX: number; startDuration: number; latest: number; pxPerSecond: number};

// Text typed into the value inputs, kept until it's valid and the input loses focus.
interface Drafts {
  start?: string;
  end?: string;
  startTime?: string;
  endTime?: string;
}

// A time in seconds, to a hundredth, without trailing zeros.
const seconds = (dsecs: number) => String(Math.round(dsecs * 10) / 100);
// A number box's value as text, without the float noise its arrows add (0.45 + 0.1 is 0.55000000000000004).
const numberText = (value: number | string) => typeof value === "number" ? String(Number(value.toFixed(6))) : value;
// The same for the heading, which always shows at least a tenth, like 2.0.
const headingSeconds = (dsecs: number) => (dsecs / 10).toFixed(Number.isInteger(dsecs) ? 1 : 2);

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

const TYPE_OPTIONS: readonly {value: TransitionType; label: string}[] = [
  {value: "smoothstep", label: "smoothstep"}, {value: "linear", label: "linear"}, {value: "step", label: "step"},
  {value: "easeIn", label: "ease in"}, {value: "easeOut", label: "ease out"}, {value: "overshoot", label: "overshoot"},
];
const ZOOM_STEP = 2;

export default function Timeline(props: TimelineProps) {
  const {variables, variableValues, onVariablesChange, duration, currentTime, onSeek, onDurationChange} = props;
  const rowCount = Math.min(props.rowCount, variables.length);
  const name = (row: number) => props.names?.[row] ?? null;
  const rootRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  const timeAreaRef = useRef<HTMLDivElement>(null);
  // How far the grid is scrolled sideways, so the ruler only draws the ticks in sight.
  const [scrollLeft, setScrollLeft] = useState(0);
  const [view, setView] = useState<View | null>(null);
  const [zoom, setZoom] = useState(1);
  const anchorRef = useRef<Anchor | null>(null);
  const pinchRef = useRef<Pinch | null>(null);
  // The fingers down on the rows, and whether two were down at once since the last were lifted.
  const touchesRef = useRef(new Set<number>());
  const multiTouchRef = useRef(false);
  const lastTimeRef = useRef(currentTime);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [hover, setHover] = useState<Selection | null>(null);
  const [gesture, setGestureState] = useState<Gesture>({kind: "idle"});
  // Pointer handlers read the gesture from here, as moves can arrive before React re-renders.
  const gestureRef = useRef<Gesture>(gesture);
  const [drafts, setDrafts] = useState<Drafts>({});
  const touch = useMediaQuery("(hover: none)");

  const maxDSecs = durationDSecs(duration);
  const maxTime = maxTimeFor(variables, duration);
  const fitScale = view ? fitPxPerSecond(view.width, maxTime) : DEFAULT_PX_PER_SECOND;
  const zoomLevel = clampZoom(zoom, fitScale);
  const pps = gesture.kind === "duration" || gesture.kind === "dragging" ? gesture.pxPerSecond : fitScale * zoomLevel;
  const pxPerDSec = pps / 10;
  const x = (seconds: number) => timeToX(seconds, pps);
  const width = timeAreaWidth(maxTime, pps);
  const viewWidth = view?.width ?? width;
  const ruler = rulerTicks(pps, Math.max(0, xToTime(scrollLeft, pps) - 1),
    Math.min(maxTime, xToTime(scrollLeft + viewWidth, pps) + 1), maxTime);
  const currentDSecs = currentTime * 10;
  const ranges = useEasedRanges(variables.slice(0, rowCount).map(v => valueRange(v.transitions)));

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

  const selectedIndex = selection === null ? -1 :
    variables[selection.row]?.transitions.findIndex(t => t.startDSecs === selection.startDSecs) ?? -1;
  const selected = selection && selectedIndex >= 0 ?
    variables[selection.row]?.transitions[selectedIndex] : undefined;

  function setGesture(next: Gesture) {
    gestureRef.current = next;
    setGestureState(next);
  }

  function select(next: Selection | null) {
    setSelection(next);
    setDrafts({});
    setHover(null);
  }

  function setRow(row: number, transitions: Transition[]) {
    onVariablesChange(withTransitions(variables, row, transitions));
  }

  function deleteSelected() {
    if (selection && selected) {
      setRow(selection.row, removeTransition(variables[selection.row]!.transitions, selectedIndex));
    }
    select(null);
    setGesture({kind: "idle"});
  }

  function updateSelected(changes: Partial<Transition>) {
    if (selection && selected) {
      const transitions = variables[selection.row]!.transitions;
      setRow(selection.row, replaceTransition(transitions, selectedIndex, {...selected, ...changes}));
    }
  }

  function changeValue(field: "start" | "end", text: string) {
    setDrafts(d => ({...d, [field]: text}));
    const value = parseValue(text);
    if (value !== null) {
      updateSelected(field === "start" ? {startValue: value} : {endValue: value});
    }
  }

  function blurValue(field: "start" | "end") {
    const text = drafts[field];
    if (text !== undefined && parseValue(text) !== null) {
      setDrafts(d => ({...d, [field]: undefined}));
    }
  }

  // A typed start or end time in seconds, as tenths, or null if it isn't one the transition can take:
  // it has to stay after the one before, before the one after, within the timeline, and not empty.
  function typedTime(field: "startTime" | "endTime", text: string): number | null {
    const value = parseValue(text);
    if (!selection || !selected || value === null) {
      return null;
    }
    const dsecs = roundDSecs(value * 10);
    const startDSecs = field === "startTime" ? dsecs : selected.startDSecs;
    const endDSecs = field === "endTime" ? dsecs : selected.endDSecs;
    const transitions = variables[selection.row]!.transitions;
    return isInsertable(transitions, startDSecs, endDSecs, Math.max(maxDSecs, selected.endDSecs), selectedIndex) ?
      dsecs : null;
  }

  function changeTime(field: "startTime" | "endTime", text: string) {
    setDrafts(d => ({...d, [field]: text}));
    const dsecs = typedTime(field, text);
    if (dsecs !== null && selection) {
      updateSelected(field === "startTime" ? {startDSecs: dsecs} : {endDSecs: dsecs});
      if (field === "startTime") {
        setSelection({row: selection.row, startDSecs: dsecs});
      }
    }
  }

  function blurTime(field: "startTime" | "endTime") {
    setDrafts(d => ({...d, [field]: undefined}));
  }

  function create(row: number, startDSecs: number, endDSecs: number) {
    const transitions = variables[row]!.transitions;
    setGesture({kind: "idle"});
    if (!isInsertable(transitions, startDSecs, endDSecs, maxDSecs)) {
      setHover(null);
      return;
    }
    // A first transition starts from the value its slider set.
    const value = transitions.length > 0 ? variableValue(transitions, startDSecs / 10) : variables[row]!.value ?? 0;
    const inserted = insertTransition(transitions, {startDSecs, endDSecs, startValue: value, endValue: value, type: "smoothstep"});
    setRow(row, inserted.transitions);
    select({row, startDSecs});
  }

  // Pointer position relative to the rows, which scroll with the timeline.
  function position(event: {clientX: number; clientY: number}) {
    const rect = timeAreaRef.current!.getBoundingClientRect();
    return {x: event.clientX - rect.left, y: event.clientY - rect.top};
  }

  function updateHover(x: number, y: number) {
    const row = rowAt(y, rowCount);
    if (row === null) {
      return;
    }
    const startDSecs = hoverStartDSecs(x, pps);
    const next = isInsertable(variables[row]!.transitions, startDSecs, startDSecs + 1, maxDSecs) ?
      {row, startDSecs} : null;
    if (next?.row !== hover?.row || next?.startDSecs !== hover?.startDSecs) {
      setHover(next);
    }
  }

  function capture(event: ReactPointerEvent) {
    timeAreaRef.current?.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: ReactPointerEvent) {
    const gesture = gestureRef.current;
    const {x, y} = position(event);
    switch (gesture.kind) {
      case "scrubbing":
        onSeek(clampTime(xToTime(x, pps), duration));
        return;
      case "duration": {
        const latest = draggedDuration(gesture.startDuration, x - gesture.startX, gesture.pxPerSecond);
        if (latest !== gesture.latest) {
          setGesture({...gesture, latest});
          onDurationChange(latest);
        }
        return;
      }
      case "dragging": {
        const moved = dragTransition(gesture.original, gesture.index, gesture.mode, dragDeltaDSecs(x - gesture.startX, pps), maxDSecs, snapDSecs(pps));
        if (moved.startDSecs !== gesture.moved.startDSecs || moved.endDSecs !== gesture.moved.endDSecs) {
          setGesture({...gesture, moved});
          setRow(gesture.row, replaceTransition(gesture.original, gesture.index, moved));
          setSelection({row: gesture.row, startDSecs: moved.startDSecs});
        }
        return;
      }
      case "creating": {
        const endDSecs = hoverEndDSecs(x, gesture.startDSecs, pps);
        if (endDSecs !== gesture.endDSecs &&
            isInsertable(variables[gesture.row]!.transitions, gesture.startDSecs, endDSecs, maxDSecs)) {
          setGesture({...gesture, endDSecs});
        }
        return;
      }
      case "idle":
        // A finger has no hover, and its moves are scrolls.
        if (!selected && event.pointerType !== "touch") {
          updateHover(x, y);
        }
    }
  }

  function cancelCreating() {
    setGesture({kind: "idle"});
    setHover(null);
  }

  function handlePointerDown(event: ReactPointerEvent) {
    const current = gestureRef.current;
    // Two fingers are a pinch, which neither starts nor ends a transition.
    if (event.pointerType === "touch") {
      touchesRef.current.add(event.pointerId);
      if (touchesRef.current.size > 1) {
        multiTouchRef.current = true;
        if (current.kind === "creating" && !current.released) {
          cancelCreating();
        }
        return;
      }
      // The second tap of a two-tap creation counts once it lifts, in case it's the start of a pinch.
      if (current.kind === "creating" && current.released) {
        return;
      }
    }
    // The second click of a click-twice creation sets the end where it lands.
    if (current.kind === "creating" && current.released) {
      const {x} = position(event);
      const endDSecs = hoverEndDSecs(x, current.startDSecs, pps);
      if (isInsertable(variables[current.row]!.transitions, current.startDSecs, endDSecs, maxDSecs)) {
        setGesture({...current, endDSecs});
      }
      return;
    }
    if (event.button !== 0 || current.kind !== "idle") {
      return;
    }
    if (selected) {
      if ((event.target as Element).classList.contains("variableRow")) {
        select(null);
      }
      return;
    }
    const {x, y} = position(event);
    const row = rowAt(y, rowCount);
    if (row === null) {
      return;
    }
    const startDSecs = hoverStartDSecs(x, pps);
    if (isInsertable(variables[row]!.transitions, startDSecs, startDSecs + 1, maxDSecs)) {
      const byTouch = event.pointerType === "touch";
      if (!byTouch) {
        setHover({row, startDSecs});
      }
      setGesture({kind: "creating", row, startDSecs, endDSecs: startDSecs + 1, released: false, byTouch});
      capture(event);
    }
  }

  // Forgets a lifted finger, and says whether it was part of a pinch.
  function liftTouch(event: ReactPointerEvent): boolean {
    const wasPinch = multiTouchRef.current;
    touchesRef.current.delete(event.pointerId);
    if (touchesRef.current.size === 0) {
      multiTouchRef.current = false;
    }
    return wasPinch;
  }

  function handlePointerUp(event: ReactPointerEvent) {
    const gesture = gestureRef.current;
    if (event.pointerType === "touch") {
      if (liftTouch(event)) {
        return;
      }
      // A touch can't hover, so the second tap sets the end where it lifts. A second tap in another
      // row, or where the transition can't end, cancels it instead.
      if (gesture.kind === "creating" && gesture.released) {
        const {x, y} = position(event);
        const endDSecs = hoverEndDSecs(x, gesture.startDSecs, pps);
        const fits = isInsertable(variables[gesture.row]!.transitions, gesture.startDSecs, endDSecs, maxDSecs);
        if (fits && Math.floor(y / ROW_HEIGHT) === gesture.row) {
          create(gesture.row, gesture.startDSecs, endDSecs);
        } else {
          cancelCreating();
        }
        return;
      }
    }
    switch (gesture.kind) {
      case "creating":
        if (gesture.released || gesture.endDSecs > gesture.startDSecs + 1) {
          create(gesture.row, gesture.startDSecs, gesture.endDSecs);
        } else {
          setGesture({...gesture, released: true});
        }
        return;
      case "duration":
        onDurationChange(roundDuration(gesture.latest));
        break;
    }
    setGesture({kind: "idle"});
  }

  function handlePointerLeave(event: ReactPointerEvent) {
    // Touch pointers leave on every lift, which would cancel a click-twice creation.
    if (event.pointerType === "touch") {
      return;
    }
    const {kind} = gestureRef.current;
    if (kind === "idle" || kind === "creating") {
      cancelCreating();
    }
  }

  function handleTransitionPointerDown(event: ReactPointerEvent<HTMLDivElement>, row: number, index: number) {
    const current = gestureRef.current;
    if (event.button !== 0 || (current.kind === "creating" && !current.released)) {
      return;
    }
    // Picking a transition abandons a half-made one.
    if (current.kind === "creating") {
      cancelCreating();
    }
    event.stopPropagation();
    const transitions = variables[row]!.transitions;
    if (!(selection?.row === row && selectedIndex === index)) {
      select({row, startDSecs: transitions[index]!.startDSecs});
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const mode = grabMode(event.clientX - rect.left, rect.width);
    const original = transitions[index]!;
    setGesture({
      kind: "dragging", mode, row, index, original: transitions, startX: position(event).x, moved: original, pxPerSecond: pps,
    });
    capture(event);
  }

  // The playhead, or anywhere on the ruler, seeks and then scrubs as the pointer moves.
  function handleScrubberPointerDown(event: ReactPointerEvent) {
    if (event.button !== 0) {
      return;
    }
    event.stopPropagation();
    if (gestureRef.current.kind === "creating") {
      cancelCreating();
    }
    setHover(null);
    onSeek(clampTime(xToTime(position(event).x, pps), duration));
    setGesture({kind: "scrubbing"});
    capture(event);
  }

  function handleDurationPointerDown(event: ReactPointerEvent) {
    if (event.button !== 0) {
      return;
    }
    event.stopPropagation();
    select(null);
    setGesture({kind: "duration", startX: position(event).x, startDuration: duration, latest: duration, pxPerSecond: pps});
    capture(event);
  }

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
    const current = gestureRef.current;
    if (current.kind === "creating" && !current.released) {
      cancelCreating();
    }
    pinchRef.current = {
      distance: Math.max(1, Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)),
      zoom: zoomLevel,
      time: anchorAt((a.clientX + b.clientX) / 2).time,
    };
  });
  const onTouchMove = useEffectEvent((event: TouchEvent) => {
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

  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (selected && keyAction(event)?.type === "deleteTransition" && shortcutsAllowed(event.target, event.key)) {
      event.preventDefault();
      deleteSelected();
    }
  });
  const onDocumentPointerDown = useEffectEvent((event: PointerEvent) => {
    if (rootRef.current?.contains(event.target as Node)) {
      return;
    }
    if (selection) {
      select(null);
    }
    if (gestureRef.current.kind === "creating") {
      cancelCreating();
    }
  });
  useEffect(() => {
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onDocumentPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onDocumentPointerDown);
    };
  }, []);

  // A touch shows its transition only once it lifts as a tap, so a swipe to scroll doesn't flash one.
  const creating = gesture.kind === "creating" && !(gesture.byTouch && !gesture.released) ? gesture : null;
  const pending = creating ? {row: creating.row, startDSecs: creating.startDSecs, endDSecs: creating.endDSecs as number | null} :
    hover ? {...hover, endDSecs: null} : null;
  const heading = selected && selection ? {row: selection.row, ...selected} : pending;
  const resizing = gesture.kind === "scrubbing" || gesture.kind === "duration" ||
    (gesture.kind === "dragging" && gesture.mode !== "move");
  const markerZ = creating ? 0 : 1000;
  const rowsHeight = rowCount * ROW_HEIGHT;
  const canAddRow = rowCount < variables.length;
  const postDuration = {left: x(duration), width: Math.max(0, width - x(duration))};
  const blockStyle =(startDSecs: number, endDSecs: number) => ({
    left: startDSecs * pxPerDSec,
    width: Math.max(3, (endDSecs - startDSecs) * pxPerDSec),
  });

  return (
    <div id="animationControls" ref={rootRef}>
      <div className="properties">
        {selected &&
          <ActionIcon variant="subtle" color="gray" onClick={deleteSelected} className="delete" aria-label="Delete transition">
            <TbTrash />
          </ActionIcon>}
        {heading &&
          <h4>
            {name(heading.row) ?? "iFloat" + heading.row}
            {name(heading.row) && <span className="floatName"> iFloat{heading.row}</span>}
            {/* A selected transition's times are in their boxes below. */}
            {!selected &&
              <span> {headingSeconds(heading.startDSecs)}
                {heading.endDSecs !== null && <> &mdash; {headingSeconds(heading.endDSecs)}</>}s
              </span>}
          </h4>}
        {!heading &&
          <p className="hint">
            {touch ? "Tap where a transition starts, then where it ends." : "Click or drag in a row to add a transition."}
          </p>}
        {/* Not on touch screens, where it would shift the rows between a transition's two taps. */}
        {!heading && !touch && variables.every(variable => variable.transitions.length === 0) &&
          <p className="hint">
            Then use <code>iFloat0</code> to <code>iFloat15</code> in your code, like any number.
            {" "}<code>#define size iFloat0</code> names a row.
          </p>}
        {selected &&
          <form className="transitionForm" onSubmit={e => e.preventDefault()}>
            {(["startTime", "endTime"] as const).map(field => {
              const dsecs = field === "startTime" ? selected.startDSecs : selected.endDSecs;
              const text = drafts[field] ?? seconds(dsecs);
              return (
                <NumberInput
                  key={field} id={field + "Input"} label={field === "startTime" ? "start time" : "end time"}
                  size="xs" step={0.1} min={0} allowNegative={false} clampBehavior="none" inputMode="decimal" suffix=" s"
                  value={text}
                  onChange={v => changeTime(field, numberText(v))}
                  onBlur={() => blurTime(field)}
                  error={drafts[field] !== undefined && typedTime(field, text) === null}
                />
              );
            })}
            {(["start", "end"] as const).map(field => {
              const value = field === "start" ? selected.startValue : selected.endValue;
              const text = drafts[field] ?? String(value);
              return (
                <NumberInput
                  key={field} id={field + "ValueInput"} label={field + " value"} size="xs"
                  step={0.1} clampBehavior="none" value={text}
                  onChange={v => changeValue(field, numberText(v))}
                  onBlur={() => blurValue(field)}
                  error={parseValue(text) === null}
                />
              );
            })}
            <NativeSelect
              id="typeInput" label="transition" size="xs" value={selected.type}
              onChange={e => updateSelected({type: e.target.value as TransitionType})}
              data={[...TYPE_OPTIONS]}
            />
          </form>}
      </div>
      <div className="gridContainer" ref={gridRef} onScroll={event => setScrollLeft(event.currentTarget.scrollLeft)}>
        <div className="gridContent">
          <div className="corner">
            <Tooltip label={touch ? "Zoom out (or pinch)" : "Zoom out (or ctrl + scroll)"}>
              <ActionIcon
                variant="subtle" color="gray" size="sm" aria-label="Zoom out" disabled={zoomLevel <= 1}
                onClick={() => zoomBy(1 / ZOOM_STEP)}
              >
                <TbZoomOut />
              </ActionIcon>
            </Tooltip>
            <Tooltip label={touch ? "Zoom in (or pinch)" : "Zoom in (or ctrl + scroll)"}>
              <ActionIcon
                variant="subtle" color="gray" size="sm" aria-label="Zoom in"
                disabled={zoomLevel >= clampZoom(Infinity, fitScale)} onClick={() => zoomBy(ZOOM_STEP)}
              >
                <TbZoomIn />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Fit the whole animation">
              <ActionIcon
                variant="subtle" color="gray" size="sm" aria-label="Fit to width" disabled={zoomLevel <= 1}
                onClick={() => zoomTo(1, {time: 0, viewX: 0})}
              >
                <TbArrowAutofitWidth />
              </ActionIcon>
            </Tooltip>
          </div>
          <div className="header" style={{width}} onPointerDown={handleScrubberPointerDown}>
            {ruler.minor.map(time => <div key={time} className="tick" style={{left: x(time)}} />)}
            {ruler.major.map(({time, label}) =>
              <div key={time} className="tick major" style={{left: x(time)}}>
                {/* Not where the end's tab would cover it. */}
                {x(duration - time) > 24 && <span>{label}</span>}
              </div>)}
            <div className="postDuration" style={postDuration} />
            <div className="durationHandle" style={{left: x(duration)}} onPointerDown={handleDurationPointerDown}>
              {Math.round(duration * 100) / 100}s
            </div>
            <div className="playhead" style={{left: x(currentTime)}} />
          </div>
          <div className="labels" ref={labelsRef}>
            {variables.slice(0, rowCount).map((variable, row) => (
              <div key={row} className={"rowHead" + (variable.transitions.length > 0 ? " animated" : "")}>
                <div className="rowLabel" title={name(row) ? `iFloat${row}` : undefined}>{name(row) ?? "iFloat" + row}</div>
                <div className="variableValue">{(variableValues[row] ?? 0).toFixed(2)}</div>
              </div>
            ))}
            {/* Under the last row, like the labels; it mustn't start a transition. */}
            {canAddRow &&
              <div className="addRow">
                <Tooltip label={`Add a row for iFloat${rowCount}`}>
                  <ActionIcon variant="light" radius="xl" size="sm" onClick={props.onAddRow} aria-label="Add a row">
                    <TbPlus />
                  </ActionIcon>
                </Tooltip>
              </div>}
          </div>
          <div
            className={"timeArea" + (canAddRow ? " withAddRow" : "")}
            ref={timeAreaRef}
            data-px-per-second={pps}
            style={{width, cursor: resizing ? "ew-resize" : "pointer", backgroundSize: `${ruler.step * pps}px 100%`}}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={event => {
              if (event.pointerType === "touch") {
                liftTouch(event);
              }
              cancelCreating();
            }}
            onPointerLeave={handlePointerLeave}
          >
            <div className="postDuration" style={postDuration} />
            <div
              className="scrubber"
              style={{left: x(currentTime) - 1, height: rowsHeight, zIndex: markerZ}}
              onPointerDown={handleScrubberPointerDown}
            />
            <div
              className="durationSlider"
              style={{left: x(duration) - 1, height: rowsHeight, zIndex: markerZ}}
              onPointerDown={handleDurationPointerDown}
            />
            {variables.slice(0, rowCount).map((variable, row) => {
              const paths = rowPaths(variable.transitions, pps, width, ranges[row]);
              return (
                <div key={row} className="variableRow">
                  {variable.transitions.map((transition, index) => {
                    const isSelected = selection?.row === row && selectedIndex === index;
                    const isActive = transition.startDSecs <= currentDSecs && currentDSecs <= transition.endDSecs;
                    return (
                      <div
                        key={index}
                        className={"transition" + (isSelected ? " selected" : "") + (isActive ? " active" : "")}
                        style={blockStyle(transition.startDSecs, transition.endDSecs)}
                        onPointerDown={e => handleTransitionPointerDown(e, row, index)}
                      />
                    );
                  })}
                  {pending?.row === row &&
                    <div className="transition hover" style={blockStyle(pending.startDSecs, pending.endDSecs ?? pending.startDSecs + 1)} />}
                  {paths.curves.length > 0 &&
                    <svg className="curves" width={width} height={ROW_HEIGHT} aria-hidden>
                      <path className="held" d={paths.held} />
                      {paths.curves.map((d, index) =>
                        <path key={index} d={d} className={selection?.row === row && selectedIndex === index ? "selected" : undefined} />)}
                    </svg>}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
