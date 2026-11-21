// The embedded player, embed.html: plays the animation its hash names (an example, a share link,
// a file's URL or a gist), for showing on other websites in an iframe.
import { textureURL } from '../lib/config';
import { parseHash } from '../lib/routes';
import { appLink, loadRoute, ShareError } from '../lib/share';
import { PLAYER_CSS, showMessage, startPlayer } from './player';

const style = document.createElement("style");
style.textContent = PLAYER_CSS;
document.head.append(style);
const container = document.getElementById("player")!;

async function main() {
  const route = parseHash(window.location.hash);
  if (!route || route.kind === "anim" || route.kind === "tutorial") {
    showMessage(container, "There's no animation in this link.");
    return;
  }
  try {
    const {doc, images} = await loadRoute(route);
    document.title = doc.title + " - smoothstep.io";
    const urls = new Map([...images].map(([id, blob]) => [id, URL.createObjectURL(blob)]));
    const textureURLs = doc.textures.map(t => t.isUserUploaded ? urls.get(t.url) ?? textureURL(t) : textureURL(t));
    startPlayer(container, {
      doc, textureURLs,
      link: {href: appLink(window.location.hash), text: "Open in smoothstep.io"},
    });
  } catch (error) {
    if (error instanceof ShareError) {
      showMessage(container, error.message);
    } else {
      console.error(error);
      showMessage(container, "Couldn't open this animation.");
    }
  }
}

window.addEventListener("hashchange", () => window.location.reload());
void main();
