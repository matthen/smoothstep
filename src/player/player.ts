// A bare player for one animation, without React or the editor: used by the embedded player
// (embed.html) and the standalone player file. It loops the animation, and a click pauses it.
import type { LayerAssets } from '../layer/assets';
import type { CanvasLayer } from '../layer/CanvasLayer';
import { bufferCodes, canvasLayer, EMPTY_TEXTURE, variableValues, type AnimationDocument } from '../lib/document';
import { LayerSteps } from '../render/layerSteps';
import { drawingSize, fitCanvas, SlowFrames } from '../render/layout';
import { Renderer } from '../render/Renderer';
import { renderSteps, RESTART, restarts } from '../render/steps';

export interface PlayerOptions {
  doc: AnimationDocument;
  textureURLs: string[];
  // Shown in the corner, such as "Open in smoothstep.io".
  link?: {href: string; text: string};
  // Where a Canvas2D layer's libraries and fonts come from, asked for only if the animation has one.
  layerAssets(): Promise<LayerAssets>;
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

export function startPlayer(container: HTMLElement, {doc, textureURLs, link, layerAssets}: PlayerOptions) {
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
  // Seconds played since the simulation restarted, and the steps drawn.
  let stepClock = 0;
  let steps = RESTART;
  let playing = true;
  let visible = true;
  let last: number | null = null;

  // The animation's Canvas2D layer, once its code has loaded, and whether it has a frame to show.
  const layerDoc = canvasLayer(doc);
  let layer: {host: CanvasLayer; steps: LayerSteps} | null = null;
  let layerFrame = false;
  const configureLayer = () => {
    if (layer && layerDoc && canvas.width > 0 && canvas.height > 0) {
      layer.host.configure({
        code: layerDoc.code, width: canvas.width, height: canvas.height, duration: doc.duration,
        textures: doc.textures.map((t, i) =>
          (t.url === EMPTY_TEXTURE && !t.isUserUploaded) || !textureURLs[i] ? null : textureURLs[i]),
      });
    }
  };
  if (layerDoc) {
    renderer.setLayer(true);
    renderer.layerOverlay = layerDoc.overlay;
    void Promise.all([import('../layer/CanvasLayer'), layerAssets()]).then(([{CanvasLayer}, assets]) => {
      const host = new CanvasLayer(assets, {
        onFrame: bitmap => {
          renderer.setLayerFrame(bitmap);
          layerFrame = true;
        },
        onStatus: errors => errors.forEach(error => console.error("Canvas2D layer: " + error.message)),
      });
      layer = {host, steps: new LayerSteps(renderer, host)};
      configureLayer();
      restart();
    }).catch((error: unknown) => console.error(error));
  }

  const restart = () => {
    time = 0;
    stepClock = 0;
    steps = RESTART;
    renderer.clearTargets();
    layer?.steps.restart();
  };

  // Sharp on high-DPI screens, unless that proves too slow.
  const frames = new SlowFrames();
  let lowRes = false;
  // Dropping to 1× keeps the simulation going; a new size starts it again.
  const resize = (resample = false) => {
    const [width, height] = fitCanvas(container.clientWidth, container.clientHeight, doc.aspectRatio);
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    if (renderer.setSize(...drawingSize(width, height, window.devicePixelRatio, lowRes), resample)) {
      stepClock = 0;
      steps = RESTART;
      configureLayer();
    }
  };
  new ResizeObserver(() => resize()).observe(container);
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
        const elapsed = Math.max(0, (now - last) / 1000);
        time += elapsed;
        stepClock += elapsed;
        if (time > doc.duration) {
          time = 0;
          stepClock = 0;
          steps = RESTART;
          // Also stops a layer stuck on a step, which the wait below would otherwise wait on for good.
          layer?.steps.restart();
        }
      }
      // A layer that has fallen behind is waited for, which slows the animation rather than the page.
      if (!layer?.steps.busy || steps.rendered < 0 || restarts(steps, stepClock)) {
        steps = renderSteps(layer?.steps ?? renderer, steps, stepClock, time, (t, frameIndex) => ({
          time: t, duration: doc.duration, frameIndex, variableValues: variableValues(doc.variables, t),
        }), 4);
      }
      last = now;
      frames.frame(now);
      if (frames.slow && !lowRes) {
        lowRes = true;
        resize(true);
      }
    } else {
      last = null;
      frames.idle();
      if (layerFrame) {
        renderer.refresh();
      }
    }
    layerFrame = false;
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
