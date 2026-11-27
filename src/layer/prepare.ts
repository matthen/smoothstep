// Loads what every run of a Canvas2D layer's configuration shares: its script, with the libraries it
// imports, and the fonts and images it uses.
import { layerReadsTextures } from '../lib/document';
import { isVideoURL } from '../lib/media';
import type { LineError } from '../lib/types';
import type { LayerAssets } from './assets';
import type { FontData } from './fonts';
import { parseImports } from './libraries';
import type { TextureBitmaps } from './textureBitmaps';
import { workerSource, type LayerLog, type WorkerSource } from './workerSource';

export interface Prepared {
  source: WorkerSource;
  fonts: FontData[];
  textures: (ImageBitmap | null)[];
  // Console lines about it, such as an image that couldn't be loaded.
  warnings: LayerLog[];
}

export async function prepare(
  config: {code: string; textures: readonly (string | null)[]}, assets: LayerAssets, bitmaps: TextureBitmaps,
): Promise<Prepared | {errors: LineError[]}> {
  const imports = parseImports(config.code);
  if (imports.errors.length > 0) {
    return {errors: imports.errors};
  }
  // Decoding images takes a while, so only for code that uses them.
  const reads = layerReadsTextures(config.code);
  const images = config.textures.map(url => reads && url !== null && !isVideoURL(url) ? url : null);
  try {
    const [libraries, fonts, textures] = await Promise.all([
      Promise.all(imports.libraries.map(async name => ({name, code: await assets.library(name)}))),
      assets.fonts(config.code),
      Promise.all(images.map(url => url === null ? Promise.resolve(null) : bitmaps.get(url))),
    ]);
    const warnings = images.flatMap((url, slot): LayerLog[] => url !== null && textures[slot] === null ? [{
      level: "warn", text: `textures[${slot}]'s image couldn't be loaded, so it's null.`,
      frame: null, time: null, line: null, count: 1,
    }] : []);
    return {source: workerSource(imports.code, libraries), fonts, textures, warnings};
  } catch (error) {
    console.error(error);
    return {errors: [{line: 0, message: "Couldn't load what the Canvas2D code needs. Check your connection and build again."}]};
  }
}
