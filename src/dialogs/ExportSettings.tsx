// The Render dialog, which sets a render's size, frame rate and file type, and shows its progress.
import { Alert, Button, Group, Loader, NativeSelect, Progress, Stack, Text, TextInput } from '@mantine/core';
import { useState } from 'react';

import AppModal from '../app/AppModal';
import { useTouch } from '../app/layout/usePhone';
import { noVideoReason } from '../export/videoSupport';
import { exportSize, frameCount, type ExportOptions, type ExportProgress, type ExportType } from './exportTypes';

interface ExportSettingsProps {
  show: boolean;
  duration: number;
  aspectRatio: readonly [number, number];
  options: ExportOptions;
  onOptionsChange(options: ExportOptions): void;
  onExport(): void;
  onCancel(): void;  // Also aborts a running export.
  progress: ExportProgress | null;  // null when idle
  error: string | null;
}

const FILE_TYPES: [ExportType, string][] = [
  ["webm", "Webm video"],
  ["mp4", "MP4 video"],
  ["png", "PNG frames (.zip)"],
  ["gif", "Animated GIF"],
];

// Parses a typed width (rounded up to even) or frame rate, or null if it isn't a positive number.
export function parseWidth(text: string): number | null {
  const width = 2 * Math.ceil(Number(text) / 2);
  return text.trim() && Number.isFinite(width) && width > 0 ? width : null;
}

export function parseFps(text: string): number | null {
  const fps = Math.round(Number(text));
  return text.trim() && Number.isFinite(fps) && fps > 0 ? fps : null;
}

function formatSeconds(seconds: number): string {
  return `${Number(seconds.toFixed(2))} s`;
}

export default function ExportSettings(
  {show, duration, aspectRatio, options, onOptionsChange, onExport, onCancel, progress, error}: ExportSettingsProps,
) {
  const touch = useTouch();
  const [widthText, setWidthText] = useState(String(options.width));
  const [fpsText, setFpsText] = useState(String(options.fps));
  const [wasShown, setWasShown] = useState(false);
  if (show !== wasShown) {
    setWasShown(show);
    if (show) {
      setWidthText(String(options.width));
      setFpsText(String(options.fps));
    }
  }

  const disabled = progress !== null;
  const widthValid = parseWidth(widthText) !== null;
  const fpsValid = parseFps(fpsText) !== null;
  const noVideo = options.type === "webm" || options.type === "mp4" ? noVideoReason() : null;

  const handleWidth = (text: string) => {
    setWidthText(text);
    const width = parseWidth(text);
    if (width !== null) {
      onOptionsChange({...options, width});
    }
  };

  const handleFps = (text: string) => {
    setFpsText(text);
    const fps = parseFps(text);
    if (fps !== null) {
      onOptionsChange({...options, fps});
    }
  };

  const unit = (text: string) => <Text size="sm" c="dimmed" pr="xs">{text}</Text>;

  const [width, height] = exportSize(options, aspectRatio);
  const frames = frameCount(duration, options.fps);

  return (
    // While exporting, only Cancel closes it, since closing stops the export.
    <AppModal
      opened={show} onClose={onCancel} closeOnEscape={!disabled} closeOnClickOutside={!disabled}
      withCloseButton={!disabled} trapFocus={!touch}
      title={<Group gap="xs">Render{disabled && <Loader size="xs" role="status" />}</Group>}
      classNames={{content: "export"}}
    >
      <form onSubmit={event => event.preventDefault()}>
        <Stack gap="sm">
          <TextInput
            id="exportWidth" label="Resolution width" type="number" min="16" step="16" value={widthText}
            onChange={event => handleWidth(event.target.value)} rightSection={unit("px")} rightSectionWidth={40}
            error={!widthValid} disabled={disabled}
          />
          <TextInput
            id="exportFps" label="Frame rate" type="number" min="6" step="6" value={fpsText}
            onChange={event => handleFps(event.target.value)} rightSection={unit("fps")} rightSectionWidth={44}
            error={!fpsValid} disabled={disabled}
          />
          <NativeSelect
            id="exportType" label="File type" value={options.type} disabled={disabled}
            onChange={event => onOptionsChange({...options, type: event.target.value as ExportType})}
            data={FILE_TYPES.map(([value, label]) => ({value, label}))}
          />
          {widthValid && fpsValid &&
            <Text size="sm" c="dimmed" className="exportSummary">
              {formatSeconds(duration)} · {width} × {height} px · {frames} {frames === 1 ? "frame" : "frames"}
            </Text>}
          {noVideo && <Alert color="yellow">{noVideo}</Alert>}
        </Stack>
      </form>
      {error && <Alert color="red" mt="md">{error}</Alert>}
      {progress &&
        <Stack gap={6} mt="lg">
          <Text size="sm">{progress.stage === "rendering" ? "Rendering frames" : "Encoding"}</Text>
          <Progress
            value={progress.fraction * 100} striped animated
            transitionDuration={progress.stage === "rendering" ? 0 : 200}
          />
        </Stack>
      }
      <Group justify="flex-end" mt="lg">
        <Button variant="default" onClick={onCancel}>Cancel</Button>
        <Button onClick={onExport} disabled={disabled || !widthValid || !fpsValid}>Render</Button>
      </Group>
    </AppModal>
  );
}
