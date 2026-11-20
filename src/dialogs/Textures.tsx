import { lazy, Suspense, useState } from 'react';
import { TbPhotoPlus } from 'react-icons/tb';

import { textureURL } from '../lib/config';
import { EMPTY_TEXTURE, type TextureSlot } from '../lib/document';
import { usePhone } from '../app/usePhone';
import { useImagesChanged } from './useImagesChanged';

interface TexturesProps {
  textures: TextureSlot[];
  onChange(textures: TextureSlot[]): void;
  onMessage(text: string): void;
}

// Loaded on first open, with the upload dropzone and the list of built-in textures.
const TexturePicker = lazy(() => import('./TexturePicker'));

// The footer's Textures tab: a button per slot, which opens the texture picker.
export default function Textures({textures, onChange, onMessage}: TexturesProps) {
  const [slot, setSlot] = useState<number | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  useImagesChanged();
  const phone = usePhone();

  const current = slot === null ? undefined : textures[slot];
  return (
    <div id="textures">
      {textures.map((texture, i) =>
        <div className="texture" key={texture.id}>
          <h1>{texture.id}</h1>
          {texture.url === EMPTY_TEXTURE && !texture.isUserUploaded
            ? <button className="empty" onClick={() => {setSlot(i); setShowPicker(true);}} aria-label={texture.id + " is empty: choose an image"}>
              <TbPhotoPlus />
              <span>Choose an image</span>
            </button>
            : <button onClick={() => {setSlot(i); setShowPicker(true);}}>
              <img src={textureURL(texture)} alt={texture.id + " preview"} />
            </button>}
        </div>,
      )}
      {textures.every(texture => texture.url === EMPTY_TEXTURE) &&
        <p className="texturesHint">
          {phone ? "Tap" : "Click"} a slot to choose an image. In your code, <code>texture(iTexture0, uv)</code> reads its colour,
          with <code>uv</code> from 0 to 1.
        </p>}
      {current && slot !== null &&
        <Suspense fallback={null}>
          <TexturePicker
            show={showPicker} slot={slot} current={current} textures={textures}
            onHide={() => setShowPicker(false)}
            onPick={picked => {
              onChange(textures.map((t, i) => i === slot ? picked : t));
              setShowPicker(false);
            }}
            onMessage={onMessage}
          />
        </Suspense>
      }
    </div>
  );
}
