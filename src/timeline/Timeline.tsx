import {useEffect, useEffectEvent, useRef, useState} from "react";
import type {MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent} from "react";
import {ActionIcon, NativeSelect, TextInput} from "@mantine/core";
import {useMediaQuery} from "@mantine/hooks";
import {TbTrash} from "react-icons/tb";
import {variableValue} from "../lib/document";
import type {Transition, TransitionType, Variable} from "../lib/document";
import {
  clampTime, dragDeltaDSecs, draggedDuration, durationDSecs, grabMode, headerTicks, hoverEndDSecs,
  hoverStartDSecs, maxTimeFor, PX_PER_DSEC, ROW_HEIGHT, roundDuration, rowAt, timeAreaWidth, timeToX,
  xToTime,
} from "./geometry";
import type {GrabMode} from "./geometry";
import {keyAction, shortcutsAllowed} from "./keys";
import {
  dragTransition, insertTransition, isInsertable, parseValue, removeTransition, replaceTransition,
  withTransitions,
} from "./transitions";
import "./timeline.scss";

export interface TimelineProps {
  variables: Variable[];
  variableValues: number[];
  onVariablesChange(variables: Variable[]): void;
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
  | {kind: "creating"; row: number; startDSecs: number; endDSecs: number; released: boolean}
  | {kind: "dragging"; mode: GrabMode; row: number; index: number; original: Transition[]; startX: number;
     moved: Transition}
  | {kind: "scrubbing"}
  | {kind: "duration"; startX: number; startDuration: number; latest: number};

// Text typed into the value inputs, kept until it's valid and the input loses focus.
interface Drafts {
  start?: string;
  end?: string;
}

const TYPE_OPTIONS: readonly TransitionType[] = ["smoothstep", "step", "linear"];

export default function Timeline(props: TimelineProps) {
  const {variables, variableValues, onVariablesChange, duration, currentTime, onSeek, onDurationChange} = props;
  const rootRef = useRef<HTMLDivElement>(null);
  const timeAreaRef = useRef<HTMLDivElement>(null);
  const rowsRef = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [hover, setHover] = useState<Selection | null>(null);
  const [gesture, setGestureState] = useState<Gesture>({kind: "idle"});
  // Pointer handlers read the gesture from here, as moves can arrive before React re-renders.
  const gestureRef = useRef<Gesture>(gesture);
  const [drafts, setDrafts] = useState<Drafts>({});
  const touch = useMediaQuery("(hover: none)") ?? false;

  const maxDSecs = durationDSecs(duration);
  const maxTime = maxTimeFor(variables, duration);
  const width = timeAreaWidth(maxTime);
  const ticks = headerTicks(maxTime);
  const currentDSecs = currentTime * 10;

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

  function create(row: number, startDSecs: number, endDSecs: number) {
    const transitions = variables[row]!.transitions;
    setGesture({kind: "idle"});
    if (!isInsertable(transitions, startDSecs, endDSecs, maxDSecs)) {
      setHover(null);
      return;
    }
    const value = variableValue(transitions, startDSecs / 10);
    const inserted = insertTransition(transitions, {startDSecs, endDSecs, startValue: value, endValue: value, type: "smoothstep"});
    setRow(row, inserted.transitions);
    select({row, startDSecs});
  }

  // Pointer position relative to the rows, which scroll with the timeline.
  function position(event: {clientX: number; clientY: number}) {
    const rect = rowsRef.current!.getBoundingClientRect();
    return {x: event.clientX - rect.left, y: event.clientY - rect.top};
  }

  function updateHover(x: number, y: number) {
    const row = rowAt(y, variables.length);
    if (row === null) {
      return;
    }
    const startDSecs = hoverStartDSecs(x);
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
        onSeek(clampTime(xToTime(x), duration));
        return;
      case "duration": {
        const latest = draggedDuration(gesture.startDuration, x - gesture.startX);
        if (latest !== gesture.latest) {
          setGesture({...gesture, latest});
          onDurationChange(latest);
        }
        return;
      }
      case "dragging": {
        const moved = dragTransition(gesture.original, gesture.index, gesture.mode, dragDeltaDSecs(x - gesture.startX), maxDSecs);
        if (moved.startDSecs !== gesture.moved.startDSecs || moved.endDSecs !== gesture.moved.endDSecs) {
          setGesture({...gesture, moved});
          setRow(gesture.row, replaceTransition(gesture.original, gesture.index, moved));
          setSelection({row: gesture.row, startDSecs: moved.startDSecs});
        }
        return;
      }
      case "creating": {
        const endDSecs = hoverEndDSecs(x, gesture.startDSecs);
        if (endDSecs !== gesture.endDSecs &&
            isInsertable(variables[gesture.row]!.transitions, gesture.startDSecs, endDSecs, maxDSecs)) {
          setGesture({...gesture, endDSecs});
        }
        return;
      }
      case "idle":
        if (!selected) {
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
    // A touch can't hover, so the second tap of a click-twice creation sets the end where it lands.
    // A second tap in another row, or where the transition can't end, cancels it instead.
    if (current.kind === "creating" && current.released) {
      const {x, y} = position(event);
      const endDSecs = hoverEndDSecs(x, current.startDSecs);
      const fits = isInsertable(variables[current.row]!.transitions, current.startDSecs, endDSecs, maxDSecs);
      if (event.pointerType === "touch" && (!fits || Math.floor(y / ROW_HEIGHT) !== current.row)) {
        cancelCreating();
      } else if (fits) {
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
    const row = rowAt(y, variables.length);
    if (row === null) {
      return;
    }
    const startDSecs = hoverStartDSecs(x);
    if (isInsertable(variables[row]!.transitions, startDSecs, startDSecs + 1, maxDSecs)) {
      setHover({row, startDSecs});
      setGesture({kind: "creating", row, startDSecs, endDSecs: startDSecs + 1, released: false});
      capture(event);
    }
  }

  function handlePointerUp() {
    const gesture = gestureRef.current;
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
    setGesture({kind: "dragging", mode, row, index, original: transitions, startX: position(event).x, moved: original});
    capture(event);
  }

  function handleScrubberPointerDown(event: ReactPointerEvent) {
    if (event.button !== 0) {
      return;
    }
    event.stopPropagation();
    setHover(null);
    setGesture({kind: "scrubbing"});
    capture(event);
  }

  function handleDurationPointerDown(event: ReactPointerEvent) {
    if (event.button !== 0) {
      return;
    }
    event.stopPropagation();
    select(null);
    setGesture({kind: "duration", startX: position(event).x, startDuration: duration, latest: duration});
    capture(event);
  }

  function handleHeaderClick(event: ReactMouseEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    onSeek(clampTime(xToTime(event.clientX - rect.left), duration));
  }

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

  const creating = gesture.kind === "creating" ? gesture : null;
  const pending = creating ? {row: creating.row, startDSecs: creating.startDSecs, endDSecs: creating.endDSecs as number | null} :
    hover ? {...hover, endDSecs: null} : null;
  const heading = selected && selection ? {row: selection.row, ...selected} : pending;
  const resizing = gesture.kind === "scrubbing" || gesture.kind === "duration" ||
    (gesture.kind === "dragging" && gesture.mode !== "move");
  const markerZ = creating ? 0 : 1000;
  const rowsHeight = variables.length * ROW_HEIGHT;

  return (
    <div id="animationControls" ref={rootRef}>
      <div className="properties">
        {selected &&
          <ActionIcon variant="subtle" color="gray" onClick={deleteSelected} className="delete" aria-label="Delete transition">
            <TbTrash />
          </ActionIcon>}
        {heading &&
          <h4>
            iFloat{heading.row}
            <span> {(heading.startDSecs * 0.1).toFixed(1)}
              {heading.endDSecs !== null && <> &mdash; {(heading.endDSecs * 0.1).toFixed(1)}</>}s
            </span>
          </h4>}
        {!heading &&
          <p className="hint">
            {touch ? "Tap where a transition starts, then where it ends." : "Click or drag in a row to add a transition."}
          </p>}
        {selected &&
          <form className="transitionForm" onSubmit={e => e.preventDefault()}>
            {(["start", "end"] as const).map(field => {
              const value = field === "start" ? selected.startValue : selected.endValue;
              const text = drafts[field] ?? String(value);
              return (
                <TextInput
                  key={field} id={field + "ValueInput"} label={field + " value"} size="xs"
                  type="number" step="0.1" value={text}
                  onChange={e => changeValue(field, e.target.value)}
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
      <div className="gridContainer">
        <div className={"header" + (ticks.tens ? " tensTicks" : "")} style={{width}} onClick={handleHeaderClick}>
          {ticks.labels.map(label => <p key={label}>{label}</p>)}
        </div>
        <div
          className="timeArea"
          ref={timeAreaRef}
          style={{width, cursor: resizing ? "ew-resize" : "pointer"}}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={cancelCreating}
          onPointerLeave={handlePointerLeave}
        >
          <div className="postDuration" style={{left: timeToX(duration), width: timeToX(maxTime - duration) + 20, height: rowsHeight}} />
          <div
            className="scrubber"
            style={{left: timeToX(currentTime) - 1, height: rowsHeight, zIndex: markerZ}}
            onPointerDown={handleScrubberPointerDown}
          />
          <div
            className="durationSlider"
            style={{left: timeToX(duration) - 1, height: rowsHeight, zIndex: markerZ}}
            onPointerDown={handleDurationPointerDown}
          />
          <div className="filler" ref={rowsRef}>
            {variables.map((variable, row) => (
              <div key={row} className="variableRow">
                {variable.transitions.length > 0 &&
                  <div className="variableValue" style={{left: timeToX(currentTime), zIndex: markerZ}}>
                    {(variableValues[row] ?? 0).toFixed(2)}
                  </div>}
                {variable.transitions.map((transition, index) => {
                  const isSelected = selection?.row === row && selectedIndex === index;
                  const isActive = transition.startDSecs <= currentDSecs && currentDSecs <= transition.endDSecs;
                  return (
                    <div
                      key={index}
                      className={"transition" + (isSelected ? " selected" : "") + (isActive ? " active" : "")}
                      style={{
                        left: transition.startDSecs * PX_PER_DSEC,
                        width: (transition.endDSecs - transition.startDSecs) * PX_PER_DSEC,
                      }}
                      onPointerDown={e => handleTransitionPointerDown(e, row, index)}
                    />
                  );
                })}
                {pending?.row === row &&
                  <div className="transition hover" style={{
                    left: pending.startDSecs * PX_PER_DSEC,
                    width: ((pending.endDSecs ?? pending.startDSecs + 1) - pending.startDSecs) * PX_PER_DSEC,
                  }} />}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
