import { ActionIcon, Tooltip, UnstyledButton } from '@mantine/core';
import { useEffect, useRef } from 'react';
import { TbChevronRight, TbPlus, TbX } from 'react-icons/tb';

import { MAX_BUFFERS } from '../lib/document';
import type { ShaderId } from '../render/Renderer';

interface ShaderTabsProps {
  numBuffers: number;
  showShared: boolean;
  current: ShaderId;
  // The code that didn't build, if some didn't.
  error: ShaderId | null;
  onChoose(shader: ShaderId): void;
  onAdd(): void;
  onRemoveLast(): void;
}

// A buffer is named as the code reads it.
export function shaderName(shader: ShaderId): string {
  return shader === "image" ? "Image" : shader === "shared" ? "Shared" : "iBuffer" + shader;
}

// Tabs above the code: the shared code, set apart, then each buffer and the image in the order they
// draw each frame, with a button to add a buffer where it will go, just before the image, and one to
// remove the last.
export default function ShaderTabs(
  {numBuffers, showShared, current, error, onChoose, onAdd, onRemoveLast}: ShaderTabsProps,
) {
  const drawn: ShaderId[] = [...Array.from({length: numBuffers}, (_, i) => i), "image"];
  const then = (key: string) => <TbChevronRight key={key} className="shaderThen" aria-hidden />;
  const rowRef = useRef<HTMLDivElement>(null);
  // When the row scrolls sideways, keep the open tab in view.
  useEffect(() => {
    rowRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({block: "nearest", inline: "nearest"});
  }, [current, numBuffers]);

  const tab = (shader: ShaderId) =>
    <UnstyledButton
      key={shader} role="tab" aria-selected={shader === current} className="shaderTab"
      data-error={shader === error || undefined} data-buffer={typeof shader === "number" || undefined}
      onClick={() => onChoose(shader)}
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
    </UnstyledButton>;

  return (
    <div className="shaderTabs" role="tablist" aria-label="Code, in the order it draws" ref={rowRef}>
      {showShared && [
        <Tooltip key="shared" label="Functions, constants and #defines that every tab can use, like Shadertoy's Common tab">
          {tab("shared")}
        </Tooltip>,
        <span key="divider" className="shaderDivider" aria-hidden />,
      ]}
      {drawn.map((shader, i) => [
        i > 0 && then("then" + shader),
        shader === "image" && numBuffers < MAX_BUFFERS && [
          <Tooltip key="add" label="Add a buffer: a shader that draws before the image, which any shader can read">
            <ActionIcon variant="light" radius="xl" size="sm" onClick={onAdd} aria-label="Add a buffer">
              <TbPlus />
            </ActionIcon>
          </Tooltip>,
          then("thenImage"),
        ],
        tab(shader),
      ])}
    </div>
  );
}
