// A player file: one HTML page that plays the animation, with its script and images inside it,
// to open from a download or put on any website. Loaded on first use, as it bundles the player.
import script from 'virtual:player-script';

import { fontFilesUsed } from '../layer/fonts';
import { parseImports } from '../layer/libraries';
import { safeFilename, type DownloadableFile } from '../lib/archive';
import { asset, textureURL } from '../lib/config';
import { bufferCodes, canvasLayer, EMPTY_TEXTURE, type AnimationDocument } from '../lib/document';
import { uses } from '../lib/glslCode';
import type { PlayerData } from './standalone';

async function dataURL(url: string): Promise<string> {
  const blob = await (await fetch(url)).blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("Couldn't read " + url));
    reader.readAsDataURL(blob);
  });
}

// Text that's safe inside a <script> element or HTML.
function scriptSafe(text: string): string {
  return text.replace(/</g, "\\u003c");
}

// The player's script, safe inline: `<!--` then `<script` in its strings would otherwise keep the
// element open past its end tag. `\x3C` is `<` in strings and regular expressions alike.
function inlineScript(code: string): string {
  return code.replace(/<\/script/gi, "<\\/script").replace(/<!--/g, "\\x3C!--").replace(/<script/gi, "\\x3Cscript");
}

function escapeHTML(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// `link` opens the animation in smoothstep.io, from the corner of the player.
export async function playerFile(doc: AnimationDocument, link: string | null): Promise<DownloadableFile> {
  // Only the textures some tab's code uses, as photos and panoramas can be several megabytes. A
  // Canvas2D layer that uses textures may use any of them.
  const allCode = [doc.code, doc.shared ?? "", ...bufferCodes(doc)].join("\n");
  const layer = canvasLayer(doc);
  const layerTextures = layer !== undefined && uses(layer.code, /\btextures\b/);
  const textures = await Promise.all(doc.textures.map((slot, i) =>
    new RegExp("\\biTexture" + i + "\\b").test(allCode) ||
      (layerTextures && (slot.isUserUploaded || slot.url !== EMPTY_TEXTURE))
      ? dataURL(textureURL(slot)) : Promise.resolve("")));
  const data: PlayerData = {document: doc, textures, link};
  if (layer) {
    // The libraries the layer imports and the fonts it names, so the file needs nothing from the site.
    const paths = [
      ...parseImports(layer.code).libraries.map(name => "libs/" + name + ".js"),
      ...fontFilesUsed(layer.code).map(font => "fonts/" + font.file),
    ];
    data.layerFiles = Object.fromEntries(await Promise.all(
      paths.map(async (path): Promise<[string, string]> => [path, await dataURL(asset(path))])));
    data.layerFonts = fontFilesUsed(layer.code);
  }
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="frame-src 'none'">
<title>${escapeHTML(doc.title)}</title>
<meta name="generator" content="smoothstep.io">
</head>
<body>
<div id="player"></div>
<script type="application/json" id="animation">${scriptSafe(JSON.stringify(data))}</script>
<script>${inlineScript(script)}</script>
</body>
</html>
`;
  return {blob: new Blob([html], {type: "text/html"}), filename: safeFilename(doc.title) + ".html"};
}
