// A player file: one HTML page that plays the animation, with its script and images inside it,
// to open from a download or put on any website. Loaded on first use, as it bundles the player.
import script from 'virtual:player-script';

import { safeFilename, type DownloadableFile } from '../lib/archive';
import { textureURL } from '../lib/config';
import type { AnimationDocument } from '../lib/document';

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

function escapeHTML(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// `link` opens the animation in smoothstep, from the corner of the player.
export async function playerFile(doc: AnimationDocument, link: string | null): Promise<DownloadableFile> {
  // Only the textures the code uses, as photos and panoramas can be several megabytes.
  const textures = await Promise.all(doc.textures.map((slot, i) =>
    new RegExp("\\biTexture" + i + "\\b").test(doc.code) ? dataURL(textureURL(slot)) : ""));
  const data = {document: doc, textures, link};
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHTML(doc.title)}</title>
<meta name="generator" content="smoothstep.io">
</head>
<body>
<div id="player"></div>
<script type="application/json" id="animation">${scriptSafe(JSON.stringify(data))}</script>
<script>${script.replace(/<\/script/gi, "<\\/script")}</script>
</body>
</html>
`;
  return {blob: new Blob([html], {type: "text/html"}), filename: safeFilename(doc.title) + ".html"};
}
