import { ActionIcon, Menu, Text, Tooltip, UnstyledButton } from '@mantine/core';
import { type ReactNode, useEffect, useRef } from 'react';
import {
  TbBook, TbBrush, TbChevronRight, TbFunction, TbPlus, TbStack2, TbX,
} from 'react-icons/tb';

import { bufferMainImage, DEFAULT_MAIN_IMAGE, MAX_BUFFERS, NEW_CANVAS_DRAW } from '../lib/document';
import type { ShaderId } from '../render/Renderer';

interface ShaderTabsProps {
  numBuffers: number;
  hasShared: boolean;
  hasCanvas: boolean;
  // The open tab: a code tab, or the docs.
  current: ShaderId | "docs";
  hasDocs: boolean;
  // The tabs whose code didn't build or run.
  errors: readonly ShaderId[];
  onChoose(shader: ShaderId): void;
  onAdd(): void;
  onRemoveLast(): void;
  onAddCanvas(): void;
  onRemoveCanvas(): void;
  onAddShared(): void;
  onRemoveShared(): void;
  onChooseDocs(): void;
  onCloseDocs(): void;
}

// A tab is named like a file, so its extension says its language. A buffer is named as the code reads it.
export function shaderName(shader: ShaderId): string {
  const [base, extension] = shaderNameParts(shader);
  return base + extension;
}

function shaderNameParts(shader: ShaderId): [string, string] {
  return shader === "canvas" ? ["Canvas2D", ".js"] :
    [shader === "image" ? "Image" : shader === "shared" ? "shared" : "iBuffer" + shader, ".glsl"];
}

// The line above each tab's code: what it does and how the others read it.
export function shaderCaption(shader: ShaderId): ReactNode {
  return shader === "canvas" ? <>Draws first; shaders read it as <code>iCanvas2D</code></> :
    shader === "shared" ? <>Goes at the top of every shader tab</> :
    shader === "image" ? <>Draws what you see; its last frame is <code>iPrevFrame</code></> :
    <>Draws before the image; shaders read it as <code>iBuffer{shader}</code></>;
}

// The function a tab's code must have, as a new tab of its kind starts with it.
export function starterFunction(shader: ShaderId): string | undefined {
  return shader === "canvas" ? NEW_CANVAS_DRAW : shader === "image" ? DEFAULT_MAIN_IMAGE :
    shader === "shared" ? undefined : bufferMainImage(shader);
}

