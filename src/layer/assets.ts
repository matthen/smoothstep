// Where a Canvas2D layer's libraries and fonts come from. The app and the embedded player fetch
// them from the site; a player file carries its own.
import { FONT_FILES, type FontData, type FontFile } from './fonts';

export interface LayerAssets {
  // A library's script, by its name in LIBRARIES.
  library(name: string): Promise<string>;
  fonts(): Promise<FontData[]>;
}

// Fetches each file once, from URLs given by `url` for a path like "libs/planck.js".
export function fetchedAssets(url: (path: string) => string, fontFiles: readonly FontFile[] = FONT_FILES): LayerAssets {
  const libraries = new Map<string, Promise<string>>();
  let fonts: Promise<FontData[]> | null = null;
  const get = async (path: string) => {
    const response = await fetch(url(path));
    if (!response.ok) {
      throw new Error("Couldn't load " + path);
    }
    return response;
  };
  return {
    library(name) {
      let text = libraries.get(name);
      if (!text) {
        text = get("libs/" + name + ".js").then(response => response.text());
        libraries.set(name, text);
        // A failed download is tried again next time.
        text.catch(() => libraries.delete(name));
      }
      return text;
    },
    fonts() {
      fonts ??= Promise.all(fontFiles.map(async ({file, ...font}) =>
        ({...font, data: await (await get("fonts/" + file)).arrayBuffer()})));
      fonts.catch(() => {fonts = null;});
      return fonts;
    },
  };
}
