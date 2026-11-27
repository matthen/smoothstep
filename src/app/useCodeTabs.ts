import { EditorView } from '@codemirror/view';
import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

import { insertCode } from '../editor/CodeEditor';
import { describe, topLevel } from '../editor/glslDefinitions';
import { analysisOf, selectDefinition, type CodeTab } from '../editor/goToDefinition';
import { shaderName } from '../editor/ShaderTabs';
import { DOC_SECTIONS, onOpenDocs, type DocTarget } from '../lib/docLinks';
import { canvasLayer, SHARED_PLACEHOLDER, type AnimationDocument } from '../lib/document';
import { useLatest } from '../lib/useLatest';
import type { ShaderId } from '../render/Renderer';
import { hasTab } from './documentState';
import { docsClosed, setDocsClosed } from './onboarding';

interface Options {
  // Whether the app opened without an animation, so a new one, which has the Docs tab unless it's been closed.
  isNew: boolean;
  doc: AnimationDocument;
  sharedUntouched: boolean;
  phone: boolean;
  // Shows the code on a phone.
  showCodeOnPhone: () => void;
  typingIn: "code" | "panel" | null;
}

// The code tabs above the editor, each with its own editor, and the Docs tab after them.
export function useCodeTabs({isNew, doc, sharedUntouched, phone, showCodeOnPhone, typingIn}: Options) {
  // The code the editor shows, or showed before the Docs tab.
  const [codeTab, setCodeTab] = useState<ShaderId>("image");
  // Where the Docs tab after the code tabs is, or null without it. A new animation has the tab, with
  // its code showing, until the tab's been closed.
  const [docs, setDocs] = useState<DocTarget | null>(() => isNew && !docsClosed() ? DOC_SECTIONS.index : null);
  const [docsShown, setDocsShown] = useState(false);
  const docsShownRef = useLatest(docsShown);
  // The docs' code and pages load when the tab first shows, and then stay to keep their place.
  const [docsLoaded, setDocsLoaded] = useState(false);
  if (docsLoaded !== (docs !== null && (docsLoaded || docsShown))) {
    setDocsLoaded(!docsLoaded);
  }
  // Shows a code tab, leaving the docs.
  const showCodeTab = useCallback((tab: ShaderId) => {
    setCodeTab(tab);
    setDocsShown(false);
  }, []);

  // Opens the Docs tab, adding it if needed, at a page and heading.
  const openReference = useCallback((target: DocTarget) => {
    setDocs({...target});
    setDocsShown(true);
    if (phone) {
      showCodeOnPhone();
    }
  }, [phone, showCodeOnPhone]);
  useEffect(() => onOpenDocs(openReference), [openReference]);

  // Help → Documentation, which also has new animations open with the Docs tab again.
  const openDocumentation = () => {
    setDocsClosed(false);
    openReference(DOC_SECTIONS.index);
  };

  const closeDocs = () => {
    setDocs(null);
    setDocsShown(false);
    setDocsClosed(true);
  };

  // Each tab's editor, for inserting code from the docs into the code tab open before them.
  const editorViews = useRef(new Map<ShaderId, EditorView>());
  const setView = (tab: ShaderId, view: EditorView | null) => {
    if (view) {
      editorViews.current.set(tab, view);
    } else {
      editorViews.current.delete(tab);
    }
  };

  const insertFromDocs = (code: string) => {
    const view = editorViews.current.get(codeTab);
    if (!view) {
      return;
    }
    // Shown first, so the editor can scroll to the new code.
    flushSync(() => setDocsShown(false));
    insertCode(view, code);
    // Phones would cover the code with the keyboard.
    if (!phone) {
      view.focus();
    }
  };

  // Goes from a name in another shader tab to its definition in the shared code.
  const sharedDefinition = (name: string) => {
    const view = editorViews.current.get("shared");
    const analysis = view && analysisOf(view.state.doc);
    const found = analysis && topLevel(analysis, name);
    if (!view || !found) {
      return null;
    }
    return {
      go: () => {
        flushSync(() => showCodeTab("shared"));
        selectDefinition(view, found);
      },
      description: describe(analysis, found),
    };
  };

  // The code shrinks to the space above the on-screen keyboard, so bring the cursor back into sight.
  useEffect(() => {
    const view = editorViews.current.get(codeTab);
    if (typingIn !== "code" || !view?.hasFocus) {
      return;
    }
    const frame = requestAnimationFrame(() =>
      view.dispatch({effects: EditorView.scrollIntoView(view.state.selection.main.head, {y: "center"})}));
    return () => cancelAnimationFrame(frame);
  }, [typingIn, codeTab]);

  // Each tab has its own editor, hidden unless it's open, so it keeps its undo history and cursor.
  const layer = canvasLayer(doc);
  const codeTabs: {tab: ShaderId; code: string}[] = [
    ...(layer ? [{tab: "canvas" as const, code: layer.code}] : []),
    ...(doc.shared !== undefined
      ? [{tab: "shared" as const, code: sharedUntouched && doc.shared === "" ? SHARED_PLACEHOLDER : doc.shared}] : []),
    ...(doc.buffers ?? []).map((buffer, i) => ({tab: i, code: buffer.code})),
    {tab: "image", code: doc.code},
  ];
  // The shader tabs' editors, for finding and renaming a name's uses across them.
  const glslTabs = (): CodeTab[] => codeTabs.flatMap(({tab}) => {
    const view = tab === "canvas" ? undefined : editorViews.current.get(tab);
    return view ? [{name: shaderName(tab), view, shared: tab === "shared", show: () => flushSync(() => showCodeTab(tab))}] : [];
  });

  // Shows a tab's code with the cursor at the start of a line, from the console.
  const goToLineRef = useLatest((tab: ShaderId, line: number | null) => {
    if (!hasTab(doc, tab)) {
      return;
    }
    flushSync(() => {
      showCodeTab(tab);
      if (phone) {
        showCodeOnPhone();
      }
    });
    const view = editorViews.current.get(tab);
    if (!view) {
      return;
    }
    const at = view.state.doc.line(Math.min(Math.max(1, (line ?? 0) + 1), view.state.doc.lines)).from;
    view.dispatch({selection: {anchor: at}, effects: EditorView.scrollIntoView(at, {y: "center"})});
    if (!phone) {
      view.focus();
    }
  });
  // Stable, so the console's entries don't re-render on every frame the app does.
  const goToLine = useCallback((tab: ShaderId, line: number | null) => goToLineRef.current(tab, line), [goToLineRef]);

  return {
    codeTab, setCodeTab, showCodeTab, docs, docsShown, setDocsShown, docsShownRef, docsLoaded, openReference,
    openDocumentation, closeDocs, editorViews, setView, insertFromDocs, sharedDefinition, codeTabs, glslTabs, goToLine,
  };
}
