import {useEffect, useEffectEvent, useState} from "react";
import type {MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, ReactNode} from "react";
import {ActionIcon, NumberInput, Tooltip} from "@mantine/core";
import {TbPlayerPauseFilled, TbPlayerPlayFilled, TbPlayerSkipBackFilled} from "react-icons/tb";
import {formatTime} from "./geometry";
import {keyAction, keySeekTime, shortcutsAllowed} from "./keys";
import "./timeline.scss";

export interface PlayerControlsProps {
  duration: number;
  currentTime: number;
  isPlaying: boolean;
  onSeek(time: number): void;
  onPlayPause(): void;
  onReset(): void;
  onDurationChange(duration: number): void;
  onScrubStart(): void;
  onScrubEnd(): void;
  width: number | undefined;
  top: number;
  // Shown after the duration, such as the aspect ratio picker.
  extra?: ReactNode;
}

const MIN_WIDTH = 200;

function fractionAt(element: HTMLElement, clientX: number): number {
  const rect = element.getBoundingClientRect();
  return rect.width > 0 ? Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) : 0;
}

// The scrub bar: hovering shows the time under the pointer, pressing or dragging seeks there.
function ScrubSlider({duration, currentTime, onSeek, onScrubStart, onScrubEnd}: Pick<
  PlayerControlsProps, "duration" | "currentTime" | "onSeek" | "onScrubStart" | "onScrubEnd">) {
  const [hoverFraction, setHoverFraction] = useState<number | null>(null);
  const [scrubbing, setScrubbing] = useState(false);
  const progress = duration > 0 ? Math.max(0, Math.min(1, currentTime / duration)) : 0;

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const fraction = fractionAt(event.currentTarget, event.clientX);
    setScrubbing(true);
    setHoverFraction(fraction);
    onScrubStart();
    onSeek(fraction * duration);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const fraction = fractionAt(event.currentTarget, event.clientX);
    if (scrubbing) {
      onSeek(fraction * duration);
    }
    if (scrubbing || event.pointerType === "mouse") {
      setHoverFraction(fraction);
    }
  }

  function endScrub() {
    if (scrubbing) {
      setScrubbing(false);
      onScrubEnd();
    }
    setHoverFraction(null);
  }

  return (
    <div
      className="slider"
      role="slider"
      aria-label="Time"
      aria-valuemin={0}
      aria-valuemax={duration}
      aria-valuenow={Math.round(currentTime * 100) / 100}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endScrub}
      onPointerCancel={endScrub}
      onPointerLeave={() => !scrubbing && setHoverFraction(null)}
    >
      <div className="timeBar" />
      <div className="sliderHandle" style={{left: `${progress * 100}%`}} />
      {hoverFraction !== null &&
        <div className="timeTooltip" style={{left: `${hoverFraction * 100}%`}}>
          {formatTime(hoverFraction * duration)}
        </div>}
    </div>
  );
}

// The duration as typed; it's only passed on once it's a positive number.
function DurationInput({duration, onDurationChange}: Pick<PlayerControlsProps, "duration" | "onDurationChange">) {
  const [text, setText] = useState(String(duration));
  const [shownDuration, setShownDuration] = useState(duration);
  if (shownDuration !== duration) {
    setShownDuration(duration);
    if (Number(text) !== duration) {
      setText(String(duration));
    }
  }
  const value = Number(text);
  const valid = text.trim() !== "" && Number.isFinite(value) && value > 0;

  return (
    <Tooltip label="Duration in seconds" position="bottom">
      <NumberInput
        classNames={{input: "durationInput"}}
        size="xs"
        aria-label="Duration (seconds)"
        step={1}
        min={0.1}
        allowNegative={false}
        clampBehavior="none"
        inputMode="decimal"
        suffix=" s"
        value={text}
        error={!valid}
        onChange={v => {
          const next = typeof v === "number" ? String(Number(v.toFixed(6))) : v;
          setText(next);
          const nextValue = Number(next);
          if (next.trim() !== "" && Number.isFinite(nextValue) && nextValue > 0) {
            onDurationChange(nextValue);
          }
        }}
      />
    </Tooltip>
  );
}

export default function PlayerControls(props: PlayerControlsProps) {
  const {duration, currentTime, isPlaying, onSeek, onPlayPause, onReset, width, top} = props;

  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    const action = keyAction(event);
    if (!action || action.type === "deleteTransition" || !shortcutsAllowed(event.target, event.key)) {
      return;
    }
    event.preventDefault();
    if (action.type === "playPause") {
      onPlayPause();
      return;
    }
    const time = keySeekTime(action, currentTime, duration);
    if (time !== null) {
      onSeek(time);
    }
  });
  useEffect(() => {
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  // Clicking the buttons shouldn't take focus, so space keeps toggling playback afterwards.
  const keepFocus = (event: ReactMouseEvent) => event.preventDefault();

  return (
    <div className="playerButtons" style={{top, width: Math.max(width ?? MIN_WIDTH, MIN_WIDTH)}}>
      <ActionIcon.Group>
        <ActionIcon variant="default" size="lg" aria-label="Back to the start" onMouseDown={keepFocus} onClick={onReset}>
          <TbPlayerSkipBackFilled />
        </ActionIcon>
        <ActionIcon variant="default" size="lg" aria-label={isPlaying ? "Pause" : "Play"} onMouseDown={keepFocus} onClick={onPlayPause}>
          {isPlaying ? <TbPlayerPauseFilled /> : <TbPlayerPlayFilled />}
        </ActionIcon>
      </ActionIcon.Group>
      <ScrubSlider {...props} />
      <DurationInput duration={duration} onDurationChange={props.onDurationChange} />
      {props.extra}
    </div>
  );
}
