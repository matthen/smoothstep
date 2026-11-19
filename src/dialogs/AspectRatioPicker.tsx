import { Form, InputGroup } from 'react-bootstrap';
import { FaTv } from 'react-icons/fa';

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
      <InputGroup className="mb-2" size="sm">
        <InputGroup.Text><FaTv /></InputGroup.Text>
        <Form.Select
          aria-label="Aspect ratio" value={key(value)}
          onChange={event => {
            const ratio = ASPECT_RATIOS.find(r => key(r) === event.target.value);
            if (ratio) {
              onChange([ratio[0], ratio[1]]);
            }
          }}
        >
          {ASPECT_RATIOS.map(r => <option key={key(r)} value={key(r)}>{r[0]}:{r[1]}</option>)}
        </Form.Select>
      </InputGroup>
    </div>
  );
}
