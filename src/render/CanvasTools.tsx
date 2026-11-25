// What sits over the canvas for checking values: the pixel inspector's button and readout, and the
// bar saying which expression the canvas shows in place of the image.
import { ActionIcon, CloseButton, SegmentedControl, Tooltip } from '@mantine/core';
import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { TbColorPicker, TbEye } from 'react-icons/tb';

import { shaderName } from '../editor/ShaderTabs';
import { GlslCode } from '../editor/InlineCode';
import { formatNumber, formatValue, hexColor } from './inspect';
import { describeRange, type FoundRange, type RangeMode } from './probeRange';
import type { PixelReading, ProbeResult, ShaderId } from './Renderer';

export type ShownProbe = Extract<ProbeResult, {ok: true}> & {tab: ShaderId};

// The narrowest the expression gets, in CSS pixels, before the bar drops the range found, then the type, then the tab.
const MIN_EXPRESSION = 48;

interface ToolsProps {
  style: CSSProperties;
  // The width the tools may take.
  room: number;
  inspect: boolean;
  onInspectChange(on: boolean): void;
  probe: ShownProbe | null;
  rangeMode: RangeMode;
  onRangeModeChange(mode: RangeMode): void;
  found: FoundRange;
  onProbeOff(): void;
}

export function CanvasTools({
  style, room, inspect, onInspectChange, probe, rangeMode, onRangeModeChange, found, onProbeOff,
}: ToolsProps) {
  const where = probe && (probe.tab === "shared" ? `in ${shaderName(probe.shader)}` : probe.tab !== "image" ?
    `in ${shaderName(probe.tab)}` : "");
  // How many of the range found, the type and the tab are left out to keep the bar on one line.
  const bar = useRef<HTMLDivElement>(null);
  const range = describeRange(found);
  const fit = `${room} ${probe?.expression} ${probe?.type} ${where} ${rangeMode}`;
  const [fitted, setFitted] = useState({fit, drop: 0});
  const drop = fitted.fit === fit ? fitted.drop : 0;
  useLayoutEffect(() => {
    const expression = bar.current?.querySelector<HTMLElement>(".probeExpression");
    if (!bar.current || !expression || drop >= 3) return;
    const squeezed = expression.scrollWidth > expression.clientWidth && expression.clientWidth < MIN_EXPRESSION;
    if (squeezed || bar.current.scrollWidth > bar.current.clientWidth) setFitted({fit, drop: drop + 1});
  }, [drop, fit, range]);
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
        <div ref={bar} className="probeBar" role="status" aria-label="Showing an expression">
          <TbEye aria-hidden className="probeIcon" />
          <span className="probeExpression" title={probe.expression}><GlslCode>{probe.expression}</GlslCode></span>
          {(drop < 2 || (where && drop < 3)) &&
            <span className="probeType">{[drop < 2 && probe.type, where].filter(Boolean).join(" ")}</span>}
          {probe.unmarked && drop < 1 &&
            <Tooltip label="This device stores values as bytes, so pixels where the line doesn't run can't be striped.">
              <span className="probeType">skipped pixels not marked</span>
            </Tooltip>}
          <Tooltip label="The range of values shown from black to full colour. Auto uses the lowest and highest on the canvas.">
            <SegmentedControl
              className="probeRangeMode" size="xs" withItemsBorders={false} value={rangeMode}
              onChange={value => onRangeModeChange(value)}
              data={[{value: "auto", label: "Auto"}, {value: "unit", label: "0 to 1"}, {value: "signed", label: "-1 to 1"}]}
              aria-label="Range shown"
            />
          </Tooltip>
          {rangeMode === "auto" && drop < 1 &&
            <span className="probeType probeRange" aria-label="Range found">{range}</span>}
          <CloseButton className="probeClose" size="xs" aria-label="Show the image" title="Show the image" onClick={onProbeOff} />
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
            <span>{reading.value ? ` = ${formatValue(reading.value, probe.type)}` : " doesn't run at this pixel"}</span>
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
