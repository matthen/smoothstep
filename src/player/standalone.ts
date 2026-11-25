// The script inside a downloaded player file (see playerFile.ts). It plays the animation stored in
// the page's #animation JSON, with every image embedded, so the file works offline and anywhere.
import { fetchedAssets } from '../layer/assets';
import type { FontFile } from '../layer/fonts';
import { parseDocument } from '../lib/document';
import { playableURL } from '../lib/media';
import { PLAYER_CSS, startPlayer } from './player';

export interface PlayerData {
  document: unknown;
  textures: string[];
  link: string | null;
  // For a Canvas2D layer: the libraries and fonts it uses, as data URLs by their paths on the site.
  layerFiles?: Record<string, string>;
  layerFonts?: FontFile[];
}

const style = document.createElement("style");
style.textContent = PLAYER_CSS;
document.head.append(style);
const data = JSON.parse(document.getElementById("animation")!.textContent) as PlayerData;
startPlayer(document.getElementById("player")!, {
  doc: parseDocument(data.document),
  textureURLs: data.textures.map(playableURL),
  link: data.link ? {href: data.link, text: "Open in smoothstep.io"} : undefined,
  // A file that's missing gets an address that fails to load.
  layerAssets: () => Promise.resolve(
    fetchedAssets(path => data.layerFiles?.[path] ?? "about:invalid", data.layerFonts ?? [])),
});
