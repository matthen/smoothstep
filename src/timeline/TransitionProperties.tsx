import { ActionIcon, NativeSelect, NumberInput } from '@mantine/core';
import { TbTrash } from 'react-icons/tb';

import { GlslCode } from '../editor/InlineCode';
import type { Transition, TransitionType } from '../lib/document';
import { parseValue } from './transitions';
import type { useTransitionEditor } from './useTransitionEditor';

const TYPE_OPTIONS: readonly {value: TransitionType; label: string}[] = [
  {value: "smoothstep", label: "smoothstep"}, {value: "linear", label: "linear"}, {value: "step", label: "step"},
  {value: "easeIn", label: "ease in"}, {value: "easeOut", label: "ease out"}, {value: "overshoot", label: "overshoot"},
  {value: "exponential", label: "exponential"},
];

// A time in seconds, to a hundredth, without trailing zeros.
const seconds = (dsecs: number) => String(Math.round(dsecs * 10) / 100);
// A number box's value as text, without the float noise its arrows add (0.45 + 0.1 is 0.55000000000000004).
const numberText = (value: number | string) => typeof value === "number" ? String(Number(value.toFixed(6))) : value;
// The same for the heading, which always shows at least a tenth, like 2.0.
const headingSeconds = (dsecs: number) => (dsecs / 10).toFixed(Number.isInteger(dsecs) ? 1 : 2);

// The row and times the heading names: the selected transition's, or one being made or pointed at.
export interface Heading {
  row: number;
  startDSecs: number;
  endDSecs: number | null;
}

interface Props {
  editor: ReturnType<typeof useTransitionEditor>;
  onDelete: () => void;
  heading: Heading | null;
  // What to do next to finish a transition being made.
  prompt: string | null;
  // What the code calls a row with #define, if anything.
  name: (row: number) => string | null;
  // Whether no row has a transition yet.
  empty: boolean;
  phone: boolean;
  touch: boolean;
}

// Above the rows: the selected transition's boxes, or what's being made, or how to start.
export default function TransitionProperties({editor, onDelete, heading, prompt, name, empty, phone, touch}: Props) {
  const {selected} = editor;
  return (
    <div className="properties">
      {selected &&
        <ActionIcon variant="subtle" color="gray" onClick={onDelete} className="delete" aria-label="Delete transition">
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
      {/* Not on phones, where the panel is above the rows and the line would shift them between taps. */}
      {prompt && !phone && <p className="hint" role="status">{prompt}</p>}
      {!heading &&
        <p className="hint">
          {touch ? "Tap where a transition starts, then where it ends." : "Click or drag in a row to add a transition."}
        </p>}
      {/* Not on touch screens, where it would shift the rows between a transition's two taps. */}
      {!heading && !touch && empty &&
        <p className="hint">
          Then use <GlslCode>iFloat0</GlslCode> to <GlslCode>iFloat15</GlslCode> in your code, like any number.
          {" "}A line like <GlslCode>#define size iFloat0</GlslCode> names the <GlslCode>iFloat0</GlslCode> row <GlslCode>size</GlslCode>.
        </p>}
      {selected && <TransitionForm editor={editor} selected={selected} />}
    </div>
  );
}

// The selected transition's times, values and type, each typed into its own box.
function TransitionForm({editor, selected}: {editor: ReturnType<typeof useTransitionEditor>; selected: Transition}) {
  const {drafts} = editor;
  return (
    <form className="transitionForm" onSubmit={e => e.preventDefault()}>
      {(["startTime", "endTime"] as const).map(field => {
        const dsecs = field === "startTime" ? selected.startDSecs : selected.endDSecs;
        const text = drafts[field] ?? seconds(dsecs);
        return (
          <NumberInput
            key={field} id={field + "Input"} label={field === "startTime" ? "start time" : "end time"}
            size="xs" step={0.1} min={0} allowNegative={false} clampBehavior="none" inputMode="decimal" suffix=" s"
            value={text}
            onChange={v => editor.changeTime(field, numberText(v))}
            onBlur={() => editor.blurTime(field)}
            error={drafts[field] !== undefined && editor.typedTime(field, text) === null}
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
            onChange={v => editor.changeValue(field, numberText(v))}
            onBlur={() => editor.blurValue(field)}
            error={parseValue(text) === null}
          />
        );
      })}
      <NativeSelect
        id="typeInput" label="transition" size="xs" value={selected.type}
        onChange={e => editor.updateSelected({type: e.target.value as TransitionType})}
        data={[...TYPE_OPTIONS]}
      />
    </form>
  );
}
