import { Button, Group, Loader, SegmentedControl } from '@mantine/core';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { EditorView } from '@codemirror/view';
import { TbCircleCheckFilled } from 'react-icons/tb';

import { ConsoleLabel } from '../console/ConsolePanel';
import { ConsoleStore } from '../console/consoleStore';
import DocumentBrowser from '../dialogs/DocumentBrowser';
import ExportSettings from '../dialogs/ExportSettings';
import Import from '../dialogs/Import';
import SaveCopy from '../dialogs/SaveCopy';
import Share from '../dialogs/Share';
import Splash from '../dialogs/Splash';
import type { Range } from '../editor/glslDefinitions';
import { DOC_SECTIONS } from '../lib/docLinks';
import { REPO_URL, TUTORIAL_HREF } from '../lib/config';
import {
  bufferCodes, canvasLayer, DEFAULT_TITLE, tutorialDocument, parseDocument, type AnimationDocument, type Variable,
} from '../lib/document';
import * as localStore from '../lib/localStore';
import { onAppLink, type AppLink } from '../lib/appLinks';
import type { LineError } from '../lib/types';
import { isBrokenShareLink, routeHash, type Route } from '../lib/routes';
import { loadRoute, ShareError } from '../lib/share';
import { useLatest } from '../lib/useLatest';
import type { CanvasHandle } from '../render/Canvas';
import type { CompileResult, ShaderId } from '../render/Renderer';
import { previewWidthCSS } from './PaneDivider';
import { lessonTitle, type TutorialState } from '../tutorial/lessons';
import { openingProgress } from '../tutorial/progress';
import AppHeader from './AppHeader';
import AppModal from './AppModal';
import BottomPanel from './BottomPanel';
import { hasTab } from './documentState';
import EditorPane from './EditorPane';
import PreviewPane from './PreviewPane';
import { openHash, parseHash } from './routing';
import { markTipSeen } from './tips';
import { useCodeTabs } from './useCodeTabs';
import { useConsoleLog } from './useConsoleLog';
import { useDocument } from './useDocument';
import { useExport } from './useExport';
import { useFullView } from './useFullView';
import { useInputs } from './useInputs';
import { useLayout, type MobileTab, type PanelTab } from './useLayout';
import { useLibrary } from './useLibrary';
import { useOnboarding } from './useOnboarding';
import { usePlayback } from './usePlayback';
import { useProbe } from './useProbe';
import { useTutorial } from './useTutorial';
import { useUnsavedGuards } from './useUnsavedGuards';

const STORAGE_BLOCKED = "This browser isn't letting smoothstep.io store data, so animations can't be saved here. " +
  "Private browsing can cause this.";

// Loaded when the tutorial opens, with its lessons.
const TutorialPanel = lazy(() => import('../tutorial/TutorialPanel'));
type Dialog = "open" | "import" | "saveCopy" | "share" | "export" | "splash";

