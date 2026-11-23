// Places in the app that a code comment can link to by naming them in square brackets, like
// "[Help → Tutorial]" or "the [Sliders] tab".
const MENU_PATHS = [
  "File → New", "File → Open", "File → Save", "File → Import", "File → Export",
  "Help → Welcome", "Help → Take the tour", "Help → Tutorial", "Help → Shader inputs",
  "Help → Keyboard shortcuts", "Help → Documentation", "Help → Source code", "Help → Acknowledgements",
] as const;

// The panels under the canvas, and the code tabs. "Animation" is the Timeline tab's old name, and the code
// tabs' names without extensions, "Shared GLSL", "Shared" and "Canvas" are theirs, kept so old comments still link.
const TABS = [
  "Timeline", "Animation", "Sliders", "Textures",
  "Image.glsl", "shared.glsl", "Canvas2D.js", "iBuffer0.glsl", "iBuffer1.glsl", "iBuffer2.glsl", "iBuffer3.glsl",
  "Image", "Shared GLSL", "Shared", "Canvas2D", "Canvas", "iBuffer0", "iBuffer1", "iBuffer2", "iBuffer3",
] as const;

export const APP_LINKS = [...MENU_PATHS, ...TABS] as const;

export type AppLink = typeof APP_LINKS[number];

const EVENT = "smoothstep:link";

export function openAppLink(link: AppLink) {
  window.dispatchEvent(new CustomEvent<AppLink>(EVENT, {detail: link}));
}

export function onAppLink(listener: (link: AppLink) => void): () => void {
  const handler = (event: Event) => listener((event as CustomEvent<AppLink>).detail);
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}
