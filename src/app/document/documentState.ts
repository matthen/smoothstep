import {
  canvasLayer, NEW_CANVAS_CODE, newDocument, sameExtras, shaderExtras, withCanvasLayer, type AnimationDocument,
  type ShaderExtras,
} from '../../lib/document';
import type { Route } from '../../lib/routes';
import type { LineError } from '../../lib/types';
import type { ShaderId } from '../../render/Renderer';

// The open animation, its code as last built, and what the editor shows about it: the parts that all
// start afresh when an animation opens.
export interface DocumentState {
  // Whether the animation the URL names is still loading, opened, or couldn't be opened. While it
  // loads, `doc` is a placeholder that mustn't be shown, saved or downloaded.
  status: "loading" | "ready" | "failed";
  doc: AnimationDocument;
  // Its id in this browser's animations, or null if it isn't one of them.
  documentId: string | null;
  // The link the animation opened from, which can be shared again while it's unchanged.
  sharedFrom: Route | null;
  hasUnsavedChanges: boolean;
  titleInput: string;
  // The image's code and the other tabs' code, as last built.
  builtCode: string;
  builtExtras: ShaderExtras;
  buildId: number;
  // The code as it was opened, so building it unchanged doesn't count as editing.
  openedCode: string;
  // The Canvas2D layer's errors, which come from running its code, so they can arrive at any time.
  layerErrors: LineError[];
  // The Canvas2D.js or shared.glsl tab, if it was just added here, so its editor takes focus when it appears.
  justAdded: "canvas" | "shared" | null;
  // Whether the shared.glsl tab is new and still shows its placeholder.
  sharedUntouched: boolean;
}

export type DocumentAction =
  | {type: "open"; doc: AnimationDocument; sharedFrom?: Route}
  | {type: "openFailed"; text: string}
  // Setting the shared code, even to what it was, makes the shared.glsl tab no longer untouched.
  | {type: "edit"; change: Partial<AnimationDocument> | ((doc: AnimationDocument) => AnimationDocument)}
  | {type: "editCode"; tab: ShaderId; code: string}
  | {type: "build"}
  // Builds the code as it is now without a new build id, as a picker's drag does; nothing if it's built.
  | {type: "buildLive"}
  | {type: "addCanvas"}
  | {type: "removeCanvas"}
  | {type: "addShared"}
  | {type: "removeShared"}
  | {type: "typeTitle"; title: string}
  | {type: "commitTitle"; title: string}
  // A new title that isn't an edit, like a tutorial lesson's.
  | {type: "rename"; title: string}
  // The document about to be saved, when saving gives it a new title.
  | {type: "replace"; doc: AnimationDocument}
  | {type: "saved"; id: string; doc: AnimationDocument}
  // The animation was deleted from the browser's animations, leaving it open as a new one.
  | {type: "deleted"}
  | {type: "layerErrors"; errors: LineError[]};

export function initialDocumentState(route: Route | null): DocumentState {
  const doc = newDocument();
  return {
    status: route ? "loading" : "ready",
    doc, documentId: route?.kind === "anim" ? route.id : null, sharedFrom: null, hasUnsavedChanges: false,
    titleInput: doc.title, builtCode: doc.code, builtExtras: shaderExtras(doc), buildId: 0,
    openedCode: doc.code, layerErrors: [], justAdded: null, sharedUntouched: false,
  };
}

// Emptied shared code stays as "", so the editor doesn't jump back to the placeholder; opening the
// animation again drops it.
function withTabCode(doc: AnimationDocument, tab: ShaderId, code: string): AnimationDocument {
  return tab === "image" ? {...doc, code} : tab === "shared" ? {...doc, shared: code} :
    tab === "canvas" ? {...doc, layers: (doc.layers ?? []).map(layer => ({...layer, code}))} :
    {...doc, buffers: (doc.buffers ?? []).map((buffer, i) => i === tab ? {code} : buffer)};
}

