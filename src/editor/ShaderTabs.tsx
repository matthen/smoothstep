import { ActionIcon, Tooltip, UnstyledButton } from '@mantine/core';
import { TbChevronRight, TbPlus, TbX } from 'react-icons/tb';

import { MAX_BUFFERS } from '../lib/document';
import type { ShaderId } from '../render/Renderer';

interface ShaderTabsProps {
  numBuffers: number;
  current: ShaderId;
  // The shader whose code didn't build, if one didn't.
  error: ShaderId | null;
  onChoose(shader: ShaderId): void;
  onAdd(): void;
  onRemoveLast(): void;
}

export function shaderName(shader: ShaderId): string {
  return shader === "image" ? "Image" : "Buffer " + shader;
}

// Tabs above the code for each buffer and the image, in the order they draw each frame, with
// buttons to add a buffer or remove the last.
export default function ShaderTabs({numBuffers, current, error, onChoose, onAdd, onRemoveLast}: ShaderTabsProps) {
  const shaders: ShaderId[] = [...Array.from({length: numBuffers}, (_, i) => i), "image"];
  return (
    <div className="shaderTabs" role="tablist" aria-label="Shaders, in the order they draw">
      {shaders.map((shader, i) => [
        i > 0 && <TbChevronRight key={"then" + shader} className="shaderThen" aria-hidden />,
        <UnstyledButton
          key={shader} role="tab" aria-selected={shader === current} className="shaderTab"
          data-error={shader === error || undefined} onClick={() => onChoose(shader)}
        >
          {shaderName(shader)}
          {shader === numBuffers - 1 &&
            <Tooltip label={"Remove " + shaderName(shader)}>
              <ActionIcon
                component="span" size="xs" variant="subtle" color="gray" aria-label={"Remove " + shaderName(shader)}
                onClick={event => {event.stopPropagation(); onRemoveLast();}}
              >
                <TbX />
              </ActionIcon>
            </Tooltip>}
        </UnstyledButton>,
      ])}
      {numBuffers < MAX_BUFFERS &&
        <Tooltip label="Add a buffer: a shader that draws before the image, which any shader can read">
          <UnstyledButton className="shaderTab addBuffer" onClick={onAdd}>
            <TbPlus /> Buffer
          </UnstyledButton>
        </Tooltip>}
    </div>
  );
}
