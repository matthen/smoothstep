import { useState } from 'react';

import { textureURL } from '../lib/config';
import type { TextureSlot } from '../lib/document';
import TexturePicker from './TexturePicker';
import { useImagesChanged } from './useImagesChanged';

interface TexturesProps {
  textures: TextureSlot[];
  onChange(textures: TextureSlot[]): void;
  onMessage(text: string): void;
}

// The footer's Textures tab: a button per slot, which opens the texture picker.
export default function Textures({textures, onChange, onMessage}: TexturesProps) {
  const [slot, setSlot] = useState<number | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  useImagesChanged();

  const current = slot === null ? undefined : textures[slot];
  return (
    <div id="textures">
      {textures.map((texture, i) =>
        <div className="texture" key={texture.id}>
          <h1>{texture.id}</h1>
          <button onClick={() => {setSlot(i); setShowPicker(true);}}>
            <img src={textureURL(texture)} alt={texture.id + " preview"} />
          </button>
        </div>,
      )}
      {current && slot !== null &&
        <TexturePicker
          show={showPicker} slot={slot} current={current} textures={textures}
          onHide={() => setShowPicker(false)}
          onPick={picked => {
            onChange(textures.map((t, i) => i === slot ? picked : t));
            setShowPicker(false);
          }}
          onMessage={onMessage}
        />
      }
    </div>
  );
}
