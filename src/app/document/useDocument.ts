// The open animation, its edits and builds, and how its last build went.
import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';

import {
  canvasLayer, DEFAULT_TITLE, MAX_TITLE_LENGTH, NEW_CANVAS_CODE, newBufferCode, sameExtras, shaderExtras,
  SHARED_PLACEHOLDER, type AnimationDocument,
} from '../../lib/document';
import type { Route } from '../../lib/routes';
import type { LineError } from '../../lib/types';
import type { Shaders } from '../../render/Canvas';
import type { CompileResult, ShaderId } from '../../render/Renderer';
import { shaderName } from '../../editor/ShaderTabs';
import { setCrashDocument } from '../crashState';
import { documentReducer, initialDocumentState } from './documentState';

export function windowTitle(title: string) {
  document.title = title === DEFAULT_TITLE ? "smoothstep.io" : title + " - smoothstep.io";
}

export function useDocument(initialRoute: Route | null) {
  const [state, dispatch] = useReducer(documentReducer, initialRoute, initialDocumentState);
  const {doc, builtCode, builtExtras, titleInput} = state;
  const [lineErrors, setLineErrors] = useState<LineError[]>([]);
  // The shader whose code didn't build.
  const [errorShader, setErrorShader] = useState<ShaderId | null>(null);
  // The code the canvas last compiled, and whether it compiled.
  const [compiled, setCompiled] = useState<{code: string; ok: boolean} | null>(null);

  const loading = state.status === "loading";
  const shaders = useMemo<Shaders | null>(
    () => loading ? null : {code: builtCode, ...builtExtras}, [loading, builtCode, builtExtras]);
  const allBuilt = !loading && builtCode === doc.code && sameExtras(builtExtras, shaderExtras(doc));
  const layer = canvasLayer(doc);
  const buildState = lineErrors.length > 0 || state.layerErrors.length > 0 ? "error" : allBuilt ? "built" : "changed";

  useEffect(() => setCrashDocument(loading ? null : {id: state.documentId, json: doc}), [loading, state.documentId, doc]);

  const open = useCallback((json: AnimationDocument, sharedFrom?: Route) => {
    dispatch({type: "open", doc: json, sharedFrom});
    windowTitle(json.title);
  }, []);
  const openFailed = useCallback((text: string) => dispatch({type: "openFailed", text}), []);
  const edit = useCallback((change: Partial<AnimationDocument> | ((d: AnimationDocument) => AnimationDocument)) =>
    dispatch({type: "edit", change}), []);
  const editCode = (tab: ShaderId, code: string) => dispatch({type: "editCode", tab, code});
  const build = () => dispatch({type: "build"});

  const commitTitle = () => {
    const title = (titleInput || DEFAULT_TITLE).slice(0, MAX_TITLE_LENGTH);
    dispatch({type: "commitTitle", title});
    windowTitle(title);
  };
  const rename = (title: string) => {
    dispatch({type: "rename", title});
    windowTitle(title);
  };

  const clearErrorIn = (tab: ShaderId) => {
    if (errorShader === tab) {
      // Its error went with it, and mustn't show on a tab added in its place.
      setLineErrors([]);
      setErrorShader(null);
    }
  };

  // Each returns the tab to show; a removal returns null if the user keeps the tab.
  const addBuffer = (): ShaderId => {
    const buffers = doc.buffers ?? [];
    edit({buffers: [...buffers, {code: newBufferCode(buffers.length)}]});
    return buffers.length;
  };
  const removeLastBuffer = (): ShaderId | null => {
    const buffers = doc.buffers ?? [];
    const last = buffers.length - 1;
    if (buffers[last]!.code !== newBufferCode(last) &&
        !window.confirm(`Remove ${shaderName(last)} and its code?`)) {
      return null;
    }
    const rest = buffers.slice(0, last);
    edit(d => {
      const next: AnimationDocument = {...d, buffers: rest};
      if (rest.length === 0) {
        delete next.buffers;  // Saved as an animation without buffers, as before it had any.
      }
      return next;
    });
    clearErrorIn(last);
    return last > 0 ? last - 1 : "image";
  };
  const addCanvasLayer = (): ShaderId => {
    dispatch({type: "addCanvas"});
    return "canvas";
  };
  const removeCanvasLayer = (): ShaderId | null => {
    if (layer && layer.code !== NEW_CANVAS_CODE && !window.confirm(`Remove ${shaderName("canvas")} and its code?`)) {
      return null;
    }
    dispatch({type: "removeCanvas"});
    return "image";
  };
  const addShared = (): ShaderId => {
    dispatch({type: "addShared"});
    return "shared";
  };
  const removeShared = (): ShaderId | null => {
    const shared = doc.shared?.trim() ?? "";
    if (shared && shared !== SHARED_PLACEHOLDER.trim() && !window.confirm(`Remove ${shaderName("shared")} and its code?`)) {
      return null;
    }
    dispatch({type: "removeShared"});
    clearErrorIn("shared");
    return "image";
  };

  // How the canvas's last build went.
  const built = (result: CompileResult) => {
    setLineErrors(result.ok ? [] : result.errors);
    setErrorShader(result.ok ? null : result.shader);
    setCompiled({code: builtCode, ok: result.ok});
  };

  return {
    ...state, loading, dispatch, lineErrors, errorShader, compiled, shaders, allBuilt, layer, buildState,
    open, openFailed, edit, editCode, build, commitTitle, rename, built,
    addBuffer, removeLastBuffer, addCanvasLayer, removeCanvasLayer, addShared, removeShared,
  };
}
