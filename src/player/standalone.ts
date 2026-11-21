// The script inside a downloaded player file (see playerFile.ts). It plays the animation stored in
// the page's #animation JSON, with every image embedded, so the file works offline and anywhere.
import { parseDocument } from '../lib/document';
import { PLAYER_CSS, startPlayer } from './player';

interface PlayerData {
  document: unknown;
  textures: string[];
  link: string | null;
}

const style = document.createElement("style");
style.textContent = PLAYER_CSS;
document.head.append(style);
const data = JSON.parse(document.getElementById("animation")!.textContent!) as PlayerData;
startPlayer(document.getElementById("player")!, {
  doc: parseDocument(data.document),
  textureURLs: data.textures,
  link: data.link ? {href: data.link, text: "Open in smoothstep.io"} : undefined,
});
