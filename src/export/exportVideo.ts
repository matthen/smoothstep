// Renders an animation frame by frame at a fixed rate on its own canvas, and encodes it in the
// browser: WebM and MP4 with WebCodecs, GIF with gifenc, PNG frames as a zip.
import { applyPalette, GIFEncoder, quantize } from 'gifenc';
import {
  BufferTarget, CanvasSource, getFirstEncodableVideoCodec, Mp4OutputFormat, Output, Quality,
  WebMOutputFormat, type VideoCodec,
} from 'mediabunny';

import { exportSize, frameCount, type ExportOptions, type ExportProgress } from '../dialogs/exportTypes';
import { safeFilename, zipWriter, type DownloadableFile } from '../lib/archive';
import { textureURL } from '../lib/config';
import type { CanvasLayer, LayerLog } from '../layer/CanvasLayer';
import type { LineError } from '../lib/types';
import { bufferCodes, canvasLayer, layerTextureURLs, variableValues, type AnimationDocument } from '../lib/document';
import { layerInputs } from '../render/layerSteps';
import { Renderer, type FrameInputs } from '../render/Renderer';
import { renderSteps, RESTART, type StepRenderer } from '../render/steps';
import { noVideoReason } from './videoSupport';

export { exportSize, frameCount };

class ExportCancelled extends Error {}

// Where an export reports the Canvas2D code's console calls and errors, and anything that didn't
// go quite as asked.
export interface ExportLog {
  layer(logs: LayerLog[], dropped: number): void;
  layerErrors(errors: LineError[]): void;
  warn(text: string): void;
}

const CODEC_NAMES: Record<VideoCodec, string> = {
  avc: "H.264", hevc: "H.265", vp9: "VP9", vp8: "VP8", av1: "AV1", prores: "ProRes",
};

interface Encoder {
  addFrame(index: number): Promise<void>;
  finish(): Promise<Blob>;
  cancel(): Promise<void>;
}

async function videoEncoder(
  canvas: HTMLCanvasElement, type: "webm" | "mp4", fps: number, width: number, height: number,
  warn: (text: string) => void,
): Promise<Encoder> {
  const noVideo = noVideoReason();
  if (noVideo) {
    throw new Error(noVideo);
  }
  const candidates: VideoCodec[] = type === "mp4" ? ["avc", "hevc", "av1"] : ["vp9", "vp8", "av1"];
  const codec = await getFirstEncodableVideoCodec(candidates, {width, height});
  if (!codec) {
    throw new Error(`This browser can't encode ${type.toUpperCase()} video at ${width}×${height}.`);
  }
  if (codec !== candidates[0]) {
    warn(`This browser can't encode ${CODEC_NAMES[candidates[0]!]} at ${width}×${height}, so the ` +
      `${type.toUpperCase()} video uses ${CODEC_NAMES[codec]}, which some players can't play.`);
  }
  const target = new BufferTarget();
  const output = new Output({format: type === "mp4" ? new Mp4OutputFormat() : new WebMOutputFormat(), target});
  const source = new CanvasSource(canvas, {codec, quality: new Quality("high")});
  output.addVideoTrack(source, {frameRate: fps});
  await output.start();
  return {
    addFrame: index => source.add(index / fps, 1 / fps),
    finish: async () => {
      await output.finalize();
      return new Blob([target.buffer!], {type: type === "mp4" ? "video/mp4" : "video/webm"});
    },
    cancel: () => output.cancel(),
  };
}

function gifEncoder(canvas: HTMLCanvasElement, fps: number): Encoder {
  const gif = GIFEncoder();
  const context = canvas.getContext("2d", {willReadFrequently: true})!;
  return {
    addFrame: () => {
      const {data, width, height} = context.getImageData(0, 0, canvas.width, canvas.height);
      const palette = quantize(data, 256);
      gif.writeFrame(applyPalette(data, palette), width, height, {palette, delay: 1000 / fps});
      return Promise.resolve();
    },
    finish: () => {
      gif.finish();
      return Promise.resolve(new Blob([gif.bytes() as Uint8Array<ArrayBuffer>], {type: "image/gif"}));
    },
    cancel: async () => {},
  };
}

function pngEncoder(canvas: HTMLCanvasElement): Encoder {
  const files = zipWriter();
  return {
    addFrame: async index => {
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/png"));
      if (!blob) {
        throw new Error("Couldn't encode a PNG frame.");
      }
      files.add("frame" + String(index).padStart(5, "0") + ".png", new Uint8Array(await blob.arrayBuffer()));
    },
    finish: () => Promise.resolve(files.finish()),
    cancel: async () => {},
  };
}

const EXTENSIONS = {webm: ".webm", mp4: ".mp4", gif: ".gif", png: ".zip"};

