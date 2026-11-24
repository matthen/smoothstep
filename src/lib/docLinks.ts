// Links into the docs: they open the code editor's Docs tab at a page and heading, and work as plain
// links to the docs site too.

// A page is a doc's name, like "canvas2d" for docs/canvas2d.md, or "index"; the anchor is a heading's id.
export interface DocTarget {
  page: string;
  anchor?: string;
}

// The places in the docs the app links to. A test checks each one is there.
export const DOC_SECTIONS = {
  index: {page: "index"},
  reference: {page: "reference"},
  shortcuts: {page: "keyboard-shortcuts"},
  acknowledgements: {page: "acknowledgements"},
  shaders: {page: "coding-specification"},
  inputs: {page: "coding-specification", anchor: "input-uniforms"},
  textures: {page: "coding-specification", anchor: "textures"},
  prevFrame: {page: "coding-specification", anchor: "iprevframe-and-iframe"},
  buffers: {page: "coding-specification", anchor: "buffers-and-shared-code"},
  canvas2d: {page: "canvas2d"},
  setupAndDraw: {page: "canvas2d", anchor: "setup-and-draw"},
  canvasUnits: {page: "canvas2d", anchor: "canvas-units"},
  clearing: {page: "canvas2d", anchor: "clearing-and-trails"},
  drawList: {page: "canvas2d", anchor: "drawlist"},
  commands: {page: "canvas2d", anchor: "commands"},
  otherHelpers: {page: "canvas2d", anchor: "other-helpers"},
  iCanvas2D: {page: "canvas2d", anchor: "icanvas2d-and-draw-over-the-image"},
  sharing: {page: "sharing"},
  sharingFile: {page: "sharing", anchor: "an-animation-file"},
} satisfies Record<string, DocTarget>;

const EVENT = "smoothstep:docs";

export function openDocs(target: DocTarget) {
  window.dispatchEvent(new CustomEvent<DocTarget>(EVENT, {detail: target}));
}

export function onOpenDocs(listener: (target: DocTarget) => void): () => void {
  const handler = (event: Event) => listener((event as CustomEvent<DocTarget>).detail);
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}

// Where a link in a code comment goes in the docs: "docs/canvas2d#drawlist", as for docs/canvas2d.md,
// or the same page on the docs site. Null for anything else.
const DOCS_HREF = /^(?:docs\/([\w-]+)|https:\/\/smoothstep\.io\/(?:app\/)?docs\/([\w-]+)\.html)(?:#([\w-]+))?$/;

export function docTargetOf(href: string): DocTarget | null {
  const m = DOCS_HREF.exec(href);
  return m ? {page: (m[1] ?? m[2])!, ...(m[3] ? {anchor: m[3]} : {})} : null;
}

// The page on the docs site this copy of the app comes with.
export function docsSiteHref({page, anchor}: DocTarget = DOC_SECTIONS.index): string {
  return import.meta.env.BASE_URL + "docs/" + page + ".html" + (anchor ? "#" + anchor : "");
}

// A link for popups and errors in the editor, which opens the Docs tab when clicked.
export function docLinkElement(text: string, target: DocTarget): HTMLAnchorElement {
  const a = document.createElement("a");
  a.href = docsSiteHref(target);
  a.target = "_blank";
  a.rel = "noreferrer";
  a.className = "ss-doc-link";
  a.textContent = text;
  a.addEventListener("click", event => {
    event.preventDefault();
    openDocs(target);
  });
  return a;
}
