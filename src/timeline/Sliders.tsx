// The bottom panel's Sliders tab, and finding which inputs the code uses.
import { Slider, Text, TextInput } from '@mantine/core';
import { useState } from 'react';

import { GlslCode } from '../editor/InlineCode';
import { sliderRange, type Variable } from '../lib/document';
import { usePlayheadSelect, type Playhead } from './playhead';

interface SlidersProps {
  variables: Variable[];
  // The values the canvas is drawn with at the playhead.
  playhead: Playhead;
  valuesAt(time: number): number[];
  // Each iFloat's #define name, if it has one.
  names: (string | null)[];
  // All the code, to find which iFloats it uses.
  code: string;
  // The animated variables held at a value by their sliders.
  held: ReadonlySet<number>;
  onVariablesChange(variables: Variable[]): void;
  // Holds an animated variable at a value, until the animation plays or the playhead moves.
  onHold(row: number, value: number): void;
}

// The numbers of the inputs called `prefix`N that the code uses, in order, ignoring comments.
export function inputsInCode(code: string, prefix: "iFloat" | "iTexture"): number[] {
  const stripped = code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  const found = stripped.matchAll(new RegExp(`\\b${prefix}(\\d+)\\b`, "g"));
  return [...new Set([...found].map(m => Number(m[1])))].sort((a, b) => a - b);
}

export const floatsInCode = (code: string) => inputsInCode(code, "iFloat");

// As many decimal places as the range needs.
function placesFor(lo: number, hi: number): number {
  return Math.max(0, Math.min(6, 3 - Math.floor(Math.log10(Math.max(hi - lo, 1e-6)))));
}

// A range end, without trailing zeros: as typed, more or less.
function show(value: number, lo: number, hi: number): string {
  return String(Number(value.toFixed(placesFor(lo, hi))));
}

// A number box that keeps what's typed while it's focused, and shows the value otherwise. A `steady`
// one, under a moving handle, keeps the same decimal places and width, so it doesn't jitter.
function NumberBox({value, onChange, onClear, label, lo, hi, className, steady}: {
  value: number; onChange(value: number): void; label: string; lo: number; hi: number; className?: string;
  steady?: boolean;
  // Called when the box is left empty.
  onClear?(): void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const places = placesFor(lo, hi);
  const shown = steady ? value.toFixed(places) : show(value, lo, hi);
  const text = draft ?? shown;
  const chars = steady ? Math.max(lo.toFixed(places).length, hi.toFixed(places).length, text.length) : text.length;
  return (
    <TextInput
      className={"sliderNumber " + (className ?? "")} size="xs" variant="unstyled" aria-label={label} value={text}
      inputMode="decimal" styles={{input: {width: `${Math.max(chars, 1) + 1.5}ch`}}}
      onFocus={() => setDraft(shown)}
      onBlur={() => {
        if (draft?.trim() === "") {
          onClear?.();
        }
        setDraft(null);
      }}
      onChange={event => {
        setDraft(event.currentTarget.value);
        const n = Number(event.currentTarget.value);
        if (event.currentTarget.value.trim() !== "" && Number.isFinite(n)) {
          onChange(n);
        }
      }}
      onKeyDown={event => {
        if (event.key === "Enter") {
          event.currentTarget.blur();
        }
      }}
    />
  );
}

interface SliderRowProps extends Pick<SlidersProps, "playhead" | "valuesAt" | "onHold"> {
  row: number;
  variable: Variable;
  // Its #define name, if it has one.
  name: string | null;
  held: boolean;
  update(row: number, change: Partial<Variable>): void;
  clear(row: number, end: "min" | "max"): void;
}

// One iFloat's slider, which follows the playhead itself, so only a moving value re-renders as it plays.
function SliderRow({row, variable, name: defined, held, playhead, valuesAt, update, clear, onHold}: SliderRowProps) {
  const value = usePlayheadSelect(playhead, time => valuesAt(time)[row] ?? 0);
  const [lo, hi] = sliderRange(variable);
  const animated = variable.transitions.length > 0;
  const name = defined ?? "iFloat" + row;
  const top = hi > lo ? hi : lo + 1;
  const fraction = Math.min(Math.max((value - lo) / (top - lo), 0), 1);
  const step = (top - lo) / 1000;
  return (
    <div className="sliderRow" data-held={held || undefined}>
      <div className="sliderName">
        {name}
        {defined && <span className="floatName"> iFloat{row}</span>}
      </div>
      <NumberBox
        className="sliderEnd" label={name + " minimum"} value={lo} lo={lo} hi={hi}
        onChange={min => min < hi && update(row, {min})} onClear={() => clear(row, "min")}
      />
      <div className="sliderTrack">
        <Slider
          min={lo} max={top} step={step} value={Math.min(Math.max(value, lo), top)} label={null}
          // Mantine reads the decimal places from step's text, which tiny steps write as "5e-7".
          precision={Math.min(Math.max(0, Math.ceil(-Math.log10(step))), 12)}
          thumbProps={{"aria-label": name}}
          onChange={v => animated ? onHold(row, v) : update(row, {value: v})}
        />
        {/* The value, under the handle and moving with it. */}
        <div className="sliderValue" style={{left: `${100 * fraction}%`}}>
          <NumberBox
            label={name + " value"} value={value} lo={lo} hi={hi} steady
            onChange={v => animated ? onHold(row, v) : update(row, {value: v})}
          />
        </div>
      </div>
      <NumberBox
        className="sliderEnd" label={name + " maximum"} value={hi} lo={lo} hi={hi}
        onChange={max => max > lo && update(row, {max})} onClear={() => clear(row, "max")}
      />
    </div>
  );
}

// A slider for each iFloat the code uses. One without transitions keeps the value it's set to; one
// animated on the timeline follows it until its slider is moved, and the timeline takes over again
// when the animation plays.
export default function Sliders({variables, playhead, valuesAt, names, code, held, onVariablesChange, onHold}: SlidersProps) {
  const used = floatsInCode(code).filter(i => i < variables.length);
  const update = (row: number, change: Partial<Variable>) =>
    onVariablesChange(variables.map((v, i) => i === row ? {...v, ...change} : v));
  // Back to the range sliderRange works out.
  const clear = (row: number, end: "min" | "max") =>
    onVariablesChange(variables.map((v, i) => {
      if (i !== row) {
        return v;
      }
      const rest = {...v};
      if (end === "min") {
        delete rest.min;
      } else {
        delete rest.max;
      }
      return rest;
    }));

  if (used.length === 0) {
    return (
      <Text className="hint" size="sm" p="md">
        Use <GlslCode>iFloat0</GlslCode> to <GlslCode>iFloat15</GlslCode> in your code to get a slider for each one here.
      </Text>
    );
  }
  return (
    <div className="sliders">
      {used.map(row =>
        <SliderRow
          key={row} row={row} variable={variables[row]!} name={names[row] ?? null} held={held.has(row)}
          playhead={playhead} valuesAt={valuesAt} update={update} clear={clear} onHold={onHold}
        />)}
    </div>
  );
}
