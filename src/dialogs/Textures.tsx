import { ActionIcon, Tooltip } from '@mantine/core';
import { lazy, Suspense, useState } from 'react';
import { TbPhotoPlus, TbPlus } from 'react-icons/tb';

import { GlslCode } from '../editor/InlineCode';
import { textureURL } from '../lib/config';
import { EMPTY_TEXTURE, type TextureSlot } from '../lib/document';
import { usePhone } from '../app/usePhone';
import { formatDuration, isVideoURL } from '../lib/media';
import TextureThumbnail, { VideoLength } from './TextureThumbnail';
import { useImagesChanged } from './useImagesChanged';

interface TexturesProps {
  textures: TextureSlot[];
  // How many slots to show, from the first.
  count: number;
  onChange(textures: TextureSlot[]): void;
  // Shows the next slot.
  onAdd(): void;
  onMessage(text: string): void;
}

// Loaded on first open, with the upload dropzone and the list of built-in textures.
const TexturePicker = lazy(() => import('./TexturePicker'));

// The footer's Textures tab: a button per slot, which opens the texture picker.
export default function Textures({textures, count, onChange, onAdd, onMessage}: TexturesProps) {
  const [slot, setSlot] = useState<number | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  // Each video slot's length, read from its thumbnail.
  const [lengths, setLengths] = useState<Record<string, number>>({});
  useImagesChanged();
  const phone = usePhone();

  const current = slot === null ? undefined : textures[slot];
  return (
    <div id="textures">
      {textures.slice(0, count).map((texture, i) =>
        <div className="texture" key={texture.id}>
          <h1>{texture.id}</h1>
          {texture.url === EMPTY_TEXTURE && !texture.isUserUploaded
            ? <button className="empty" onClick={() => {setSlot(i); setShowPicker(true);}} aria-label={texture.id + " is empty: choose an image or video"}>
              <TbPhotoPlus />
              <span>Choose an image or video</span>
            </button>
            : <button onClick={() => {setSlot(i); setShowPicker(true);}}>
              <TextureThumbnail
                src={textureURL(texture)} alt={texture.id + " preview"}
                onDuration={seconds => setLengths(l => l[texture.url] === seconds ? l : {...l, [texture.url]: seconds})}
              />
              {isVideoURL(textureURL(texture)) && <VideoLength text={formatDuration(lengths[texture.url])} />}
            </button>}
        </div>,
      )}
      {count < textures.length &&
        <Tooltip label={`Add a slot for iTexture${count}`}>
          <ActionIcon className="addSlot" variant="light" radius="xl" onClick={onAdd} aria-label="Add a texture slot">
            <TbPlus />
          </ActionIcon>
        </Tooltip>}
      {textures.every(texture => texture.url === EMPTY_TEXTURE) &&
        <p className="texturesHint">
          {phone ? "Tap" : "Click"} a slot to choose an image or video. In your code, <GlslCode>texture(iTexture0, uv)</GlslCode> reads its colour,
          with <GlslCode>uv</GlslCode> from 0 to 1.
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
