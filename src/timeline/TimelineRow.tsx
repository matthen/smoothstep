import { VisuallyHidden } from '@mantine/core';
import { useMemo, type PointerEvent as ReactPointerEvent } from 'react';

import type { Transition } from '../lib/document';
import { rowPaths, type ValueRange } from './curves';
import { ROW_HEIGHT } from './geometry';
import { usePlayheadSelect, type Playhead } from './playhead';
import type { Heading } from './TransitionProperties';

interface Props {
  transitions: readonly Transition[];
  pxPerSecond: number;
  width: number;
  range: ValueRange | undefined;
  // The selected transition's index in this row, or -1.
  selectedIndex: number;
  playhead: Playhead;
  // A transition being made or pointed at in this row, if any, and what to do next to finish it.
  pending: Heading | null;
  prompt: string | null;
  phone: boolean;
  onTransitionPointerDown: (event: ReactPointerEvent<HTMLDivElement>, index: number) => void;
}

// One row of the timeline: its transitions as blocks, the curve they make, and any transition being made.
export default function TimelineRow(
  {transitions, pxPerSecond, width, range, selectedIndex, playhead, pending, prompt, phone, onTransitionPointerDown}: Props,
) {
  const pxPerDSec = pxPerSecond / 10;
  const paths = useMemo(() => rowPaths(transitions, pxPerSecond, width, range), [transitions, pxPerSecond, width, range]);
  // Which transitions the playhead is in, as a string so it only re-renders when that changes.
  const active = usePlayheadSelect(playhead, time =>
    transitions.map(t => t.startDSecs <= time * 10 && time * 10 <= t.endDSecs ? "1" : "0").join(""));
  const blockStyle = (startDSecs: number, endDSecs: number) => ({
    left: startDSecs * pxPerDSec,
    width: Math.max(3, (endDSecs - startDSecs) * pxPerDSec),
  });
  return (
    <div className="variableRow">
      {transitions.map((transition, index) => {
        const isSelected = selectedIndex === index;
        const isActive = active[index] === "1";
        return (
          <div
            key={index}
            className={"transition" + (isSelected ? " selected" : "") + (isActive ? " active" : "")}
            style={blockStyle(transition.startDSecs, transition.endDSecs)}
            onPointerDown={e => onTransitionPointerDown(e, index)}
          />
        );
      })}
      {pending && (prompt ?
        <>
          <div className="transitionStart" style={{left: pending.startDSecs * pxPerDSec}} />
          {phone && <VisuallyHidden role="status">{prompt}</VisuallyHidden>}
        </> :
        <div className="transition hover" style={blockStyle(pending.startDSecs, pending.endDSecs ?? pending.startDSecs + 1)} />)}
      {paths.curves.length > 0 &&
        <svg className="curves" width={width} height={ROW_HEIGHT} aria-hidden>
          <path className="held" d={paths.held} />
          {paths.curves.map((d, index) =>
            <path key={index} d={d} className={selectedIndex === index ? "selected" : undefined} />)}
        </svg>}
    </div>
  );
}