export default function App() {
  const initialRoute = useMemo(() => parseHash(window.location.hash), []);
  // Where the tutorial opens, when the URL asks for it.
  const [tutorialStart] = useState(() => initialRoute?.kind === "tutorial" ? openingProgress(initialRoute.lesson) : null);
  const [loading, setLoading] = useState(initialRoute !== null);
  const [alert, setAlert] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(window.location.hash ? null : "splash");
  const closeDialog = useCallback(() => setDialog(null), []);
  const [imagesVersion, setImagesVersion] = useState(0);
  const canvasRef = useRef<CanvasHandle>(null);
  // The Console tab's entries, kept outside React's state so code that logs doesn't re-render the app.
  const [appConsole] = useState(() => new ConsoleStore());

  const docState = useDocument(initialRoute);
  const {
    doc, documentId, sharedFrom, hasUnsavedChanges, builtCode, builtExtras, buildId, layer, allBuilt, dispatch, edit,
    open: openDocument, openFailed,
  } = docState;
  const docRef = useLatest(doc);
  useUnsavedGuards(hasUnsavedChanges);
  const {
    phone, touch, mobileTab, chooseMobileTab, showCodeOnPhone, panelTab, setPanelTab, showFooter, setShowFooter,
    showPanel, consoleShown, typingIn, previewWidth, setPreviewWidth, resizing, setResizing, workspaceRef,
  } = useLayout(tutorialStart !== null);
  const [fullView, setFull] = useFullView();
  const tabs = useCodeTabs({
    isNew: initialRoute === null, doc, sharedUntouched: docState.sharedUntouched, phone,
    showCodeOnPhone, typingIn,
  });
  const {setCodeTab, showCodeTab, docsShownRef} = tabs;
  const exporter = useExport(appConsole, doc, closeDialog);
  const log = useConsoleLog(appConsole, exporter.exporting, consoleShown);
  const playback = usePlayback(doc.duration, doc.variables, log.looped, log.rewound);
  const {clampTime, releaseHolds} = playback;
  const probe = useProbe(tabs.editorViews);
  const {clear: clearProbe} = probe;
  const inputs = useInputs(doc, imagesVersion);
  const {resetRows} = inputs;
  const tutorial = useTutorial({
    start: tutorialStart, doc, documentId, edit, rename: docState.rename, showCodeTab, phone, mobileTab, chooseMobileTab,
  });
  const {tutorialOpen} = tutorial;
  const onboarding = useOnboarding({
    initialRoute, phone, closeDialog, busy: dialog !== null || alert !== null || tutorialOpen || loading,
    showPane: pane => {
      if (pane !== "code") {
        showPanel(pane);
        return;
      }
      tabs.setDocsShown(false);
      if (phone) {
        chooseMobileTab(pane);
      }
    },
  });
  const {showTip, takeTour, offerTour} = onboarding;

  const loadDocument = useCallback((json: AnimationDocument, sharedFrom?: Route) => {
    openDocument(json, sharedFrom);
    clearProbe();
    showCodeTab("image");
    releaseHolds();
    resetRows();
  }, [openDocument, clearProbe, showCodeTab, releaseHolds, resetRows]);

  // Open the storage, then the animation the URL names.
  useEffect(() => {
    const unsubscribe = localStore.onImagesChanged(() => setImagesVersion(v => v + 1));
    const route = initialRoute;
    void localStore.init().catch((error: unknown) => {
      console.error(error);
      setAlert(STORAGE_BLOCKED);
    }).then(async () => {
      if (!route) {
        if (isBrokenShareLink(window.location.hash)) {
          setAlert("That link is incomplete, so there's no animation to open. Check you copied all of it.");
        }
        return;
      }
      try {
        if (route.kind === "tutorial") {
          // A new animation, so the tutorial never changes a saved one.
          loadDocument({...tutorialDocument(), title: lessonTitle(tutorialStart?.lesson ?? 0)});
        } else if (route.kind === "anim") {
          const record = await localStore.getDocument(route.id);
          if (!record) {
            throw new Error("Not found");
          }
          loadDocument(parseDocument(record.json));
        } else {
          // An example, or an animation shared by link.
          const {doc, images} = await loadRoute(route);
          images.forEach((blob, id) => localStore.addTemporaryImage(id, blob));
          loadDocument(doc, route);
        }
      } catch (error) {
        console.error(error);
        const text = error instanceof ShareError ? error.message : "Could not find that animation in this browser.";
        setAlert(text);
        // Saving now creates a new animation rather than reusing the missing id.
        window.history.replaceState({}, "", "#new");
        openFailed(text);
      } finally {
        setLoading(false);
        offerTour();
      }
    });
    return unsubscribe;
  }, [initialRoute, loadDocument, offerTour, tutorialStart, openFailed]);

  const {libraryVersion, fileInput, save, download, openFiles, importLink} = useLibrary({
    doc, documentId, sharedFrom, hasUnsavedChanges, dispatch, loading, canvasRef, setAlert, showTip,
    setOpenDialog: open => setDialog(open ? "open" : null),
  });

  const build = () => {
    docState.build();
    probe.refresh();
  };
  // A build asked for along with an edit, made once the edit has reached `doc`.
  const [buildQueued, setBuildQueued] = useState(false);
  if (buildQueued) {
    setBuildQueued(false);
    build();
  }

  // Shows an expression selected in a tab on the canvas, building the code first if it's changed.
  const showExpression = (tab: ShaderId, view: EditorView, range: Range | null) => {
    if (range && !allBuilt) {
      build();
    }
    probe.show(tab, view, range);
  };

  const onCodeChange = (tab: ShaderId, code: string, isHelperChange: boolean) => {
    // Picker drags rebuild live, as long as the code was built before the drag.
    const live = isHelperChange && allBuilt;
    docState.editCode(tab, code, live);
    if (isHelperChange) {
      // They've found the pickers, so there's no need for the tip about them.
      markTipSeen("pickers");
    }
    if (live) {
      probe.holdWhileEditing();
    }
  };

  const onEditorView = (tab: ShaderId, view: EditorView | null) => {
    tabs.setView(tab, view);
    if (!view) {
      probe.dropTab(tab);
    }
  };

  const onLayerStatus = (errors: LineError[], layerLoading = false) => {
    dispatch({type: "layerErrors", errors});
    log.logLayerStatus(errors, layerLoading);
    // Show the code with the error, unless the docs are open: its tab shows the error.
    if (errors.length > 0 && docState.errorShader === null && canvasLayer(docRef.current) && !docsShownRef.current) {
      setCodeTab("canvas");
    }
  };

  const onBuilt = (result: CompileResult, ms: number) => {
    log.logBuild(buildId, result, ms);
    docState.built(result);
    if (!result.ok && !docsShownRef.current) {
      setCodeTab(result.shader);  // Show the code with the error.
    }
    if (builtCode !== null) {
      // Every tab's code, so a tip about iPrevFrame shows wherever it's used.
      const code = [builtCode, builtExtras.shared, ...builtExtras.buffers].join("\n");
      showTip({kind: "built", ok: result.ok, code, edited: builtCode !== docState.openedCode});
    }
  };

  const onDurationChange = useCallback((duration: number) => {
    edit({duration});
    clampTime(duration);
  }, [edit, clampTime]);

  // A link clicked in a code comment, like "[Help → Tutorial]" or "[Sliders]", opens that menu item or tab.
  const appLinkRef = useLatest((link: AppLink) => {
    const showCode = (tab: ShaderId) => {
      if (tab === "shared" && doc.shared === undefined) {
        showCodeTab(docState.addShared());  // A link to shared.glsl adds it, ready to write in.
      } else if (hasTab(doc, tab)) {
        showCodeTab(tab);
      }
    };
    const actions: Record<AppLink, () => void> = {
      "File → New": () => openHash("#new", hasUnsavedChanges),
      "File → Open": () => setDialog("open"),
      "File → Save": () => void save(false),
      "File → Import": () => setDialog("import"),
      "File → Export": () => void download(),
      "Help → Welcome": () => setDialog("splash"),
      "Help → Take the tour": () => void takeTour(),
      "Help → Tutorial": () => openHash(TUTORIAL_HREF, hasUnsavedChanges),
      "Help → Shader inputs": () => tabs.openReference(DOC_SECTIONS.reference),
      "Help → Keyboard shortcuts": () => tabs.openReference(DOC_SECTIONS.shortcuts),
      "Help → Documentation": () => tabs.openDocumentation(),
      "Help → Source code": () => window.open(REPO_URL, "_blank", "noopener"),
      "Help → Acknowledgements": () => tabs.openReference(DOC_SECTIONS.acknowledgements),
      "Timeline": () => showPanel("animation"),
      "Animation": () => showPanel("animation"),
      "Sliders": () => showPanel("sliders"),
      "Textures": () => showPanel("textures"),
      "Console": () => showPanel("console"),
      "Image.glsl": () => showCode("image"),
      "Image": () => showCode("image"),
      "shared.glsl": () => showCode("shared"),
      "Shared GLSL": () => showCode("shared"),
      "Shared": () => showCode("shared"),
      "Canvas2D.js": () => showCode("canvas"),
      "Canvas2D": () => showCode("canvas"),
      "Canvas": () => showCode("canvas"),
      "iBuffer0.glsl": () => showCode(0),
      "iBuffer1.glsl": () => showCode(1),
      "iBuffer2.glsl": () => showCode(2),
      "iBuffer3.glsl": () => showCode(3),
      "iBuffer0": () => showCode(0),
      "iBuffer1": () => showCode(1),
      "iBuffer2": () => showCode(2),
      "iBuffer3": () => showCode(3),
    };
    actions[link]();
  });
  useEffect(() => onAppLink(link => appLinkRef.current(link)), [appLinkRef]);

  const tutorialState: TutorialState = {
    code: doc.code, builtCode: builtCode ?? "",
    shared: doc.shared ?? "", buffers: bufferCodes(doc), builtShared: builtExtras.shared, builtBuffers: builtExtras.buffers,
    canvas: layer?.code ?? null, builtCanvas: builtExtras.canvas, canvasOverlay: layer?.overlay ?? true,
    built: docState.buildState === "built" && docState.compiled?.ok === true && docState.compiled.code === builtCode,
    isPlaying: playback.isPlaying, time: playback.time, variables: doc.variables, textures: doc.textures, duration: doc.duration,
    aspectRatio: doc.aspectRatio,
  };

  // An example or shared animation, not yet saved: saving it makes a copy in the browser's animations.
  const copyOf = sharedFrom !== null && documentId === null ? sharedFrom.kind === "example" ? "example" : "shared" : null;
  // The tutorial's Learn panel keeps its own narrower preset.
  const customWidth = tutorialOpen ? null : previewWidth;

  return (
    <div
      className="app" data-footer={showFooter ? "open" : "closed"}
      data-full-view={fullView || undefined}
      data-mobile-tab={mobileTab} data-tutorial={tutorialOpen || undefined}
      data-side-panel={tutorialOpen || undefined}
      data-keyboard={typingIn ?? undefined}
    >
      <AppHeader
        phone={phone} touch={touch}
        titleInput={docState.titleInput} isDefaultTitle={doc.title === DEFAULT_TITLE}
        onTitleChange={title => dispatch({type: "typeTitle", title})} onTitleCommit={docState.commitTitle}
        copyOf={copyOf} hasUnsavedChanges={hasUnsavedChanges} saved={documentId !== null}
        onOpen={() => setDialog("open")} onSave={() => void save(false)} onSaveCopy={() => setDialog("saveCopy")}
        onImport={() => setDialog("import")} onDownload={() => void download()}
        onDocumentation={tabs.openDocumentation} onReference={tabs.openReference}
        onTour={() => void takeTour()} onWelcome={() => setDialog("splash")} onShare={() => setDialog("share")}
        onRender={() => {exporter.setExportError(null); setDialog("export");}}
      />

      <main
        className="workspace" ref={workspaceRef} data-resizing={resizing || undefined}
        style={customWidth === null ? undefined : {"--preview-width": previewWidthCSS(customWidth)} as CSSProperties}
      >
        <EditorPane
          docState={docState} tabs={tabs} onBuild={build} onSave={() => void save(false)}
          onFixed={() => setBuildQueued(true)} onCodeChange={onCodeChange} onShowExpression={showExpression}
          onView={onEditorView}
        />
        <PreviewPane
          workspace={workspaceRef} onWidthChange={setPreviewWidth} onResizing={setResizing}
          fullView={fullView} setFull={setFull} canvasRef={canvasRef}
          docState={docState} playback={playback} inputs={inputs} probe={probe} log={log}
          onLayerStatus={onLayerStatus} onBuilt={onBuilt} onDurationChange={onDurationChange}
        />
      </main>

      <nav className="mobileTabs" data-crowded={tutorialOpen || undefined}>
        <SegmentedControl
          fullWidth size="sm" withItemsBorders={false} value={mobileTab} onChange={value => chooseMobileTab(value as MobileTab)}
          data={[
            {value: "code", label: "Code"}, {value: "animation", label: "Timeline"}, {value: "sliders", label: "Sliders"},
            {value: "textures", label: "Textures"},
            {value: "console", label: <ConsoleLabel store={appConsole} />},
            ...(tutorialOpen ? [{
              value: "learn",
              label: tutorial.tutorialStepDone && mobileTab !== "learn"
                ? <span className="learnTabLabel">Learn<TbCircleCheckFilled aria-label="step done" /></span>
                : "Learn",
            }] : []),
          ]}
        />
      </nav>

      {tutorialOpen && tutorialStart && !loading &&
        <Suspense fallback={<div className="learnPanel" />}>
          <TutorialPanel
            initial={tutorialStart} state={tutorialState} onPutCode={tutorial.putTutorialCode}
            onLessonChange={tutorial.changeTutorialLesson} onClose={tutorial.closeTutorial}
            onStepDoneChange={tutorial.setTutorialStepDone}
          />
        </Suspense>}

      <BottomPanel
        tab={panelTab}
        onTabChange={(tab: PanelTab) => {
          setPanelTab(tab);
          setShowFooter(true);
        }}
        onToggle={() => setShowFooter(s => !s)}
        phone={phone} doc={doc} edit={edit}
        onTimelineChange={(variables: Variable[]) => {
          showTip({kind: "variablesChanged", before: doc.variables, after: variables});
          edit({variables});
        }}
        onDurationChange={onDurationChange} playback={playback} inputs={inputs} onMessage={setAlert}
        store={appConsole} consoleShown={consoleShown} onGoToLine={tabs.goToLine}
      />

      {loading && <div id="loading"><Loader size="sm" /></div>}

      <DocumentBrowser
        show={dialog === "open"} onHide={closeDialog} currentId={documentId}
        onDeleted={id => {
          if (id === documentId) {
            // Keep what's in the editor, as an unsaved new animation.
            window.history.replaceState({}, "", "#new");
            dispatch({type: "deleted"});
          }
        }}
        onMessage={setAlert}
        onImport={() => setDialog("import")}
        version={libraryVersion}
      />
      <input
        type="file" accept=".json,.zip,application/json,application/zip" multiple
        ref={fileInput} style={{display: "none"}} data-testid="importInput"
        onChange={event => void openFiles(event.target.files)}
      />
      <Import
        show={dialog === "import"} onHide={closeDialog}
        onChooseFiles={() => {setDialog(null); fileInput.current?.click();}}
        onImportLink={importLink}
      />
      <Share
        show={dialog === "share"} doc={doc} onHide={closeDialog} onMessage={setAlert}
        onDownload={() => void download()}
        source={sharedFrom && documentId === null && !hasUnsavedChanges ? routeHash(sharedFrom) : null}
      />
      <SaveCopy
        show={dialog === "saveCopy"} title={doc.title} onHide={closeDialog}
        onSave={title => {setDialog(null); void save(true, title);}}
      />
      <ExportSettings
        show={dialog === "export"} duration={doc.duration} aspectRatio={doc.aspectRatio}
        options={exporter.exportOptions} onOptionsChange={exporter.setExportOptions}
        onExport={() => void exporter.startExport()} onCancel={exporter.cancelExport}
        progress={exporter.exportProgress} error={exporter.exportError}
      />
      <Splash
        show={dialog === "splash"} onHide={closeDialog}
        onTour={() => void takeTour()} tourTaken={onboarding.tourTaken}
      />
      <AppModal opened={alert !== null} onClose={() => setAlert(null)} withCloseButton={false} zIndex={400}>
        <p className="alertText">{alert}</p>
        <Group justify="flex-end"><Button onClick={() => setAlert(null)}>Ok</Button></Group>
      </AppModal>
    </div>
  );
}
