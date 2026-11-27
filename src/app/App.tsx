import { Loader } from '@mantine/core';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';

import { ConsoleStore } from '../console/consoleStore';
import { TUTORIAL_HREF } from '../lib/config';
import { DEFAULT_TITLE, type AnimationDocument, type Variable } from '../lib/document';
import { onAppLink } from '../lib/appLinks';
import type { Route } from '../lib/routes';
import { useLatest } from '../lib/useLatest';
import type { CanvasHandle } from '../render/Canvas';
import { previewWidthCSS } from './layout/PaneDivider';
import { openingProgress } from '../tutorial/progress';
import AppDialogs, { type Dialog } from './AppDialogs';
import AppHeader from './layout/AppHeader';
import { appLinkActions } from './document/appLinkActions';
import BottomPanel from './layout/BottomPanel';
import { hasTab } from './document/documentState';
import EditorPane from './layout/EditorPane';
import MobileTabs from './layout/MobileTabs';
import PreviewPane from './layout/PreviewPane';
import { openHash, parseHash } from './routing';
import { useBuilds } from './document/useBuilds';
import { useCodeTabs } from './layout/useCodeTabs';
import { useConsoleLog } from '../console/useConsoleLog';
import { useDocument } from './document/useDocument';
import { useExport } from '../export/useExport';
import { useFullView } from './layout/useFullView';
import { useInputs } from '../timeline/useInputs';
import { useLayout, type PanelTab } from './layout/useLayout';
import { useLibrary } from './document/useLibrary';
import { useOnboarding } from './onboarding/useOnboarding';
import { usePlayback } from '../timeline/usePlayback';
import { useProbe } from '../render/useProbe';
import { useStartup } from './document/useStartup';
import { tutorialState, useTutorial } from './onboarding/useTutorial';
import { useUnsavedGuards } from './document/useUnsavedGuards';

// Loaded when the tutorial opens, with its lessons.
const TutorialPanel = lazy(() => import('../tutorial/TutorialPanel'));

export default function App() {
  const initialRoute = useMemo(() => parseHash(window.location.hash), []);
  // Where the tutorial opens, when the URL asks for it.
  const [tutorialStart] = useState(() => initialRoute?.kind === "tutorial" ? openingProgress(initialRoute.lesson) : null);
  const [loading, setLoading] = useState(initialRoute !== null);
  const [alert, setAlert] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(window.location.hash ? null : "splash");
  const closeDialog = useCallback(() => setDialog(null), []);
  const canvasRef = useRef<CanvasHandle>(null);
  // The Console tab's entries, kept outside React's state so code that logs doesn't re-render the app.
  const [appConsole] = useState(() => new ConsoleStore());

  const docState = useDocument(initialRoute);
  const {doc, documentId, sharedFrom, hasUnsavedChanges, dispatch, edit, open: openDocument, openFailed} = docState;
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
  const {showCodeTab} = tabs;
  const exporter = useExport(appConsole, doc, closeDialog);
  const log = useConsoleLog(appConsole, exporter.exporting, consoleShown);
  const playback = usePlayback(doc.duration, doc.variables, log.looped, log.rewound);
  const {clampTime, releaseHolds} = playback;
  const probe = useProbe(tabs.editorViews);
  const {clear: clearProbe} = probe;
  const inputs = useInputs(doc);
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

  // Resets the state other hooks keep for the open animation; the reducer resets its own. It must stay
  // stable, since the startup effect would otherwise run again and reopen the URL's animation over edits.
  const loadDocument = useCallback((json: AnimationDocument, sharedFrom?: Route) => {
    openDocument(json, sharedFrom);
    clearProbe();
    showCodeTab("image");
    releaseHolds();
    resetRows();
  }, [openDocument, clearProbe, showCodeTab, releaseHolds, resetRows]);
  const finishLoading = useCallback(() => {
    setLoading(false);
    offerTour();
  }, [offerTour]);
  useStartup({initialRoute, tutorialStart, loadDocument, openFailed, setAlert, onFinished: finishLoading});

  const library = useLibrary({
    doc, documentId, sharedFrom, hasUnsavedChanges, dispatch, loading, canvasRef, setAlert, showTip,
    setOpenDialog: open => setDialog(open ? "open" : null),
  });
  const {save, download} = library;
  const builds = useBuilds({docState, tabs, probe, log, showTip});

  const onDurationChange = useCallback((duration: number) => {
    edit({duration});
    clampTime(duration);
  }, [edit, clampTime]);

  // A link clicked in a code comment, like "[Help → Tutorial]" or "[Sliders]", opens that menu item or tab.
  const appLinksRef = useLatest(appLinkActions({
    newAnimation: () => openHash("#new", hasUnsavedChanges),
    openTutorial: () => openHash(TUTORIAL_HREF, hasUnsavedChanges),
    showDialog: setDialog,
    save: () => void save(false),
    download: () => void download(),
    takeTour: () => void takeTour(),
    openReference: tabs.openReference,
    openDocumentation: tabs.openDocumentation,
    showPanel,
    showCode: tab => {
      if (tab === "shared" && doc.shared === undefined) {
        showCodeTab(docState.addShared());  // A link to shared.glsl adds it, ready to write in.
      } else if (hasTab(doc, tab)) {
        showCodeTab(tab);
      }
    },
  }));
  useEffect(() => onAppLink(link => appLinksRef.current[link]()), [appLinksRef]);

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
          docState={docState} tabs={tabs} onBuild={builds.build} onSave={() => void save(false)}
          onFixed={builds.queueBuild} onCodeChange={builds.onCodeChange} onShowExpression={builds.showExpression}
          onView={builds.onEditorView}
        />
        <PreviewPane
          workspace={workspaceRef} onWidthChange={setPreviewWidth} onResizing={setResizing}
          fullView={fullView} setFull={setFull} canvasRef={canvasRef}
          docState={docState} playback={playback} inputs={inputs} probe={probe} log={log}
          onLayerStatus={builds.onLayerStatus} onBuilt={builds.onBuilt} onDurationChange={onDurationChange}
        />
      </main>

      <MobileTabs
        tab={mobileTab} onChange={chooseMobileTab} store={appConsole}
        tutorialOpen={tutorialOpen} stepDone={tutorial.tutorialStepDone}
      />

      {tutorialOpen && tutorialStart && !loading &&
        <Suspense fallback={<div className="learnPanel" />}>
          <TutorialPanel
            initial={tutorialStart} state={tutorialState(docState, playback)} onPutCode={tutorial.putTutorialCode}
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

      <AppDialogs
        dialog={dialog} setDialog={setDialog} docState={docState} library={library} exporter={exporter}
        preview={playback} onTour={() => void takeTour()} tourTaken={onboarding.tourTaken} alert={alert} setAlert={setAlert}
      />
    </div>
  );
}
