// A render's settings and progress, for the Render dialog and the exporter, and the frame size and count they give.
export type ExportType = "webm" | "mp4" | "gif" | "png";

export interface ExportOptions {
  width: number;
  fps: number;
  type: ExportType;
}

export interface ExportProgress {
  stage: "rendering" | "encoding";
  fraction: number;  // 0–1
}

export function exportSize(options: ExportOptions, aspectRatio: readonly [number, number]): [number, number] {
  const even = (x: number) => Math.max(2, 2 * Math.round(x / 2));
  const width = even(options.width);
  return [width, even(width * aspectRatio[1] / aspectRatio[0])];
}

export function frameCount(duration: number, fps: number): number {
  return Math.max(1, Math.round(duration * fps));
}
