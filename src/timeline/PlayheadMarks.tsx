// The parts of the timeline that move with the playhead, each re-rendering on its own as the animation plays.
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';

import { usePlayheadSelect, type Playhead } from './playhead';

interface MarkProps {
  playhead: Playhead;
  // Where a time is drawn, from the rows' left edge.
  x: (seconds: number) => number;
  className: string;
  // Pixels to shift it by, to centre a wider line.
  offset?: number;
  style?: CSSProperties;
  onPointerDown?: (event: ReactPointerEvent) => void;
}

// A line at the playhead, which moves on its own as the animation plays.
export function PlayheadMark({playhead, x, className, offset = 0, style, onPointerDown}: MarkProps) {
  const left = usePlayheadSelect(playhead, time => x(time) + offset);
  return <div className={className} style={{...style, left}} onPointerDown={onPointerDown} />;
}

// A row's value at the playhead, as its label shows it.
export function RowValue({playhead, valuesAt, row}: {playhead: Playhead; valuesAt: (time: number) => number[]; row: number}) {
  const text = usePlayheadSelect(playhead, time => (valuesAt(time)[row] ?? 0).toFixed(2));
  return <div className="variableValue">{text}</div>;
}
