import { NativeSelect, Tooltip } from '@mantine/core';
import { TbAspectRatio } from 'react-icons/tb';

import { ASPECT_RATIOS, type AspectRatio } from '../lib/document';

interface AspectRatioPickerProps {
  value: AspectRatio;
  onChange(value: AspectRatio): void;
}

const key = ([w, h]: AspectRatio) => w + "_" + h;

export default function AspectRatioPicker({value, onChange}: AspectRatioPickerProps) {
  return (
    <Tooltip label="Aspect ratio" position="bottom">
      <NativeSelect
        size="xs" aria-label="Aspect ratio" value={key(value)} leftSection={<TbAspectRatio />}
        className="aspectRatioPicker"
        onChange={event => {
          const ratio = ASPECT_RATIOS.find(r => key(r) === event.target.value);
          if (ratio) {
            onChange([ratio[0], ratio[1]]);
          }
        }}
        data={ASPECT_RATIOS.map(r => ({value: key(r), label: r[0] + ":" + r[1]}))}
      />
    </Tooltip>
  );
}