// The animation's Canvas2D layer, if it has one, started for an export at its size with its textures.
async function startLayer(
  doc: AnimationDocument, renderer: Renderer, frame: {width: number; height: number; textures: (string | null)[]},
  log?: ExportLog,
): Promise<CanvasLayer | null> {
  const layerDoc = canvasLayer(doc);
  if (!layerDoc) {
    return null;
  }
  const {CanvasLayer, bundledAssets} = await import('../layer/bundled');
  const layer = new CanvasLayer(bundledAssets, {
    onFrame: bitmap => bitmap.close(),
    onStatus: errors => {
      if (errors.length > 0) {
        log?.layerErrors(errors);
      }
    },
    ...log && {onLog: (logs: LayerLog[], dropped: number) => log.layer(logs, dropped)},
  }, false);
  renderer.setLayer(true);
  renderer.layerOverlay = layerDoc.overlay;
  layer.configure({code: layerDoc.code, ...frame, duration: doc.duration});
  return layer;
}

// Throws ExportCancelled when `signal` aborts.
export async function exportVideo(
  doc: AnimationDocument, options: ExportOptions,
  onProgress: (progress: ExportProgress) => void, signal: AbortSignal, log?: ExportLog,
): Promise<DownloadableFile> {
  const [width, height] = exportSize(options, doc.aspectRatio);
  const fps = Math.max(1, Math.round(options.fps));
  const frames = frameCount(doc.duration, fps);
  const glCanvas = document.createElement("canvas");
  const renderer = new Renderer(glCanvas);
  // Each frame is copied to a 2D canvas straight after it's drawn, before WebGL can clear it.
  const frameCanvas = document.createElement("canvas");
  frameCanvas.width = width;
  frameCanvas.height = height;
  const frameContext = frameCanvas.getContext("2d", {willReadFrequently: options.type === "gif"})!;
  let encoder: Encoder | null = null;
  let layer: CanvasLayer | null = null;
  const cancelled = new Promise<never>((_, reject) => {
    signal.addEventListener("abort", () => reject(new ExportCancelled()), {once: true});
  });
  cancelled.catch(() => {});
  try {
    const compiled = renderer.setCode(doc.code, bufferCodes(doc), doc.shared);
    if (!compiled.ok) {
      throw new Error("The shader doesn't compile: " + (compiled.errors[0]?.message ?? ""));
    }
    renderer.setSize(width, height);
    renderer.onTextureFailed = (slot, video) =>
      log?.warn(`iTexture${slot}'s ${video ? "video" : "image"} couldn't be loaded, so it's black in the render.`);
    const textureURLs = doc.textures.map(textureURL);
    renderer.setTextures(textureURLs);
    await renderer.texturesReady();
    layer = await startLayer(doc, renderer, {width, height, textures: layerTextureURLs(doc.textures, textureURLs)}, log);
    encoder = options.type === "gif" ? gifEncoder(frameCanvas, fps) :
      options.type === "png" ? pngEncoder(frameCanvas) :
      await videoEncoder(frameCanvas, options.type, fps, width, height, text => log?.warn(text));
    let steps = RESTART;
    // The steps a frame takes are listed first, as each waits for the Canvas2D layer to draw it.
    const due: FrameInputs[] = [];
    const lister: StepRenderer = {
      get hasState() {
        return renderer.hasState;
      },
      render: inputs => {
        due.push(inputs);
      },
      // Each frame's clock is later than the last, so no step draws again.
      redraw: () => undefined,
    };
    for (let i = 0; i < frames; i++) {
      if (signal.aborted) {
        throw new ExportCancelled();
      }
      const time = i / fps;
      const before = steps;
      steps = renderSteps(lister, steps, time, time, (t, frameIndex) => ({
        time: t, duration: doc.duration, frameIndex, variableValues: variableValues(doc.variables, t),
      }));
      for (const inputs of due.splice(0)) {
        if (renderer.hasVideos) {
          await Promise.race([renderer.seekVideos(inputs.time), cancelled]);
        }
        if (layer) {
          const drawn = layer.draw(layerInputs(inputs, layer, renderer));
          // However long a step takes, cancelling still stops the export.
          renderer.setLayerFrame(await Promise.race([drawn.catch((error: unknown) => {
            throw new Error("The Canvas2D code has an error: " + (error instanceof Error ? error.message : String(error)));
          }), cancelled]));
        }
        renderer.render(inputs);
      }
      // Above 60fps, frames between a simulation's steps repeat the one before.
      if (!renderer.hasState || steps.rendered !== before.rendered) {
        frameContext.drawImage(glCanvas, 0, 0);
      }
      await encoder.addFrame(i);
      onProgress({stage: "rendering", fraction: (i + 1) / frames});
      if (i % 4 === 3) {
        await new Promise(resolve => setTimeout(resolve, 0));  // Let the progress bar repaint.
      }
    }
    onProgress({stage: "encoding", fraction: 1});
    const blob = await encoder.finish();
    if (signal.aborted) {
      throw new ExportCancelled();
    }
    return {blob, filename: safeFilename(doc.title) + EXTENSIONS[options.type]};
  } catch (error) {
    await encoder?.cancel().catch(() => {});
    throw error;
  } finally {
    layer?.dispose();
    renderer.dispose();
  }
}
