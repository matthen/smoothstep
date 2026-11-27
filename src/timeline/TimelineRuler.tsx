import type { PointerEvent as ReactPointerEvent } from 'react';

import type { Ruler } from './geometry';

interface Props {
  // Where a time is drawn, from the rows' left edge.
  x: (seconds: number) => number;
  width: number;
  ruler: Ruler;
  duration: number;
  currentTime: number;
  // The part past the duration, shaded.
  postDuration: {left: number; width: number};
  onScrubberPointerDown: (event: ReactPointerEvent) => void;
  onDurationPointerDown: (event: ReactPointerEvent) => void;
}

// The ruler over the rows, with the duration's handle and the playhead.
export default function TimelineRuler(
  {x, width, ruler, duration, currentTime, postDuration, onScrubberPointerDown, onDurationPointerDown}: Props,
) {
  return (
    <div className="header" style={{width}} onPointerDown={onScrubberPointerDown}>
      {ruler.minor.map(time => <div key={time} className="tick" style={{left: x(time)}} />)}
      {ruler.major.map(({time, label}) =>
        <div key={time} className="tick major" style={{left: x(time)}}>
          {/* Not where the end's tab would cover it. */}
          {x(duration - time) > 24 && <span>{label}</span>}
        </div>)}
      <div className="postDuration" style={postDuration} />
      <div className="durationHandle" style={{left: x(duration)}} onPointerDown={onDurationPointerDown}>
        {Math.round(duration * 100) / 100}s
      </div>
      <div className="playhead" style={{left: x(currentTime)}} />
    </div>
  );
}
