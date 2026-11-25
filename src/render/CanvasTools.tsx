// What sits over the canvas for checking values: the pixel inspector's button and readout, and the
// bar saying which expression the canvas shows in place of the image.
import { ActionIcon, CloseButton, SegmentedControl, Tooltip } from '@mantine/core';
import type { CSSProperties } from 'react';
import { TbColorPicker, TbEye } from 'react-icons/tb';

import { shaderName } from '../editor/ShaderTabs';
import { GlslCode } from '../editor/InlineCode';
import { formatNumber, formatValue, hexColor } from './inspect';
import type { PixelReading, ProbeResult, ShaderId } from './Renderer';

export type ShownProbe = Extract<ProbeResult, {ok: true}> & {tab: ShaderId};

interface ToolsProps {
  style: CSSProperties;
  inspect: boolean;
  onInspectChange(on: boolean): void;
  probe: ShownProbe | null;
  signed: boolean;
  onSignedChange(signed: boolean): void;
  onProbeOff(): void;
}

export function CanvasTools({style, inspect, onInspectChange, probe, signed, onSignedChange, onProbeOff}: ToolsProps) {
  const where = probe && (probe.tab === "shared" ? `in ${shaderName(probe.shader)}` : probe.tab !== "image" ?
    `in ${shaderName(probe.tab)}` : "");
  return (
    <div className="canvasTools" style={style} data-active={inspect || probe !== null || undefined}>
      <Tooltip label={inspect ? "Stop showing pixel values" : "Pixel inspector: point at the canvas to see a pixel's values"}>
        <ActionIcon
          className="inspectButton" variant={inspect ? "filled" : "default"} size="md" aria-label="Pixel inspector"
          aria-pressed={inspect} onClick={() => onInspectChange(!inspect)}
        >
          <TbColorPicker />
        </ActionIcon>
      </Tooltip>
      {probe &&
        <div className="probeBar" role="status" aria-label="Showing an expression">
          <TbEye aria-hidden className="probeIcon" />
          <span className="probeExpression"><GlslCode>{probe.expression}</GlslCode></span>
          <span className="probeType">{probe.type}{where ? " " + where : ""}</span>
          {probe.unmarked &&
            <Tooltip label="This device stores values as bytes, so pixels where the line doesn't run can't be striped.">
              <span className="probeType">skipped pixels not marked</span>
            </Tooltip>}
          <Tooltip label="The range of values shown from black to full colour. Others clip.">
            <SegmentedControl
              size="xs" value={signed ? "signed" : "unit"} onChange={value => onSignedChange(value === "signed")}
              data={[{value: "unit", label: "0 to 1"}, {value: "signed", label: "-1 to 1"}]}
              aria-label="Range shown"
            />
          </Tooltip>
          <CloseButton size="sm" aria-label="Show the image" title="Show the image" onClick={onProbeOff} />
        </div>}
    </div>
  );
}

interface ReadoutProps {
  reading: PixelReading;
  probe: ShownProbe | null;
  // The point, in the container's CSS pixels.
  left: number;
  top: number;
  // Which way to put the box from the point, to keep it on the canvas.
  flipX: boolean;
  flipY: boolean;
  touch: boolean;
  pixel: [number, number];
  resolution: [number, number];
}

export function PixelReadout({reading, probe, left, top, flipX, flipY, touch, pixel, resolution}: ReadoutProps) {
  const fragCoord = [pixel[0] + 0.5, pixel[1] + 0.5];
  const uv = fragCoord.map((c, i) => c / resolution[i]!);
  const offsetX = touch ? "-50%" : flipX ? "calc(-100% - 14px)" : "14px";
  // Below and right of a mouse pointer, and above a finger, unless that would leave the canvas.
  const offsetY = touch !== flipY ? `calc(-100% - ${touch ? 40 : 14}px)` : `${touch ? 40 : 14}px`;
  return (
    <>
      {touch && <div className="inspectPoint" style={{left, top}} aria-hidden />}
      <div
        className="pixelReadout" role="status" aria-label="Pixel values"
        style={{left, top, transform: `translate(${offsetX}, ${offsetY})`}}
      >
        {probe ? (
          <p className="readoutValue">
            <span className="probeExpression"><GlslCode>{probe.expression}</GlslCode></span>
            {reading.value ? <> = {formatValue(reading.value, probe.type)}</> : " doesn't run at this pixel"}
          </p>
        ) : (
          <p className="readoutValue">
            <span className="readoutSwatch" style={{background: hexColor(reading.color)}} />
            {reading.color.map(formatNumber).join("  ")}
            <span className="readoutDim">{hexColor(reading.color)}</span>
          </p>
        )}
        <p className="readoutDim">
          fragCoord {fragCoord.map(c => c.toFixed(1)).join(", ")} · uv {uv.map(c => c.toFixed(3)).join(", ")}
        </p>
      </div>
    </>
  );
}
