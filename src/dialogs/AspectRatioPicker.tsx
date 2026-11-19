import { NativeSelect } from '@mantine/core';
import { TbAspectRatio } from 'react-icons/tb';

import { ASPECT_RATIOS, type AspectRatio } from '../lib/document';

interface AspectRatioPickerProps {
  value: AspectRatio;
  onChange(value: AspectRatio): void;
  top: number;
  left: number;
}

const key = ([w, h]: AspectRatio) => w + "_" + h;

export default function AspectRatioPicker({value, onChange, top, left}: AspectRatioPickerProps) {
  return (
    <div className="aspectRatioPicker" style={{top, left}}>
      <NativeSelect
        size="xs" aria-label="Aspect ratio" value={key(value)} leftSection={<TbAspectRatio />}
        onChange={event => {
          const ratio = ASPECT_RATIOS.find(r => key(r) === event.target.value);
          if (ratio) {
            onChange([ratio[0], ratio[1]]);
          }
        }}
        data={ASPECT_RATIOS.map(r => ({value: key(r), label: r[0] + ":" + r[1]}))}
      />
    </div>
  );
}
