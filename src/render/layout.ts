import type { AspectRatio } from '../lib/document';

const MAX_RESOLUTION = 1280;

// Fits the aspect ratio inside the container, at most MAX_RESOLUTION on either side.
export function fitCanvas(containerWidth: number, containerHeight: number, [aw, ah]: AspectRatio): [number, number] {
  let height = Math.min(MAX_RESOLUTION, containerHeight);
  let width = aw * height / ah;
  const maxWidth = Math.min(MAX_RESOLUTION, containerWidth);
  if (width > maxWidth) {
    height *= maxWidth / width;
    width = maxWidth;
  }
  return [Math.max(1, Math.round(width)), Math.max(1, Math.round(height))];
}