// Tabs above the code: the Canvas2D layer's JavaScript, set apart, then the shared GLSL, also set
// apart, then each buffer and the image in the order they draw each frame, with a button to add a
// buffer, the Canvas2D layer or shared GLSL code, and one on each of those to remove it (the last buffer only).
// The docs, when they're open, are a tab at the end, set apart too.
export default function ShaderTabs({
  numBuffers, hasShared, hasCanvas, current, hasDocs, errors, onChoose, onAdd, onRemoveLast, onAddCanvas,
  onRemoveCanvas, onAddShared, onRemoveShared, onChooseDocs, onCloseDocs,
}: ShaderTabsProps) {
  const drawn: ShaderId[] = [...Array.from({length: numBuffers}, (_, i) => i), "image"];
  const then = (key: string) => <TbChevronRight key={key} className="shaderThen" aria-hidden />;
  const rowRef = useRef<HTMLDivElement>(null);
  // When the row scrolls sideways, keep the open tab in view.
  useEffect(() => {
    rowRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({block: "nearest", inline: "nearest"});
  }, [current, numBuffers, hasCanvas, hasShared, hasDocs]);

  // What ⊕ can add: a menu of them when there's more than one, otherwise it adds the one straight away.
  const addable: AddItem[] = [
    ...(numBuffers < MAX_BUFFERS ? [{
      what: "a buffer", icon: <TbStack2 />, onAdd,
      about: "a shader that draws before the image, which any shader can read",
    }] : []),
    ...(hasCanvas ? [] : [{
      what: "the Canvas2D layer", icon: <TbBrush />, onAdd: onAddCanvas,
      about: "JavaScript that draws text and shapes over the image",
    }]),
    ...(hasShared ? [] : [{
      what: "shared GLSL code", icon: <TbFunction />, onAdd: onAddShared, about: SHARED_ABOUT,
    }]),
  ];
  const addButton = (label: string, onClick?: () => void) =>
    <ActionIcon variant="light" radius="xl" size="sm" onClick={onClick} aria-label={label}>
      <TbPlus />
    </ActionIcon>;
  const add = addable.length === 0 ? null : addable.length === 1 ?
    <Tooltip key="add" label={`Add ${addable[0]!.what}: ${addable[0]!.about}`}>
      {addButton("Add " + addable[0]!.what, addable[0]!.onAdd)}
    </Tooltip> :
    <Menu key="add" position="bottom-start" width={300}>
      <Menu.Target>
        {addButton("Add " + addable.slice(0, -1).map(item => item.what).join(", ") + " or " + addable.at(-1)!.what)}
      </Menu.Target>
      <Menu.Dropdown>
        {addable.map(item =>
          <Menu.Item key={item.what} leftSection={item.icon} onClick={item.onAdd}>
            Add {item.what}
            <Text size="xs" c="dimmed">{item.about[0]!.toUpperCase() + item.about.slice(1)}</Text>
          </Menu.Item>)}
      </Menu.Dropdown>
    </Menu>;

  const tab = (shader: ShaderId) => {
    const removable = shader === "canvas" || shader === "shared" || shader === numBuffers - 1;
    const [base, extension] = shaderNameParts(shader);
    return (
      <UnstyledButton
        key={shader} role="tab" aria-selected={shader === current} className="shaderTab"
        data-error={errors.includes(shader) || undefined}
        onClick={() => onChoose(shader)}
      >
        <span>{base}<span className="shaderExtension">{extension}</span></span>
        {removable &&
          <Tooltip label={"Remove " + shaderName(shader)}>
            <ActionIcon
              component="span" size="xs" variant="subtle" color="gray" aria-label={"Remove " + shaderName(shader)}
              onClick={event => {
                event.stopPropagation();
                if (shader === "canvas") {
                  onRemoveCanvas();
                } else if (shader === "shared") {
                  onRemoveShared();
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
      {/* The Canvas2D layer draws first, but it's JavaScript, so a divider rather than an arrow. */}
      {hasCanvas && [tab("canvas"), <span key="canvasDivider" className="shaderDivider" aria-hidden />]}
      {hasShared && [
        <Tooltip key="shared" label={SHARED_ABOUT}>
          {tab("shared")}
        </Tooltip>,
        <span key="divider" className="shaderDivider" aria-hidden />,
      ]}
      {drawn.map((shader, i) => [
        i > 0 && then("then" + shader),
        shader === "image" && add && [add, then("thenImage")],
        tab(shader),
      ])}
      {hasDocs && [
        <span key="docsDivider" className="shaderDivider" aria-hidden />,
        <UnstyledButton
          key="docs" role="tab" aria-selected={current === "docs"} className="shaderTab" onClick={onChooseDocs}
        >
          <TbBook className="shaderKind" aria-hidden />
          Docs
          <Tooltip label="Close the docs">
            <ActionIcon
              component="span" size="xs" variant="subtle" color="gray" aria-label="Close the docs"
              onClick={event => {
                event.stopPropagation();
                onCloseDocs();
              }}
            >
              <TbX />
            </ActionIcon>
          </Tooltip>
        </UnstyledButton>,
      ]}
    </div>
  );
}

const SHARED_ABOUT = "GLSL functions, constants and #defines that every shader can use";

interface AddItem {
  what: string;
  icon: ReactNode;
  about: string;
  onAdd(): void;
}
