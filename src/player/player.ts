// A bare player for one animation, without React or the editor: used by the embedded player
// (embed.html) and the standalone player file. It loops the animation, and a click pauses it.
import { bufferCodes, variableValues, type AnimationDocument } from '../lib/document';
import { fitCanvas } from '../render/layout';
import { Renderer } from '../render/Renderer';

export interface PlayerOptions {
  doc: AnimationDocument;
  textureURLs: string[];
  // Shown in the corner, such as "Open in smoothstep".
  link?: {href: string; text: string};
}

export const PLAYER_CSS = `
html, body { margin: 0; height: 100%; background: #000; overflow: hidden; }
.smoothstepPlayer { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center;
  font: 13px/1.4 system-ui, sans-serif; color: #ddd; }
.smoothstepPlayer canvas { display: block; cursor: pointer; }
.smoothstepPlayer .message { max-width: 32em; padding: 16px; text-align: center; }
.smoothstepPlayer .link { position: absolute; right: 8px; bottom: 8px; padding: 2px 8px; border-radius: 4px;
  background: rgba(0, 0, 0, 0.6); color: #ddd; text-decoration: none; opacity: 0; transition: opacity 0.2s; }
.smoothstepPlayer:hover .link, .smoothstepPlayer .link:focus { opacity: 1; }
.smoothstepPlayer .paused { position: absolute; left: 8px; bottom: 8px; padding: 2px 8px; border-radius: 4px;
  background: rgba(0, 0, 0, 0.6); }
@media (hover: none) { .smoothstepPlayer .link { opacity: 1; } }
`;

export function showMessage(container: HTMLElement, text: string) {
  container.className = "smoothstepPlayer";
  const message = document.createElement("p");
  message.className = "message";
  message.textContent = text;
  container.replaceChildren(message);
}

export function startPlayer(container: HTMLElement, {doc, textureURLs, link}: PlayerOptions) {
  container.className = "smoothstepPlayer";
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-label", doc.title);
  let renderer: Renderer;
  try {
    renderer = new Renderer(canvas);
  } catch {
    showMessage(container, "This animation needs WebGL 2, which this browser or device doesn't support.");
    return;
  }
  const result = renderer.setCode(doc.code, bufferCodes(doc), doc.shared);
  if (!result.ok) {
    showMessage(container, "This animation's code has an error: " + result.errors.map(e => e.message).join(" "));
    return;
  }
  renderer.setTextures(textureURLs);
  // A texture that loads after the start changes what iPrevFrame holds, so start again.
  renderer.onTextureLoaded = () => restart();
  const paused = document.createElement("span");
  paused.className = "paused";
  paused.textContent = "Paused";
  paused.hidden = true;
  container.replaceChildren(canvas, paused);
  if (link) {
    const a = document.createElement("a");
    a.className = "link";
    a.href = link.href;
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent = link.text;
    container.append(a);
  }

  let time = 0;
  let frameIndex = 0;
  let playing = true;
  let visible = true;
  let last: number | null = null;

  const restart = () => {
    time = 0;
    frameIndex = 0;
    renderer.clearTargets();
  };

  const resize = () => {
    const [width, height] = fitCanvas(container.clientWidth, container.clientHeight, doc.aspectRatio);
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    if (renderer.setSize(width, height)) {
      frameIndex = 0;
    }
  };
  new ResizeObserver(resize).observe(container);
  resize();

  // Rest when scrolled out of sight, so an embedded animation doesn't use the GPU for nothing.
  new IntersectionObserver(entries => {
    visible = entries.some(e => e.isIntersecting);
  }).observe(container);

  canvas.addEventListener("click", () => {
    playing = !playing;
    paused.hidden = playing;
  });

  const frame = (now: number) => {
    if (playing && visible) {
      if (last !== null) {
        time += Math.max(0, (now - last) / 1000);
        if (time > doc.duration) {
          time = 0;
          frameIndex = 0;
        }
      }
      renderer.render({
        time, duration: doc.duration, frameIndex, variableValues: variableValues(doc.variables, time),
      });
      frameIndex += 1;
      last = now;
    } else {
      last = null;
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
