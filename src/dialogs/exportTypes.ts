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
