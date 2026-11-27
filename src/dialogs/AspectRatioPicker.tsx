// The aspect ratio menu in the play bar.
import { Button, Group, NativeSelect, Popover, Text, TextInput, Tooltip } from '@mantine/core';
import { useState } from 'react';
import { TbAspectRatio } from 'react-icons/tb';

import { ASPECT_RATIOS, isAspectRatio, MAX_ASPECT_TERM, type AspectRatio } from '../lib/document';

interface AspectRatioPickerProps {
  value: AspectRatio;
  onChange(value: AspectRatio): void;
}

const CUSTOM = "custom";
const key = ([w, h]: AspectRatio) => w + "_" + h;
const label = ([w, h]: AspectRatio) => w + ":" + h;

// The usual ratios, plus a custom one: its two numbers are typed in a small box under the menu.
export default function AspectRatioPicker({value, onChange}: AspectRatioPickerProps) {
  const [editing, setEditing] = useState(false);
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const isPreset = ASPECT_RATIOS.some(r => key(r) === key(value));
  const options = isPreset ? ASPECT_RATIOS : [...ASPECT_RATIOS, value];
  const typed: unknown = [Number(width), Number(height)];
  const valid = isAspectRatio(typed);

  const startEditing = () => {
    setWidth(String(value[0]));
    setHeight(String(value[1]));
    setEditing(true);
  };
  const apply = () => {
    if (isAspectRatio(typed)) {
      onChange([typed[0], typed[1]]);
      setEditing(false);
    }
  };

  return (
    <Popover opened={editing} onChange={setEditing} position="top-end" withArrow trapFocus>
      <Popover.Target>
        <div className="aspectRatioPicker">
          <Tooltip label="Aspect ratio" position="bottom" disabled={editing}>
            <NativeSelect
              size="sm" aria-label="Aspect ratio" value={key(value)} leftSection={<TbAspectRatio />}
              onChange={event => {
                if (event.target.value === CUSTOM) {
                  startEditing();
                  return;
                }
                const ratio = options.find(r => key(r) === event.target.value);
                if (ratio) {
                  onChange([ratio[0], ratio[1]]);
                }
              }}
              data={[...options.map(r => ({value: key(r), label: label(r)})), {value: CUSTOM, label: "Custom…"}]}
            />
          </Tooltip>
        </div>
      </Popover.Target>
      <Popover.Dropdown>
        <form onSubmit={event => {event.preventDefault(); apply();}}>
          <Text size="sm" fw={500} mb={6}>Custom aspect ratio</Text>
          <Group gap={6} wrap="nowrap" align="center">
            <TextInput
              size="xs" w={64} type="number" min={1} max={MAX_ASPECT_TERM} aria-label="Ratio width"
              value={width} onChange={event => setWidth(event.target.value)}
            />
            <Text size="sm">:</Text>
            <TextInput
              size="xs" w={64} type="number" min={1} max={MAX_ASPECT_TERM} aria-label="Ratio height"
              value={height} onChange={event => setHeight(event.target.value)}
            />
            <Button size="xs" type="submit" disabled={!valid}>Use</Button>
          </Group>
          <Text size="xs" c="dimmed" mt={6} maw={220}>
            Whole numbers up to {MAX_ASPECT_TERM}, such as 21 : 9, no wider or taller than 10 : 1.
          </Text>
        </form>
      </Popover.Dropdown>
    </Popover>
  );
}
