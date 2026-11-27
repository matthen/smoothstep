import { ActionIcon, Tooltip } from '@mantine/core';
import { useRef, useState, type MouseEvent as ReactMouseEvent, type RefObject } from 'react';
import { TbMaximize, TbMinimize } from 'react-icons/tb';

import AspectRatioPicker from '../dialogs/AspectRatioPicker';
import type { AspectRatio } from '../lib/document';
import type { LineError } from '../lib/types';
import Canvas, { type CanvasHandle, type CanvasLayout } from '../render/Canvas';
import type { CompileResult } from '../render/Renderer';
import PlayerControls, { PLAYER_ONE_ROW_WIDTH, PLAYER_SECOND_ROW_WIDTH } from '../timeline/PlayerControls';
import PaneDivider from './PaneDivider';
import type { useConsoleLog } from './useConsoleLog';
import type { useDocument } from './useDocument';
import type { useInputs } from './useInputs';
import type { usePlayback } from './usePlayback';
import type { useProbe } from './useProbe';

interface Props {
  workspace: RefObject<HTMLElement | null>;
  // The canvas side's width set with the divider, or null for a preset.
  onWidthChange: (width: number | null) => void;
  onResizing: (resizing: boolean) => void;
  fullView: boolean;
  setFull: (on: boolean) => void;
  canvasRef: RefObject<CanvasHandle | null>;
  docState: ReturnType<typeof useDocument>;
  playback: ReturnType<typeof usePlayback>;
  inputs: ReturnType<typeof useInputs>;
  probe: ReturnType<typeof useProbe>;
  log: ReturnType<typeof useConsoleLog>;
  onLayerStatus: (errors: LineError[], loading?: boolean) => void;
  onBuilt: (result: CompileResult, ms: number) => void;
  onDurationChange: (duration: number) => void;
}

const isBackground = (event: ReactMouseEvent) =>
  event.target === event.currentTarget || (event.target as HTMLElement).id === "canvasContainer";

// The canvas and its play bar, beside the code.
export default function PreviewPane(
  {workspace, onWidthChange, onResizing, fullView, setFull, canvasRef, docState, playback, inputs, probe, log,
    onLayerStatus, onBuilt, onDurationChange}: Props,
) {
  const {doc, layer} = docState;
  const {time, isPlaying, seek} = playback;
  const [layout, setLayout] = useState<CanvasLayout>({width: 0, height: 0, top: 0, containerWidth: 0});
  const pressedBackground = useRef(false);
  return (
    <section
      className="previewPane"
      // The play bar's second row, when one row of controls is wider than the pane, with smaller
      // controls when even that row is.
      data-two-rows={fullView || layout.containerWidth >= PLAYER_ONE_ROW_WIDTH ? undefined :
        layout.containerWidth < PLAYER_SECOND_ROW_WIDTH ? "narrow" : ""}
      // In full screen, a click on the background around the canvas and play bar leaves it. A drag
      // from the canvas that ends there clicks their common ancestor, so the press must start there too.
      onPointerDown={event => { pressedBackground.current = isBackground(event); }}
      onClick={event => {
        if (fullView && pressedBackground.current && isBackground(event)) {
          setFull(false);
        }
      }}
    >
      <PaneDivider
        workspace={workspace} onReset={() => onWidthChange(null)} onDragging={onResizing}
        onChange={onWidthChange}
      />
      <Canvas
        ref={canvasRef}
        shaders={docState.shaders} buildId={docState.buildId} textureURLs={inputs.textureURLs}
        layerTextures={inputs.layerTextures} layerOverlay={layer?.overlay ?? true} onLayerStatus={onLayerStatus}
        onLayerLog={log.addLayerLogs} onLayerRestart={log.onLayerRestart} onTextureFailed={log.onTextureFailed}
        time={time} playing={isPlaying && !playback.scrubbing} duration={doc.duration} stepClock={playback.stepClock}
        variableValues={playback.values}
        aspectRatio={doc.aspectRatio}
        onBuilt={onBuilt}
        onRestart={playback.restartFrames} onLayout={setLayout}
        probe={probe.shownProbe} onProbe={probe.onProbe} onProbeOff={probe.clear}
        inspect={probe.inspect} onInspectChange={probe.setInspect}
      />
      <PlayerControls
        duration={doc.duration} currentTime={time} isPlaying={isPlaying}
        onSeek={seek} onPlayPause={() => playback.setIsPlaying(p => !p)} onReset={() => seek(0)}
        onDurationChange={onDurationChange}
        onScrubStart={() => playback.setScrubbing(true)} onScrubEnd={() => playback.setScrubbing(false)}
        width={layout.width || undefined} top={layout.top} playOnly={fullView}
        extra={<>
          {!fullView &&
            <AspectRatioPicker
              value={doc.aspectRatio} onChange={(aspectRatio: AspectRatio) => docState.edit({aspectRatio})}
            />}
          <Tooltip label={fullView ? "Exit full screen (Esc)" : "Full screen"} position="bottom">
            <ActionIcon
              variant="default" size="input-sm" className="fullViewButton"
              aria-label={fullView ? "Exit full screen" : "Full screen"}
              onMouseDown={event => event.preventDefault()} onClick={() => setFull(!fullView)}
            >
              {fullView ? <TbMinimize /> : <TbMaximize />}
            </ActionIcon>
          </Tooltip>
        </>}
      />
    </section>
  );
}
