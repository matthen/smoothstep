// Where a Canvas2D layer's libraries and fonts come from. The app and the embedded player fetch
// them from the site; a player file carries its own.
import { FONT_FILES, fontFilesUsed, type FontData, type FontFile } from './fonts';

export interface LayerAssets {
  // A library's script, by its name in LIBRARIES.
  library(name: string): Promise<string>;
  // The fonts `code` uses, of those there are.
  fonts(code: string): Promise<FontData[]>;
}

// Fetches each file once, from URLs given by `url` for a path like "libs/planck.js".
export function fetchedAssets(url: (path: string) => string, fontFiles: readonly FontFile[] = FONT_FILES): LayerAssets {
  const libraries = new Map<string, Promise<string>>();
  const fonts = new Map<string, Promise<FontData>>();
  const get = async (path: string) => {
    const response = await fetch(url(path));
    if (!response.ok) {
      throw new Error("Couldn't load " + path);
    }
    return response;
  };
  // A failed download is tried again next time.
  const once = <T>(cache: Map<string, Promise<T>>, key: string, load: () => Promise<T>) => {
    let value = cache.get(key);
    if (!value) {
      value = load();
      cache.set(key, value);
      value.catch(() => cache.delete(key));
    }
    return value;
  };
  return {
    library(name) {
      return once(libraries, name, () => get("libs/" + name + ".js").then(response => response.text()));
    },
    fonts(code) {
      const used = new Set(fontFilesUsed(code).map(font => font.file));
      return Promise.all(fontFiles.filter(font => used.has(font.file)).map(({file, ...font}) =>
        once(fonts, file, async () => ({...font, data: await (await get("fonts/" + file)).arrayBuffer()}))));
    },
  };
}
