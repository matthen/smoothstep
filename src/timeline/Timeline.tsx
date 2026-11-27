import {useEffect, useEffectEvent, useRef} from "react";
import {ActionIcon, Tooltip} from "@mantine/core";
import {useMediaQuery} from "@mantine/hooks";
import {TbPlus} from "react-icons/tb";
import {usePhone} from "../app/usePhone";
import type {Variable} from "../lib/document";
import {valueRange} from "./curves";
import {durationDSecs, maxTimeFor, ROW_HEIGHT} from "./geometry";
import {awaitingEnd, shownCreating} from "./gestures";
import type {Rows} from "./gestures";
import {keyAction, shortcutsAllowed} from "./keys";
import TimelineRow from "./TimelineRow";
import TimelineRuler from "./TimelineRuler";
import TransitionProperties, {type Heading} from "./TransitionProperties";
import {useEasedRanges} from "./useEasedRanges";
import {useGestureState} from "./useGestureState";
import {useTimelinePointer} from "./useTimelinePointer";
import {useTimelineZoom} from "./useTimelineZoom";
import {useTransitionEditor} from "./useTransitionEditor";
import ZoomButtons from "./ZoomButtons";
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

export default function Timeline(props: TimelineProps) {
  const {variables, variableValues, onVariablesChange, duration, currentTime, onSeek, onDurationChange} = props;
  const rowCount = Math.min(props.rowCount, variables.length);
  const name = (row: number) => props.names?.[row] ?? null;
  const rootRef = useRef<HTMLDivElement>(null);
  const touch = useMediaQuery("(hover: none)");
  const phone = usePhone();

  const gestures = useGestureState();
  const {gesture, gestureRef, hover, setHover, cancelCreating} = gestures;
  const maxDSecs = durationDSecs(duration);
  const zoom = useTimelineZoom({
    maxTime: maxTimeFor(variables, duration),
    // The scale stays as it was during a drag or a change of duration, so the pointer stays on what it holds.
    frozenPxPerSecond: gesture.kind === "duration" || gesture.kind === "dragging" ? gesture.pxPerSecond : null,
    currentTime,
    onPinchStart: () => {
      const current = gestureRef.current;
      if (current.kind === "creating" && !current.released) {
        cancelCreating();
      }
    },
    // A held finger drags out its transition, so the timeline doesn't scroll under it.
    fingerHeld: () => {
      const current = gestureRef.current;
      return current.kind === "creating" && current.held && !current.released;
    },
  });
  const {gridRef, labelsRef, setScrollLeft, pps, x, width, viewWidth, ruler} = zoom;
  const currentDSecs = currentTime * 10;
  const rows: Rows = {transitions: variables.slice(0, rowCount).map(v => v.transitions), maxDSecs, pxPerSecond: pps};
  const ranges = useEasedRanges(rows.transitions.map(valueRange));
  const editor = useTransitionEditor({variables, onVariablesChange, maxDSecs, onSelect: () => setHover(null)});
  const {selection, selected, selectedIndex} = editor;
  const {
    timeAreaRef, rowHandlers, onTransitionPointerDown, onScrubberPointerDown, onDurationPointerDown,
  } = useTimelinePointer({gestures, editor, rows, duration, onSeek, onDurationChange});

  function deleteSelected() {
    editor.deleteSelected();
    gestures.setGesture({kind: "idle"});
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
      editor.select(null);
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

  const creating = shownCreating(gesture);
  // A finger's transition with only its start shows open-ended, with what to do next.
  const startOnly = awaitingEnd(gesture);
  const pending: Heading | null = creating ?
    {row: creating.row, startDSecs: creating.startDSecs, endDSecs: startOnly ? null : creating.endDSecs} :
    hover ? {...hover, endDSecs: null} : null;
  const prompt = creating && startOnly ? (creating.released ? "Tap again to set the end time." : "Drag to set the end time.") :
    null;
  const heading = selected && selection ? {row: selection.row, ...selected} : pending;
  const resizing = gesture.kind === "scrubbing" || gesture.kind === "duration" ||
    (gesture.kind === "dragging" && gesture.mode !== "move");
  const markerZ = creating ? 0 : 1000;
  const rowsHeight = rowCount * ROW_HEIGHT;
  const canAddRow = rowCount < variables.length;
  const postDuration = {left: x(duration), width: Math.max(0, width - x(duration))};

  return (
    <div id="animationControls" ref={rootRef}>
      <TransitionProperties
        editor={editor} onDelete={deleteSelected} heading={heading} prompt={prompt} name={name}
        empty={variables.every(variable => variable.transitions.length === 0)} phone={phone} touch={touch}
      />
      <div className="gridContainer" ref={gridRef} onScroll={event => setScrollLeft(event.currentTarget.scrollLeft)}>
        <div className="gridContent">
          <ZoomButtons
            canZoomIn={zoom.canZoomIn} canZoomOut={zoom.canZoomOut} zoomBy={zoom.zoomBy}
            onFit={() => zoom.zoomTo(1, {time: 0, viewX: 0})} touch={touch}
          />
          <TimelineRuler
            x={x} width={width} ruler={ruler} duration={duration} currentTime={currentTime} postDuration={postDuration}
            onScrubberPointerDown={onScrubberPointerDown} onDurationPointerDown={onDurationPointerDown}
          />
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
            className={"timeArea" + (canAddRow ? " withAddRow" : "") + (width <= viewWidth ? " fits" : "")}
            ref={timeAreaRef}
            data-px-per-second={pps}
            style={{width, cursor: resizing ? "ew-resize" : "pointer", backgroundSize: `${ruler.step * pps}px 100%`}}
            {...rowHandlers}
          >
            <div className="postDuration" style={postDuration} />
            <div
              className="scrubber"
              style={{left: x(currentTime) - 1, height: rowsHeight, zIndex: markerZ}}
              onPointerDown={onScrubberPointerDown}
            />
            <div
              className="durationSlider"
              style={{left: x(duration) - 1, height: rowsHeight, zIndex: markerZ}}
              onPointerDown={onDurationPointerDown}
            />
            {rows.transitions.map((transitions, row) =>
              <TimelineRow
                key={row} transitions={transitions} pxPerSecond={pps} width={width} range={ranges[row]}
                selectedIndex={selection?.row === row ? selectedIndex : -1} currentDSecs={currentDSecs}
                pending={pending?.row === row ? pending : null} prompt={prompt} phone={phone}
                onTransitionPointerDown={(event, index) => onTransitionPointerDown(event, row, index)}
              />)}
          </div>
        </div>
      </div>
    </div>
  );
}
