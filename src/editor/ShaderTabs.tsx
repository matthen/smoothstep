import { ActionIcon, Menu, Text, Tooltip, UnstyledButton } from '@mantine/core';
import { useEffect, useRef } from 'react';
import { TbBrandJavascript, TbBrush, TbChevronRight, TbPlus, TbStack2, TbX } from 'react-icons/tb';

import { MAX_BUFFERS } from '../lib/document';
import type { ShaderId } from '../render/Renderer';

interface ShaderTabsProps {
  numBuffers: number;
  showShared: boolean;
  hasCanvas: boolean;
  current: ShaderId;
  // The tabs whose code didn't build or run.
  errors: readonly ShaderId[];
  onChoose(shader: ShaderId): void;
  onAdd(): void;
  onRemoveLast(): void;
  onAddCanvas(): void;
  onRemoveCanvas(): void;
}

// A buffer is named as the code reads it.
export function shaderName(shader: ShaderId): string {
  return shader === "image" ? "Image" : shader === "shared" ? "Shared GLSL" : shader === "canvas" ? "Canvas2D" :
    "iBuffer" + shader;
}

// Tabs above the code: the shared GLSL, set apart, then the Canvas2D layer's JavaScript, also set
// apart, then each buffer and the image in the order they draw each frame, with a button to add a
// buffer or the Canvas2D layer, and one to remove the last buffer or the layer.
export default function ShaderTabs({
  numBuffers, showShared, hasCanvas, current, errors, onChoose, onAdd, onRemoveLast, onAddCanvas, onRemoveCanvas,
}: ShaderTabsProps) {
  const drawn: ShaderId[] = [...(hasCanvas ? ["canvas" as const] : []), ...Array.from({length: numBuffers}, (_, i) => i), "image"];
  const then = (key: string) => <TbChevronRight key={key} className="shaderThen" aria-hidden />;
  const rowRef = useRef<HTMLDivElement>(null);
  // When the row scrolls sideways, keep the open tab in view.
  useEffect(() => {
    rowRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({block: "nearest", inline: "nearest"});
  }, [current, numBuffers, hasCanvas]);

  const canAddBuffer = numBuffers < MAX_BUFFERS;
  const tab = (shader: ShaderId) => {
    const removable = shader === "canvas" || shader === numBuffers - 1;
    return (
      <UnstyledButton
        key={shader} role="tab" aria-selected={shader === current} className="shaderTab"
        data-error={errors.includes(shader) || undefined} data-buffer={typeof shader === "number" || undefined}
        onClick={() => onChoose(shader)}
      >
        {shader === "canvas" && <TbBrandJavascript className="shaderKind" aria-hidden />}
        {shaderName(shader)}
        {removable &&
          <Tooltip label={"Remove " + shaderName(shader)}>
            <ActionIcon
              component="span" size="xs" variant="subtle" color="gray" aria-label={"Remove " + shaderName(shader)}
              onClick={event => {
                event.stopPropagation();
                if (shader === "canvas") {
                  onRemoveCanvas();
                } else {
                  onRemoveLast();
                }
              }}
            >
              <TbX />
            </ActionIcon>
          </Tooltip>}
      </UnstyledButton>
    );
  };

  return (
    <div className="shaderTabs" role="tablist" aria-label="Code, in the order it draws" ref={rowRef}>
      {showShared && [
        <Tooltip key="shared" label="GLSL functions, constants and #defines that every shader can use">
          {tab("shared")}
        </Tooltip>,
        <span key="divider" className="shaderDivider" aria-hidden />,
      ]}
      {drawn.map((shader, i) => [
        // The Canvas2D layer runs first, but it's JavaScript, so a divider rather than an arrow.
        i > 0 && (drawn[i - 1] === "canvas" ? <span key="canvasDivider" className="shaderDivider" aria-hidden /> :
          then("then" + shader)),
        // A menu while the Canvas2D layer can still be added; once it's there, ⊕ just adds a buffer.
        shader === "image" && !hasCanvas && [
          <Menu key="add" position="bottom-start" width={300}>
            <Menu.Target>
              <ActionIcon
                variant="light" radius="xl" size="sm"
                aria-label={canAddBuffer ? "Add a buffer or the Canvas2D layer" : "Add the Canvas2D layer"}
              >
                <TbPlus />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              {canAddBuffer &&
                <Menu.Item leftSection={<TbStack2 />} onClick={onAdd}>
                  Add a buffer
                  <Text size="xs" c="dimmed">A shader that draws before the image, which any shader can read</Text>
                </Menu.Item>}
              <Menu.Item leftSection={<TbBrush />} onClick={onAddCanvas}>
                Add the Canvas2D layer
                <Text size="xs" c="dimmed">JavaScript that draws text and shapes over the image</Text>
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>,
          then("thenImage"),
        ],
        shader === "image" && hasCanvas && canAddBuffer && [
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
