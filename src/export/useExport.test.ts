import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ConsoleStore } from '../console/consoleStore';
import { newDocument } from '../lib/document';
import { useExport, type Preview } from './useExport';

// Each render runs until it's cancelled.
vi.mock('./exportVideo', () => ({
  exportVideo: (_doc: unknown, _options: unknown, _progress: unknown, signal: AbortSignal) =>
    new Promise((_resolve, reject) => {
      const cancel = () => reject(new Error("cancelled"));
      if (signal.aborted) cancel();
      signal.addEventListener("abort", cancel);
    }),
}));

function playingPreview(): Preview {
  const preview = {isPlaying: true, setIsPlaying: vi.fn((playing: boolean) => { preview.isPlaying = playing; })};
  return preview;
}

describe("useExport", () => {
  it("plays again after a cancelled render is quickly followed by another", async () => {
    const {result} = renderHook(() => useExport(new ConsoleStore(100, callback => callback()), newDocument(), vi.fn()));
    const preview = playingPreview();
    let first!: Promise<void>, second!: Promise<void>;
    act(() => {
      first = result.current.startExport(preview);
      result.current.cancelExport();
      second = result.current.startExport(preview);
    });
    await act(() => first);
    expect(preview.isPlaying).toBe(false);
    act(() => result.current.cancelExport());
    await act(() => second);
    expect(preview.isPlaying).toBe(true);
  });
});
