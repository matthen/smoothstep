// Menu items that text such as a code comment can name, like "Help → Tutorial", to open them.
export const MENU_PATHS = [
  "File → New", "File → Open", "File → Open from link", "File → Save", "File → Download animation file",
  "Help → Welcome", "Help → Take the tour", "Help → Tutorial", "Help → Shader inputs",
  "Help → Keyboard shortcuts", "Help → Documentation", "Help → Source code", "Help → Acknowledgements",
] as const;

export type MenuPath = typeof MENU_PATHS[number];

const EVENT = "smoothstep:menu";

export function openMenuItem(path: MenuPath) {
  window.dispatchEvent(new CustomEvent<MenuPath>(EVENT, {detail: path}));
}

export function onMenuItem(listener: (path: MenuPath) => void): () => void {
  const handler = (event: Event) => listener((event as CustomEvent<MenuPath>).detail);
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}
