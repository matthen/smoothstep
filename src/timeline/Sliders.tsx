import { Slider, Text, TextInput } from '@mantine/core';
import { useState } from 'react';

import { sliderRange, type Variable } from '../lib/document';

interface SlidersProps {
  variables: Variable[];
  // The values the canvas is drawn with now.
  values: number[];
  // Each iFloat's #define name, if it has one.
  names: (string | null)[];
  // All the code, to find which iFloats it uses.
  code: string;
  onVariablesChange(variables: Variable[]): void;
  // Holds an animated variable at a value while its slider is dragged, or lets it go (null).
  onHold(row: number, value: number | null): void;
}

// The iFloats the code uses, in order, ignoring comments.
export function floatsInCode(code: string): number[] {
  const stripped = code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  return [...new Set([...stripped.matchAll(/\biFloat(\d+)\b/g)].map(m => Number(m[1])))].sort((a, b) => a - b);
}

// Rounds for display, to about as many places as the range needs.
function show(value: number, lo: number, hi: number): string {
  const places = Math.max(0, Math.min(6, 3 - Math.floor(Math.log10(Math.max(hi - lo, 1e-6)))));
  return String(Number(value.toFixed(places)));
}

// A number box that keeps what's typed while it's focused, and shows the value otherwise.
function NumberBox({value, onChange, label, lo, hi, disabled}: {
  value: number; onChange(value: number): void; label: string; lo: number; hi: number; disabled?: boolean;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <TextInput
      className="sliderNumber" size="xs" aria-label={label} value={draft ?? show(value, lo, hi)} disabled={disabled}
      inputMode="decimal"
      onFocus={() => setDraft(show(value, lo, hi))}
      onBlur={() => setDraft(null)}
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

// A slider for each iFloat the code uses. One without transitions keeps the value it's set to; one
// animated on the timeline follows it, and holds still while its slider is dragged.
export default function Sliders({variables, values, names, code, onVariablesChange, onHold}: SlidersProps) {
  const used = floatsInCode(code).filter(i => i < variables.length);
  const update = (row: number, change: Partial<Variable>) =>
    onVariablesChange(variables.map((v, i) => i === row ? {...v, ...change} : v));

  if (used.length === 0) {
    return (
      <Text className="hint" size="sm" p="md">
        Use <code>iFloat0</code> to <code>iFloat15</code> in your code to get a slider for each one here.
      </Text>
    );
  }
  return (
    <div className="sliders">
      {used.map(row => {
        const variable = variables[row]!;
        const [lo, hi] = sliderRange(variable);
        const animated = variable.transitions.length > 0;
        const name = names[row] ?? "iFloat" + row;
        const value = values[row] ?? 0;
        return (
          <div className="sliderRow" key={row}>
            <div className="sliderName">
              {name}
              {names[row] && <span className="floatName"> iFloat{row}</span>}
              {animated && <span className="sliderAnimated">animated</span>}
            </div>
            <NumberBox label={name + " minimum"} value={lo} lo={lo} hi={hi} onChange={min => update(row, {min})} />
            <Slider
              className="slider" min={lo} max={hi > lo ? hi : lo + 1} step={(hi - lo) / 1000 || 0.001}
              value={Math.min(Math.max(value, lo), hi)} label={null} thumbProps={{"aria-label": name}}
              onChange={v => animated ? onHold(row, v) : update(row, {value: v})}
              onChangeEnd={() => animated && onHold(row, null)}
            />
            <NumberBox label={name + " maximum"} value={hi} lo={lo} hi={hi} onChange={max => update(row, {max})} />
            <NumberBox
              label={name + " value"} value={value} lo={lo} hi={hi} disabled={animated}
              onChange={v => update(row, {value: v})}
            />
          </div>
        );
      })}
    </div>
  );
}