export function tabCode(doc: AnimationDocument, tab: ShaderId): string | undefined {
  return tab === "image" ? doc.code : tab === "shared" ? doc.shared : tab === "canvas" ? canvasLayer(doc)?.code :
    doc.buffers?.[tab]?.code;
}

// Whether the animation has a code tab.
export function hasTab(doc: AnimationDocument, tab: ShaderId): boolean {
  return tab === "image" || (tab === "shared" ? doc.shared !== undefined :
    tab === "canvas" ? canvasLayer(doc) !== undefined : tab < (doc.buffers?.length ?? 0));
}

export function documentReducer(s: DocumentState, action: DocumentAction): DocumentState {
  switch (action.type) {
    case "open": {
      const {doc} = action;
      return {
        ...s, status: "ready", doc, sharedFrom: action.sharedFrom ?? null, hasUnsavedChanges: false, titleInput: doc.title,
        builtCode: doc.code, builtExtras: shaderExtras(doc), buildId: s.buildId + 1, openedCode: doc.code,
        layerErrors: [], justAdded: null, sharedUntouched: false,
      };
    }
    case "openFailed":
      return {
        ...s, status: "failed", documentId: null, doc: {...s.doc, code: "// " + action.text}, builtCode: "// " + action.text,
        builtExtras: {buffers: [], shared: "", canvas: null},
      };
    case "edit": {
      const {change} = action;
      return typeof change === "function" ? {...s, doc: change(s.doc), hasUnsavedChanges: true} : {
        ...s, doc: {...s.doc, ...change}, hasUnsavedChanges: true,
        sharedUntouched: s.sharedUntouched && !("shared" in change),
      };
    }
    case "editCode": {
      const doc = withTabCode(s.doc, action.tab, action.code);
      return {...s, doc, hasUnsavedChanges: true, sharedUntouched: s.sharedUntouched && action.tab !== "shared"};
    }
    case "build":
      return {...s, builtCode: s.doc.code, builtExtras: shaderExtras(s.doc), buildId: s.buildId + 1};
    case "buildLive": {
      const extras = shaderExtras(s.doc);
      return s.builtCode === s.doc.code && sameExtras(s.builtExtras, extras) ? s :
        {...s, builtCode: s.doc.code, builtExtras: extras};
    }
    case "addCanvas":
      return {
        ...s, doc: withCanvasLayer(s.doc, {kind: "canvas2d", code: NEW_CANVAS_CODE, overlay: true}),
        hasUnsavedChanges: true, justAdded: "canvas",
      };
    case "removeCanvas":
      return {...s, doc: withCanvasLayer(s.doc, null), justAdded: null, hasUnsavedChanges: true};
    // A new shared.glsl tab shows a placeholder, which only becomes code once it's edited, so an untouched
    // tab isn't saved and needs no build.
    case "addShared":
      return {...s, doc: {...s.doc, shared: ""}, sharedUntouched: true, justAdded: "shared"};
    case "removeShared": {
      const doc = {...s.doc};
      delete doc.shared;
      return {...s, doc, sharedUntouched: false, justAdded: null, hasUnsavedChanges: true};
    }
    case "typeTitle":
      return {...s, titleInput: action.title, hasUnsavedChanges: true};
    case "commitTitle":
      return action.title === s.doc.title ? {...s, titleInput: action.title} :
        {...s, titleInput: action.title, doc: {...s.doc, title: action.title}, hasUnsavedChanges: true};
    case "rename":
      return {...s, doc: {...s.doc, title: action.title}, titleInput: action.title};
    case "replace":
      return {...s, doc: action.doc, titleInput: action.doc.title};
    // Now one of the user's own animations, even if it's deleted later. Edits made while saving are still unsaved.
    case "saved":
      return {...s, documentId: action.id, sharedFrom: null, hasUnsavedChanges: s.doc !== action.doc};
    case "deleted":
      return {...s, documentId: null, hasUnsavedChanges: true};
    case "layerErrors":
      return {...s, layerErrors: action.errors};
  }
}
