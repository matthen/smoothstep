import {
  ActionIcon, Badge, Button, Group, Kbd, Loader, Menu, SegmentedControl, Switch, Tabs, Text, TextInput, Tooltip,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, MouseEvent as ReactMouseEvent } from 'react';
import { flushSync } from 'react-dom';
import {
  TbBook, TbBrandGithub, TbChevronDown, TbCopy, TbDeviceDesktopDown, TbDeviceFloppy, TbDownload, TbFile, TbFileImport,
  TbFolderOpen, TbHammer, TbCircleCheckFilled, TbCode, TbHelp, TbHistory, TbHome, TbKeyboard, TbMaximize, TbMinimize, TbRoute, TbSchool,
  TbShare, TbVideo,
} from 'react-icons/tb';

import DocumentBrowser from '../dialogs/DocumentBrowser';
import ExportSettings from '../dialogs/ExportSettings';
import type { ExportOptions, ExportProgress } from '../dialogs/exportTypes';
import Import from '../dialogs/Import';
import SaveCopy from '../dialogs/SaveCopy';
import Share from '../dialogs/Share';
import Splash from '../dialogs/Splash';
import Textures from '../dialogs/Textures';
import CodeEditor, { insertCode } from '../editor/CodeEditor';
import { EditorView } from '@codemirror/view';
import { DOC_SECTIONS, onOpenDocs, type DocTarget } from '../lib/docLinks';
import ShaderTabs, { shaderCaption, shaderName, starterFunction } from '../editor/ShaderTabs';
import * as archive from '../lib/archive';
import { asset, documentHref, REPO_URL, textureURL, TUTORIAL_HREF } from '../lib/config';
import {
  bufferCodes, canvasLayer, DEFAULT_TITLE, EMPTY_TEXTURE, MAX_TITLE_LENGTH, NEW_CANVAS_CODE, newBufferCode, newDocument,
  parseDocument, sameExtras, shaderExtras, SHARED_PLACEHOLDER, variableValues, withCanvasLayer, type ShaderExtras,
  type AnimationDocument, type AspectRatio, type TextureSlot, type Variable,
} from '../lib/document';
import * as localStore from '../lib/localStore';
import { onAppLink, type AppLink } from '../lib/appLinks';
import { isBrokenShareLink, routeHash, type Route } from '../lib/routes';
import { loadRoute, ShareError } from '../lib/share';
import type { LineError } from '../lib/types';
import { useLatest } from '../lib/useLatest';
import AspectRatioPicker from '../dialogs/AspectRatioPicker';
import Canvas, { type CanvasHandle, type CanvasLayout, type Shaders } from '../render/Canvas';
import type { CompileResult, ShaderId } from '../render/Renderer';
import { floatNames } from '../timeline/names';
import PaneDivider, { previewWidthCSS, storedPreviewWidth, storePreviewWidth } from './PaneDivider';
import PlayerControls, { PLAYER_ONE_ROW_WIDTH, PLAYER_SECOND_ROW_WIDTH } from '../timeline/PlayerControls';
import Sliders, { floatsInCode, inputsInCode } from '../timeline/Sliders';
import Timeline from '../timeline/Timeline';
import { lessonTitle, type TabCode, type TutorialState } from '../tutorial/lessons';
import { openingProgress } from '../tutorial/progress';
import AppModal, { anyModalOpen } from './AppModal';
import { setCrashDocument } from './crashState';
import { docsClosed, setDocsClosed, setTourState, tourState } from './onboarding';
import { MOD_KEY } from './platform';
import { chooseTip, markTipSeen, seenTips, tipContent, tipsFor, turnOffTips, type TipEvent } from './tips';
import { confirmLeaving, hasConfirmedLeaving, openHash, parseHash, useHashLinks } from './routing';
import { install, onLaunchFiles, useCanInstall } from '../pwa/install';
import { appUpdates } from '../pwa/updates';
import { useKeyboardInset } from './useKeyboardInset';
import { usePhone, useTouch } from './usePhone';

const STORAGE_BLOCKED = "This browser isn't letting smoothstep.io store data, so animations can't be saved here. " +
  "Private browsing can cause this.";

function windowTitle(title: string) {
  document.title = title === DEFAULT_TITLE ? "smoothstep.io" : title + " - smoothstep.io";
}

// Which pane fills the screen below the canvas on a phone.
type MobileTab = "code" | "animation" | "sliders" | "textures" | "learn";
type PanelTab = "animation" | "sliders" | "textures";

// Loaded when the tutorial opens, with its lessons.
const TutorialPanel = lazy(() => import('../tutorial/TutorialPanel'));
// Loaded when the Docs tab is first shown, with the pages.
const ReferencePanel = lazy(() => import('../reference/ReferencePanel'));
type Dialog = "open" | "import" | "saveCopy" | "share" | "export" | "splash";

// Text with `code` in backticks.
function withCode(text: string) {
  return text.split("`").map((part, i) => i % 2 ? <code key={i}>{part}</code> : part);
}

function showMessage(text: string, loading = false) {
  const options = {id: "status", message: text, loading, autoClose: loading ? false : 1500, withCloseButton: !loading};
  // Each is a no-op when the other applies: update needs an existing id, show skips one.
  notifications.update(options);
  notifications.show(options);
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof localStore.StorageFullError ? error.message + " Delete some animations or uploads, " +
    "or use Export all in the Open dialog and clear space." : fallback;
}

export default function App() {
  const initialRoute = useMemo(() => parseHash(window.location.hash), []);
  // Where the tutorial opens, when the URL asks for it.
  const [tutorialStart] = useState(() => initialRoute?.kind === "tutorial" ? openingProgress(initialRoute.lesson) : null);
  const [tutorialOpen, setTutorialOpen] = useState(tutorialStart !== null);
  const [tutorialStepDone, setTutorialStepDone] = useState(false);
  const [doc, setDoc] = useState<AnimationDocument>(newDocument);
  const [documentId, setDocumentId] = useState<string | null>(initialRoute?.kind === "anim" ? initialRoute.id : null);
  const [loading, setLoading] = useState(initialRoute !== null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const canInstall = useCanInstall();
  const [titleInput, setTitleInput] = useState(doc.title);
  const [builtCode, setBuiltCode] = useState<string | null>(initialRoute ? null : doc.code);
  // The buffers' code and the shared code, as last built.
  const [builtExtras, setBuiltExtras] = useState<ShaderExtras>(() => shaderExtras(doc));
  const [buildId, setBuildId] = useState(0);
  const [lineErrors, setLineErrors] = useState<LineError[]>([]);
  // The code the editor shows, or showed before the Docs tab, and the one whose code didn't build.
  const [codeTab, setCodeTab] = useState<ShaderId>("image");
  const [errorShader, setErrorShader] = useState<ShaderId | null>(null);
  // The Canvas2D layer's errors, which come from running its code, so they can arrive at any time.
  const [layerErrors, setLayerErrors] = useState<LineError[]>([]);
  // The Canvas2D.js or shared.glsl tab, if it was just added here, so its editor takes focus when it appears.
  const [justAdded, setJustAdded] = useState<"canvas" | "shared" | null>(null);
  // Whether the shared.glsl tab is new and still shows its placeholder.
  const [sharedUntouched, setSharedUntouched] = useState(false);
  const shaders = useMemo<Shaders | null>(
    () => builtCode === null ? null : {code: builtCode, ...builtExtras}, [builtCode, builtExtras]);
  const allBuilt = builtCode === doc.code && sameExtras(builtExtras, shaderExtras(doc));
  // The code the canvas last compiled, and whether it compiled.
  const [compiled, setCompiled] = useState<{code: string; ok: boolean} | null>(null);
  const [time, setTime] = useState(0);
  // Seconds played since the simulation last restarted, which set how many steps it has taken.
  const [stepClock, setStepClock] = useState(0);
  const restartFrames = useCallback(() => setStepClock(0), []);
  const [isPlaying, setIsPlaying] = useState(false);
  const [scrubbing, setScrubbing] = useState(false);
  const [imagesVersion, setImagesVersion] = useState(0);
  const [layout, setLayout] = useState<CanvasLayout>({width: 0, height: 0, top: 0, containerWidth: 0});
  const [showFooter, setShowFooter] = useState(true);
  // The canvas side's width set with the divider, or null for a preset.
  const [previewWidth, setPreviewWidth] = useState<number | null>(storedPreviewWidth);
  // Where the Docs tab after the code tabs is, or null without it. A new animation has the tab, with
  // its code showing, until the tab's been closed.
  const [docs, setDocs] = useState<DocTarget | null>(
    () => initialRoute === null && !docsClosed() ? DOC_SECTIONS.index : null);
  const [docsShown, setDocsShown] = useState(false);
  const docsShownRef = useLatest(docsShown);
  // The docs' code and pages load when the tab first shows, and then stay to keep their place.
  const [docsLoaded, setDocsLoaded] = useState(false);
  if (docsLoaded !== (docs !== null && (docsLoaded || docsShown))) {
    setDocsLoaded(!docsLoaded);
  }
  // Shows a code tab, leaving the docs.
  const showCodeTab = (tab: ShaderId) => {
    setCodeTab(tab);
    setDocsShown(false);
  };
  const customWidth = tutorialOpen ? null : previewWidth;
  const [resizing, setResizing] = useState(false);
  const workspaceRef = useRef<HTMLElement>(null);
  useEffect(() => storePreviewWidth(previewWidth), [previewWidth]);
  // The canvas and its play bar filling the screen. The browser's own full screen hides its bars
  // too where it's allowed; iPhones only allow it for videos, so there the page alone fills it.
  const [fullView, setFullView] = useState(false);
  const pressedBackground = useRef(false);
  const isBackground = (event: ReactMouseEvent) =>
    event.target === event.currentTarget || (event.target as HTMLElement).id === "canvasContainer";
  const setFull = (on: boolean) => {
    setFullView(on);
    if (on) {
      if (document.fullscreenEnabled) {
        void document.documentElement.requestFullscreen().catch(() => {});
      }
    } else if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {});
    }
  };
  useEffect(() => {
    if (!fullView) {
      return;
    }
    // Esc leaves the browser's full screen by itself; this covers the page-only one, unless Esc is
    // closing a dialog over it.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !anyModalOpen()) {
        setFull(false);
      }
    };
    const onFullscreenChange = () => {
      if (!document.fullscreenElement) {
        setFullView(false);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
    };
  }, [fullView]);
  const phone = usePhone();
  const touch = useTouch();
  const short = useMediaQuery("(max-height: 520px)");
  const tabletKeyboard = useKeyboardInset() && touch && !phone && !short;
  // On a tablet, the code or the bottom panel, whichever the on-screen keyboard is typing in, takes
  // the room above it.
  const [typingIn, setTypingIn] = useState<"code" | "panel" | null>(null);
  useEffect(() => {
    const update = () => {
      const focused = document.activeElement;
      setTypingIn(!tabletKeyboard ? null : focused?.closest(".editorPane") ? "code" :
        focused?.closest(".bottomPanel") ? "panel" : null);
    };
    update();
    document.addEventListener("focusin", update);
    return () => document.removeEventListener("focusin", update);
  }, [tabletKeyboard]);
  const [mobileTab, setMobileTab] = useState<MobileTab>(tutorialStart && phone ? "learn" : "code");
  const [panelTab, setPanelTab] = useState<PanelTab>("animation");
  const [tourTaken, setTourTaken] = useState(() => tourState() === "taken");
  const [alert, setAlert] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(window.location.hash ? null : "splash");
  const [exportOptions, setExportOptions] = useState<ExportOptions>({width: 512, fps: 30, type: "webm"});
  const [exportProgress, setExportProgress] = useState<ExportProgress | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const exportAbort = useRef<AbortController | null>(null);
  const canvasRef = useRef<CanvasHandle>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  // Latest values for callbacks that shouldn't change identity every frame.
  const timeRef = useLatest(time);
  const docRef = useLatest(doc);
  const saving = useRef(false);
  // What a one-time tip waits for: the tour, its offer, or another tip to finish.
  const tourRunning = useRef(false);
  const tourOfferShowing = useRef(false);
  const tipShowing = useRef(false);
  // The code as it was opened, so building it unchanged doesn't count as editing.
  const openedCode = useRef(doc.code);

  // The link the animation opened from, which can be shared again while it's unchanged.
  const [sharedFrom, setSharedFrom] = useState<Route | null>(null);
  // Bumped when files are added to the browser's animations, so the Open dialog lists them.
  const [libraryVersion, setLibraryVersion] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);
  // An example or shared animation, not yet saved: saving it makes a copy in the browser's animations.
  const copySource = sharedFrom !== null && documentId === null;

  // Animated values held by their sliders, by row, until the animation plays or the playhead moves.
  const [held, setHeld] = useState<ReadonlyMap<number, number>>(new Map());
  // A hold only counts while the row is animated, so deleting its last transition lets it go.
  const heldRows = useMemo(() => new Map([...held].filter(([i]) => doc.variables[i]!.transitions.length > 0)),
    [held, doc.variables]);
  const values = useMemo(() => variableValues(doc.variables, time).map((v, i) => heldRows.get(i) ?? v),
    [doc.variables, time, heldRows]);
  const hold = (row: number, value: number) => setHeld(h => new Map(h).set(row, value));
  // Playing hands every held value back to the timeline.
  const [wasPlaying, setWasPlaying] = useState(isPlaying);
  if (isPlaying !== wasPlaying) {
    setWasPlaying(isPlaying);
    if (isPlaying && held.size > 0) {
      setHeld(new Map());
    }
  }
  // Every tab's code, the image's first, so its #define names win.
  const allCode = useMemo(() => [doc.code, doc.shared ?? "", ...bufferCodes(doc)].join("\n"), [doc]);
  const floatNameList = useMemo(() => floatNames(allCode), [allCode]);
  // Timeline rows: at least three, and enough for every iFloat the code uses or the timeline sets.
  const [minRows, setMinRows] = useState(3);
  const rowCount = useMemo(() => {
    const needed = [
      ...floatsInCode(allCode),
      ...doc.variables.flatMap((v, i) => v.transitions.length > 0 || v.value !== undefined ? [i] : []),
    ];
    return Math.max(minRows, ...needed.map(i => i + 1));
  }, [allCode, doc.variables, minRows]);
  // Texture slots, the same way: at least three, and enough for every one the code uses or that has an image.
  const [minSlots, setMinSlots] = useState(3);
  const slotCount = useMemo(() => {
    const needed = [
      ...inputsInCode(allCode, "iTexture"),
      ...doc.textures.flatMap((t, i) => t.url !== EMPTY_TEXTURE || t.isUserUploaded ? [i] : []),
    ];
    return Math.min(doc.textures.length, Math.max(minSlots, ...needed.map(i => i + 1)));
  }, [allCode, doc.textures, minSlots]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const textureURLs = useMemo(() => doc.textures.map(textureURL), [doc.textures, imagesVersion]);
  // The Canvas2D layer gets null for an empty slot, in place of the black image shaders read.
  const layerTextures = useMemo(
    () => doc.textures.map((t, i) => t.url === EMPTY_TEXTURE && !t.isUserUploaded ? null : textureURLs[i]!),
    [doc.textures, textureURLs]);

  const updateDoc = useCallback((change: Partial<AnimationDocument>) => {
    setDoc(d => ({...d, ...change}));
    setHasUnsavedChanges(true);
  }, []);

  useHashLinks(hasUnsavedChanges);
  useEffect(() => setCrashDocument({id: documentId, json: doc}), [documentId, doc]);

  const loadDocument = useCallback((json: AnimationDocument) => {
    openedCode.current = json.code;
    setDoc(json);
    setTitleInput(json.title);
    setBuiltCode(json.code);
    setBuiltExtras(shaderExtras(json));
    showCodeTab("image");
    setLayerErrors([]);
    setJustAdded(null);
    setSharedUntouched(false);
    setHeld(new Map());
    setMinRows(3);
    setBuildId(id => id + 1);
    windowTitle(json.title);
    setHasUnsavedChanges(false);
  }, []);

  const chooseMobileTab = (tab: MobileTab) => {
    setMobileTab(tab);
    if (tab === "animation" || tab === "sliders" || tab === "textures") {
      setPanelTab(tab);
    }
  };

  const takeTour = async () => {
    setDialog(null);
    notifications.hide("tour");
    setTourState("taken");
    setTourTaken(true);
    tourRunning.current = true;
    let startTour;
    try {
      ({startTour} = await import('./tour'));
    } catch (error) {
      // Offline after a new deploy, say: the tour's chunk isn't cached.
      console.error(error);
      tourRunning.current = false;
      return;
    }
    startTour({
      phone,
      // Applied at once, so the tour measures the pane it's about to highlight.
      showPane: pane => flushSync(() => {
        if (pane === "code") {
          setDocsShown(false);
        }
        if (phone) {
          chooseMobileTab(pane);
        } else if (pane !== "code") {
          setPanelTab(pane);
          setShowFooter(true);
        }
      }),
      onFinish: () => {tourRunning.current = false;},
    });
  };

  // Someone whose first visit is a link to an animation doesn't see the welcome dialog, so
  // offer them the tour once instead.
  const offerTourRef = useLatest(() => {
    if (initialRoute && initialRoute.kind !== "tutorial" && tourState() === null) {
      setTourState("offered");
      tourOfferShowing.current = true;
      notifications.show({
        id: "tour", autoClose: 12000, title: "New to smoothstep.io?",
        onClose: () => {tourOfferShowing.current = false;},
        message: (
          <Group gap="xs" mt={4}>
            <Text size="sm">A one-minute tour shows you around.</Text>
            <Button size="compact-sm" onClick={() => void takeTour()}>Take the tour</Button>
          </Group>
        ),
      });
    }
  });

  // Opens the Docs tab, adding it if needed, at a page and heading.
  const openReference = useCallback((target: DocTarget) => {
    setDocs({...target});
    setDocsShown(true);
    if (phone) {
      setMobileTab("code");
    }
  }, [phone]);
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

  // Shows a one-time tip for what just happened, unless something else has the user's attention.
  const showTip = (event: TipEvent) => {
    const blocked = tourRunning.current || tourOfferShowing.current || tipShowing.current || anyModalOpen() ||
      dialog !== null || alert !== null || tutorialOpen || loading;
    const id = chooseTip(tipsFor(event), seenTips(), blocked);
    if (!id) {
      return;
    }
    markTipSeen(id);
    tipShowing.current = true;
    const {title, message} = tipContent(id, phone);
    notifications.show({
      id: "tip", autoClose: 15000, title, className: "tipNotification",
      onClose: () => {tipShowing.current = false;},
      message: (
        <>
          <Text size="sm">{withCode(message)}</Text>
          <Button
            variant="subtle" color="gray" c="dimmed" fw={500} size="compact-xs" mt={4} ml={-6}
            onClick={() => {turnOffTips(); notifications.hide("tip");}}
          >
            Don't show tips
          </Button>
        </>
      ),
    });
  };

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
          loadDocument({...newDocument(), title: lessonTitle(tutorialStart?.lesson ?? 0)});
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
          loadDocument(doc);
          setSharedFrom(route);
        }
      } catch (error) {
        console.error(error);
        const text = error instanceof ShareError ? error.message : "Could not find that animation in this browser.";
        setAlert(text);
        // Saving now creates a new animation rather than reusing the missing id.
        window.history.replaceState({}, "", "#new");
        setDocumentId(null);
        setDoc(d => ({...d, code: "// " + text}));
        setBuiltCode("// " + text);
        setBuiltExtras({buffers: [], shared: "", canvas: null});
      } finally {
        setLoading(false);
        offerTourRef.current();
      }
    });
    return unsubscribe;
  }, [initialRoute, loadDocument, offerTourRef, tutorialStart]);

  // A new version installed in the background. Reloading into it asks first, as leaving the page does.
  const unsavedRef = useLatest(hasUnsavedChanges);
  useEffect(() => appUpdates()?.onReady(() => {
    notifications.show({
      id: "update", autoClose: false, title: "A new version of smoothstep.io is ready",
      message: (
        <Group gap="xs" mt={4}>
          <Text size="sm">Reload to start using it.</Text>
          <Button size="compact-sm" onClick={() => {
            if (confirmLeaving(unsavedRef.current)) {
              appUpdates()?.apply();
            }
          }}>Reload</Button>
        </Group>
      ),
    });
  }), [unsavedRef]);

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (hasUnsavedChanges && !hasConfirmedLeaving()) {
        event.preventDefault();
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [hasUnsavedChanges]);

  // Advance time while playing.
  useEffect(() => {
    if (!isPlaying || scrubbing) {
      return;
    }
    let id = 0;
    let last: number | null = null;
    const step = (now: number) => {
      if (last !== null) {
        const elapsed = Math.max(0, (now - last) / 1000);
        const next = timeRef.current + elapsed;
        if (next > doc.duration) {
          setTime(0);
          restartFrames();
        } else {
          setTime(next);
          setStepClock(clock => clock + elapsed);
        }
      }
      last = now;
      id = requestAnimationFrame(step);
    };
    id = requestAnimationFrame(step);
    return () => cancelAnimationFrame(id);
  }, [isPlaying, scrubbing, doc.duration, timeRef, restartFrames]);

  const seek = useCallback((t: number) => {
    setTime(t);
    setHeld(new Map());  // Moving the playhead shows the timeline's values again.
    if (t === 0) {
      restartFrames();
    }
  }, [restartFrames]);

  const build = () => {
    setBuiltCode(doc.code);
    setBuiltExtras(shaderExtras(doc));
    setBuildId(id => id + 1);
  };
  // A build asked for along with an edit, made once the edit has reached `doc`.
  const [buildQueued, setBuildQueued] = useState(false);
  if (buildQueued) {
    setBuildQueued(false);
    build();
  }

  const onCodeChange = (tab: ShaderId, code: string, isHelperChange: boolean) => {
    // Emptied shared code stays as "", so the editor doesn't jump back to the placeholder; opening
    // the animation again drops it.
    const withCode = (d: AnimationDocument): AnimationDocument =>
      tab === "image" ? {...d, code} : tab === "shared" ? {...d, shared: code} :
        tab === "canvas" ? {...d, layers: (d.layers ?? []).map(layer => ({...layer, code}))} :
        {...d, buffers: (d.buffers ?? []).map((buffer, i) => i === tab ? {code} : buffer)};
    setDoc(withCode);
    setHasUnsavedChanges(true);
    if (tab === "shared") {
      setSharedUntouched(false);
    }
    if (isHelperChange) {
      // They've found the pickers, so there's no need for the tip about them.
      markTipSeen("pickers");
    }
    // Picker drags rebuild live, as long as the code was built before the drag.
    if (isHelperChange && allBuilt) {
      setBuiltCode(withCode(doc).code);
      setBuiltExtras(shaderExtras(withCode(doc)));
    }
  };

  const addBuffer = () => {
    const buffers = doc.buffers ?? [];
    updateDoc({buffers: [...buffers, {code: newBufferCode(buffers.length)}]});
    showCodeTab(buffers.length);
  };

  const removeLastBuffer = () => {
    const buffers = doc.buffers ?? [];
    const last = buffers.length - 1;
    if (buffers[last]!.code !== newBufferCode(last) &&
        !window.confirm(`Remove ${shaderName(last)} and its code?`)) {
      return;
    }
    const rest = buffers.slice(0, last);
    setDoc(d => {
      const next: AnimationDocument = {...d, buffers: rest};
      if (rest.length === 0) {
        delete next.buffers;  // Saved as an animation without buffers, as before it had any.
      }
      return next;
    });
    setHasUnsavedChanges(true);
    setCodeTab(last > 0 ? last - 1 : "image");
    if (errorShader === last) {
      // Its error went with it, and mustn't show on a buffer added in its place.
      setLineErrors([]);
      setErrorShader(null);
    }
  };

  const layer = canvasLayer(doc);

  const addCanvasLayer = () => {
    setDoc(d => withCanvasLayer(d, {kind: "canvas2d", code: NEW_CANVAS_CODE, overlay: true}));
    setHasUnsavedChanges(true);
    showCodeTab("canvas");
    setJustAdded("canvas");
  };

  const removeCanvasLayer = () => {
    if (layer && layer.code !== NEW_CANVAS_CODE && !window.confirm(`Remove ${shaderName("canvas")} and its code?`)) {
      return;
    }
    setDoc(d => withCanvasLayer(d, null));
    setJustAdded(null);
    setHasUnsavedChanges(true);
    setCodeTab("image");
  };

  // A new shared.glsl tab shows a placeholder, which only becomes code once it's edited, so an untouched
  // tab isn't saved and needs no build.
  const addShared = () => {
    setDoc(d => ({...d, shared: ""}));
    setSharedUntouched(true);
    showCodeTab("shared");
    setJustAdded("shared");
  };

  const removeShared = () => {
    const shared = doc.shared?.trim() ?? "";
    if (shared && shared !== SHARED_PLACEHOLDER.trim() && !window.confirm(`Remove ${shaderName("shared")} and its code?`)) {
      return;
    }
    setDoc(d => {
      const next = {...d};
      delete next.shared;
      return next;
    });
    setSharedUntouched(false);
    setJustAdded(null);
    setHasUnsavedChanges(true);
    setCodeTab("image");
    if (errorShader === "shared") {
      setLineErrors([]);
      setErrorShader(null);
    }
  };

  const onLayerStatus = (errors: LineError[]) => {
    setLayerErrors(errors);
    // Show the code with the error, unless the docs are open: its tab shows the error.
    if (errors.length > 0 && errorShader === null && canvasLayer(docRef.current) && !docsShownRef.current) {
      setCodeTab("canvas");
    }
  };

  const onBuilt = (result: CompileResult) => {
    const errors = result.ok ? [] : result.errors;
    setLineErrors(errors);
    setErrorShader(result.ok ? null : result.shader);
    if (!result.ok && !docsShownRef.current) {
      setCodeTab(result.shader);  // Show the code with the error.
    }
    setCompiled({code: builtCode ?? "", ok: result.ok});
    if (builtCode !== null) {
      // Every tab's code, so a tip about iPrevFrame shows wherever it's used.
      const code = [builtCode, builtExtras.shared, ...builtExtras.buffers].join("\n");
      showTip({kind: "built", ok: result.ok, code, edited: builtCode !== openedCode.current});
    }
  };

  // Each tab has its own editor, hidden unless it's open, so it keeps its undo history and cursor.
  const codeTabs: {tab: ShaderId; code: string}[] = [
    ...(layer ? [{tab: "canvas" as const, code: layer.code}] : []),
    ...(doc.shared !== undefined
      ? [{tab: "shared" as const, code: sharedUntouched && doc.shared === "" ? SHARED_PLACEHOLDER : doc.shared}] : []),
    ...(doc.buffers ?? []).map((buffer, i) => ({tab: i, code: buffer.code})),
    {tab: "image", code: doc.code},
  ];

  const save = async (asCopy: boolean, copyTitle?: string) => {
    // Saving before the animation has loaded would overwrite it with the default document, and
    // two overlapping first saves would make two copies.
    if (loading || saving.current) {
      return;
    }
    saving.current = true;
    showMessage("Saving animation...", true);
    let json = doc;
    if (copyTitle) {
      json = {...doc, title: copyTitle};
      setDoc(json);
      setTitleInput(copyTitle);
      windowTitle(copyTitle);
    }
    try {
      const id = await localStore.saveDocument(asCopy ? null : documentId, json, canvasRef.current?.captureFrame() ?? null);
      const message = asCopy || (documentId === null && sharedFrom) ? "Saved a copy to your animations." :
        documentId === null ? "Saved to your animations." : "Animation saved.";
      if (id !== documentId) {
        window.history.replaceState({}, "", documentHref(id));
      }
      setDocumentId(id);
      // Now one of the user's own animations, even if it's deleted later.
      setSharedFrom(null);
      // Edits made while saving are still unsaved.
      setHasUnsavedChanges(docRef.current !== json);
      showMessage(message);
      showTip({kind: "saved"});
    } catch (error) {
      console.error(error);
      notifications.hide("status");
      setAlert(errorMessage(error, "Error saving animation. The browser may be out of storage space."));
    } finally {
      saving.current = false;
    }
  };

  const saveRef = useLatest(save);

  const download = useCallback(async () => {
    const now = Date.now();
    try {
      archive.download(await archive.animationFile({
        id: documentId ?? localStore.newId(), title: doc.title, created: now, modified: now, thumbnail: null, json: doc,
      }));
    } catch (error) {
      console.error(error);
      setAlert("Error downloading animation.");
    }
  }, [doc, documentId]);

  // Adds animation files from the computer to the browser's animations, and opens the one a single
  // file holds.
  const openFiles = async (files: FileList | File[] | null, launched = false) => {
    if (!files || files.length === 0) {
      return;
    }
    try {
      const summary = await archive.importFiles(Array.from(files));
      const ids = [...new Set(summary.ids)];
      const [only] = ids;
      const single = only !== undefined && ids.length === 1 && summary.failed === 0;
      // A launch opening the animation already open is this window's own, given again after it reloaded.
      if (single && launched && window.location.hash === documentHref(only)) {
        return;
      }
      if (single && openHash(documentHref(only), hasUnsavedChanges)) {
        return;
      }
      // Several animations, or one the user chose not to open over unsaved changes: list them.
      setLibraryVersion(v => v + 1);
      if (ids.length > 0) {
        setDialog("open");
      }
      setAlert(archive.importMessage(summary));
    } catch (error) {
      console.error(error);
      setAlert("Error opening file.");
    } finally {
      if (fileInput.current) {
        fileInput.current.value = "";
      }
    }
  };

  // Files opened with the installed app, as File → Import opens them.
  const openFilesRef = useLatest(openFiles);
  useEffect(() => onLaunchFiles(files => void openFilesRef.current(files, true)), [openFilesRef]);

  // Adds the animation at a link to this browser's animations, and opens it.
  const importLink = async (route: Route) => {
    let id: string;
    try {
      const {doc: linked, images} = await loadRoute(route);
      id = await archive.importDocument(linked, images);
    } catch (error) {
      console.error(error);
      throw error instanceof ShareError ? error : new Error(errorMessage(error, "Couldn't import that animation."));
    }
    setLibraryVersion(v => v + 1);
    setDialog(openHash(documentHref(id), hasUnsavedChanges) ? null : "open");
  };

  // A link clicked in a code comment, like "[Help → Tutorial]" or "[Sliders]", opens that menu item or tab.
  const appLinkRef = useLatest((link: AppLink) => {
    const showPanel = (tab: PanelTab) => {
      if (phone) {
        chooseMobileTab(tab);
      } else {
        setPanelTab(tab);
        setShowFooter(true);
      }
    };
    const showCode = (tab: ShaderId) => {
      if (tab === "shared" && doc.shared === undefined) {
        addShared();  // A link to shared.glsl adds it, ready to write in.
      } else if (tab === "image" || tab === "shared" ||
          (tab === "canvas" ? layer !== undefined : tab < (doc.buffers?.length ?? 0))) {
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
      "Help → Shader inputs": () => openReference(DOC_SECTIONS.reference),
      "Help → Keyboard shortcuts": () => openReference(DOC_SECTIONS.shortcuts),
      "Help → Documentation": () => openDocumentation(),
      "Help → Source code": () => window.open(REPO_URL, "_blank", "noopener"),
      "Help → Acknowledgements": () => openReference(DOC_SECTIONS.acknowledgements),
      "Timeline": () => showPanel("animation"),
      "Animation": () => showPanel("animation"),
      "Sliders": () => showPanel("sliders"),
      "Textures": () => showPanel("textures"),
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

  // Ctrl/Cmd-S outside the code editor (the editor handles its own).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s" &&
          !(event.target instanceof Element && event.target.closest(".cm-editor"))) {
        event.preventDefault();
        void saveRef.current(false);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [saveRef]);

  const commitTitle = () => {
    const title = (titleInput || DEFAULT_TITLE).slice(0, MAX_TITLE_LENGTH);
    setTitleInput(title);
    if (title !== doc.title) {
      updateDoc({title});
    }
    windowTitle(title);
  };

  const onDurationChange = useCallback((duration: number) => {
    updateDoc({duration});
    setTime(t => Math.min(t, duration));
  }, [updateDoc]);

  const startExport = async () => {
    const controller = new AbortController();
    exportAbort.current = controller;
    setExportError(null);
    setExportProgress({stage: "rendering", fraction: 0});
    try {
      // Loaded on first export, since the encoders are a large part of the app's size.
      const {exportVideo} = await import('../export/exportVideo');
      archive.download(await exportVideo(doc, exportOptions, setExportProgress, controller.signal));
      setDialog(null);
      showMessage("Video rendered.");
    } catch (error) {
      if (!controller.signal.aborted) {
        console.error(error);
        setExportError(error instanceof Error ? error.message : String(error));
      }
    } finally {
      // A cancelled run can finish after a new one has started; leave the new one's state alone.
      if (exportAbort.current === controller) {
        exportAbort.current = null;
        setExportProgress(null);
      }
    }
  };

  const cancelExport = () => {
    exportAbort.current?.abort();
    setDialog(null);
  };


  const buildState = lineErrors.length > 0 || layerErrors.length > 0 ? "error" : allBuilt ? "built" : "changed";

  const tutorialState: TutorialState = {
    code: doc.code, builtCode: builtCode ?? "",
    shared: doc.shared ?? "", buffers: bufferCodes(doc), builtShared: builtExtras.shared, builtBuffers: builtExtras.buffers,
    canvas: layer?.code ?? null, builtCanvas: builtExtras.canvas, canvasOverlay: layer?.overlay ?? true,
    built: buildState === "built" && compiled?.ok === true && compiled.code === builtCode,
    isPlaying, time, variables: doc.variables, textures: doc.textures, duration: doc.duration,
    aspectRatio: doc.aspectRatio,
  };

  // Puts a step's code in each of its tabs, adding buffers up to the highest it fills and the Canvas2D layer
  // if it fills that, and opens the last.
  const putTutorialCode = (code: TabCode[]) => {
    const change: Partial<AnimationDocument> = {};
    const buffers = [...doc.buffers ?? []];
    for (const {tab, code: text} of code) {
      if (tab === "image") {
        change.code = text;
      } else if (tab === "shared") {
        change.shared = text;
        setSharedUntouched(false);
      } else if (tab === "canvas") {
        change.layers = [{...layer ?? {kind: "canvas2d", overlay: true}, code: text}];
      } else {
        while (buffers.length <= tab) {
          buffers.push({code: newBufferCode(buffers.length)});
        }
        buffers[tab] = {code: text};
        change.buffers = buffers;
      }
    }
    updateDoc(change);
    showCodeTab(code[code.length - 1]!.tab);
    if (phone) {
      chooseMobileTab("code");
    }
  };

  const changeTutorialLesson = (lesson: number) => {
    // Only the tutorial's own unsaved animation follows the lesson.
    if (documentId !== null) {
      return;
    }
    window.history.replaceState({}, "", TUTORIAL_HREF + "/" + (lesson + 1));
    if (doc.title.startsWith("Tutorial: ")) {
      const title = lessonTitle(lesson);
      setDoc(d => ({...d, title}));
      setTitleInput(title);
      windowTitle(title);
    }
  };

  const closeTutorial = () => {
    setTutorialOpen(false);
    if (mobileTab === "learn") {
      setMobileTab("code");
    }
    if (window.location.hash.startsWith(TUTORIAL_HREF)) {
      window.history.replaceState({}, "", "#new");
    }
  };

  return (
    <div
      className="app" data-footer={showFooter ? "open" : "closed"}
      data-full-view={fullView || undefined}
      data-mobile-tab={mobileTab} data-tutorial={tutorialOpen || undefined}
      data-side-panel={tutorialOpen || undefined}
      data-keyboard={typingIn ?? undefined}
    >
      <header className="appHeader">
        <a className="brand" href="./" aria-label="smoothstep.io home">
          <img src={asset("images/logo.svg")} width="24" height="24" alt="" />
          <span className="brandName">smoothstep<i>.io</i></span>
        </a>
        <TextInput
          id="titleInput" ref={titleRef} variant="unstyled" className="titleInput"
          value={titleInput} maxLength={MAX_TITLE_LENGTH}
          data-default={doc.title === DEFAULT_TITLE || undefined}
          aria-label="Title"
          onChange={event => {setTitleInput(event.target.value); setHasUnsavedChanges(true);}}
          onFocus={() => {
            if (titleInput === DEFAULT_TITLE) {
              titleRef.current?.select();
            }
          }}
          onBlur={commitTitle}
          onKeyDown={event => {
            if (event.key === "Enter") {
              titleRef.current?.blur();
            }
          }}
        />
        {copySource &&
          <Tooltip label="Saving keeps a copy in your animations, and leaves this one as it is" withArrow>
            <Badge variant="light" color="gray" size="sm" className="sourceBadge">
              {sharedFrom.kind === "example" ? "Example" : "Shared"}
            </Badge>
          </Tooltip>}
        <Group gap={4} wrap="nowrap" className="headerActions headerEnd">
          <Menu>
            <Menu.Target>
              <Button
                variant="subtle" color="gray" leftSection={phone ? <TbFile /> : undefined}
                rightSection={phone ? undefined : <TbChevronDown />}
              >
                File{phone && <TbChevronDown className="menuChevron" aria-hidden />}
              </Button>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item component="a" href="#new" leftSection={<TbFile />}>New</Menu.Item>
              <Menu.Item leftSection={<TbFolderOpen />} onClick={() => setDialog("open")}>Open</Menu.Item>
              <Menu.Item
                leftSection={<TbDeviceFloppy />} onClick={() => void save(false)} fw={hasUnsavedChanges ? 600 : undefined}
                rightSection={touch ? undefined : <Kbd size="xs">{MOD_KEY} S</Kbd>}
              >{copySource ? "Save a copy" : "Save"}</Menu.Item>
              {documentId &&
                <Menu.Item leftSection={<TbCopy />} onClick={() => setDialog("saveCopy")}>Save copy</Menu.Item>}
              <Menu.Divider />
              <Menu.Item leftSection={<TbFileImport />} onClick={() => setDialog("import")}>
                Import…
                <Text size="xs" c="dimmed">From a file or a link</Text>
              </Menu.Item>
              <Menu.Item leftSection={<TbDownload />} onClick={() => void download()}>
                Export
                <Text size="xs" c="dimmed">Download this animation as a file</Text>
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
          <Menu position="bottom-end">
            <Menu.Target>
              <Button
                variant="subtle" color="gray" leftSection={phone ? <TbHelp /> : undefined}
                rightSection={phone ? undefined : <TbChevronDown />}
              >
                Help{phone && <TbChevronDown className="menuChevron" aria-hidden />}
              </Button>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item leftSection={<TbBook />} onClick={openDocumentation}>
                Documentation
              </Menu.Item>
              <Menu.Item leftSection={<TbCode />} onClick={() => openReference(DOC_SECTIONS.reference)}>
                Shader inputs
              </Menu.Item>
              <Menu.Item leftSection={<TbKeyboard />} onClick={() => openReference(DOC_SECTIONS.shortcuts)}>
                Keyboard shortcuts
              </Menu.Item>
              <Menu.Divider />
              <Menu.Item component="a" href={TUTORIAL_HREF} leftSection={<TbSchool />}>Tutorial</Menu.Item>
              <Menu.Item leftSection={<TbRoute />} onClick={() => void takeTour()}>Take the tour</Menu.Item>
              <Menu.Item leftSection={<TbHome />} onClick={() => setDialog("splash")}>Welcome</Menu.Item>
              <Menu.Divider />
              <Menu.Item component="a" href={REPO_URL} target="_blank" rel="noreferrer" leftSection={<TbBrandGithub />}>
                Source code
              </Menu.Item>
              <Menu.Item
                component="a" href="https://classic.smoothstep.io/" target="_blank" rel="noreferrer"
                leftSection={<TbHistory />}
              >
                Classic smoothstep.io
                <Text size="xs" c="dimmed">Download your data until 19 December</Text>
              </Menu.Item>
              {canInstall &&
                <Menu.Item leftSection={<TbDeviceDesktopDown />} onClick={() => void install()}>
                  Install as an app
                  <Text size="xs" c="dimmed">Opens in a window of its own</Text>
                </Menu.Item>}
            </Menu.Dropdown>
          </Menu>
          <Tooltip label={`Save (${MOD_KEY} S)`}>
            <ActionIcon
              variant={hasUnsavedChanges ? "light" : "subtle"} color={hasUnsavedChanges ? undefined : "gray"}
              size="lg" aria-label="Save" className="saveButton" onClick={() => void save(false)}
            >
              <TbDeviceFloppy size={18} />
            </ActionIcon>
          </Tooltip>
          <Button variant="subtle" color="gray" leftSection={<TbShare />} onClick={() => setDialog("share")}>
            Share
          </Button>
          <Button
            variant="light" leftSection={<TbVideo />} className="exportButton"
            onClick={() => {setExportError(null); setDialog("export");}}
          >
            Render
          </Button>
        </Group>
      </header>

      <main
        className="workspace" ref={workspaceRef} data-resizing={resizing || undefined}
        // The tutorial's Learn panel keeps its own narrower preset.
        style={customWidth === null ? undefined : {"--preview-width": previewWidthCSS(customWidth)} as CSSProperties}
      >
        <section className="editorPane">
          {/* Before the code, so on phones it can't stick higher than the code's first line. */}
          {buildState !== "built" && !docsShown &&
            <Tooltip label="Shift + Enter" position="top">
              <Button
                className="buildButton" onClick={build} leftSection={<TbHammer />}
                color={buildState === "error" ? "red" : undefined}
              >
                Build
              </Button>
            </Tooltip>}
          <ShaderTabs
            numBuffers={doc.buffers?.length ?? 0} hasShared={doc.shared !== undefined} hasCanvas={layer !== undefined}
            current={docsShown ? "docs" : codeTab} hasDocs={docs !== null}
            errors={[...(errorShader === null ? [] : [errorShader]), ...(layerErrors.length > 0 ? ["canvas" as const] : [])]}
            onChoose={showCodeTab} onAdd={addBuffer} onRemoveLast={removeLastBuffer}
            onAddCanvas={addCanvasLayer} onRemoveCanvas={removeCanvasLayer}
            onAddShared={addShared} onRemoveShared={removeShared}
            onChooseDocs={() => setDocsShown(true)} onCloseDocs={closeDocs}
          />
          {/* Captions say how the tabs relate, so a lone Image.glsl tab has none. */}
          {!docsShown && codeTabs.length > 1 && <div className="codeCaption">
            {layer && codeTab === "canvas" &&
              <Tooltip
                label="Off: the drawing only shows where a shader reads iCanvas2D" position="bottom-start" openDelay={400}
              >
                <div>
                  <Switch
                    size="xs" className="overlaySwitch" label="Draw over the image" checked={layer.overlay}
                    onChange={event => {
                      const overlay = event.currentTarget.checked;
                      setDoc(d => withCanvasLayer(d, {...canvasLayer(d)!, overlay}));
                      setHasUnsavedChanges(true);
                    }}
                  />
                </div>
              </Tooltip>}
            <Text size="xs" c="dimmed">{shaderCaption(codeTab)}</Text>
          </div>}
          {codeTabs.map(({tab, code}) =>
            <CodeEditor
              key={tab} value={code} hidden={docsShown || tab !== codeTab} language={tab === "canvas" ? "javascript" : "glsl"}
              onChange={(changed, isHelperChange) => onCodeChange(tab, changed, isHelperChange)}
              onBuild={build} onSave={() => void save(false)}
              lineErrors={tab === "canvas" ? layerErrors : errorShader === tab ? lineErrors : []}
              autoFocus={tab === justAdded}
              skeleton={starterFunction(tab)} onFixed={() => setBuildQueued(true)}
              lastFrame={typeof tab === "number" ? "iBuffer" + tab : "iPrevFrame"}
              onView={view => {
                if (view) {
                  editorViews.current.set(tab, view);
                } else {
                  editorViews.current.delete(tab);
                }
              }}
            />)}
          {docs && docsLoaded &&
            <Suspense fallback={<div className="referencePanel" hidden={!docsShown} />}>
              <ReferencePanel
                target={docs} active={docsShown} tabName={shaderName(codeTab)}
                language={codeTab === "canvas" ? "js" : "glsl"} hasCanvas={layer !== undefined} onInsert={insertFromDocs}
              />
            </Suspense>}
        </section>
        <section
          className="previewPane"
          // The play bar's second row, when one row of controls is wider than the pane, with smaller
          // controls when even that row is.
          data-two-rows={fullView || layout.containerWidth >= PLAYER_ONE_ROW_WIDTH ? undefined :
            layout.containerWidth < PLAYER_SECOND_ROW_WIDTH ? "narrow" : ""}
          // In full screen, a click on the background around the canvas and play bar leaves it. A drag
          // from the canvas that ends there clicks their common ancestor, so the press must start there too.
          onPointerDown={event => { pressedBackground.current = isBackground(event); }}
          onClick={event => {
            if (fullView && pressedBackground.current && isBackground(event)) {
              setFull(false);
            }
          }}
        >
          <PaneDivider
            workspace={workspaceRef} onReset={() => setPreviewWidth(null)} onDragging={setResizing}
            onChange={setPreviewWidth}
          />
          <Canvas
            ref={canvasRef}
            shaders={shaders} buildId={buildId} textureURLs={textureURLs}
            layerTextures={layerTextures} layerOverlay={layer?.overlay ?? true} onLayerStatus={onLayerStatus}
            time={time} duration={doc.duration} stepClock={stepClock} variableValues={values}
            aspectRatio={doc.aspectRatio}
            onBuilt={onBuilt}
            onRestart={restartFrames} onLayout={setLayout}
          />
          <PlayerControls
            duration={doc.duration} currentTime={time} isPlaying={isPlaying}
            onSeek={seek} onPlayPause={() => setIsPlaying(p => !p)} onReset={() => seek(0)}
            onDurationChange={onDurationChange}
            onScrubStart={() => setScrubbing(true)} onScrubEnd={() => setScrubbing(false)}
            width={layout.width || undefined} top={layout.top} playOnly={fullView}
            extra={<>
              {!fullView &&
                <AspectRatioPicker
                  value={doc.aspectRatio} onChange={(aspectRatio: AspectRatio) => updateDoc({aspectRatio})}
                />}
              <Tooltip label={fullView ? "Exit full screen (Esc)" : "Full screen"} position="bottom">
                <ActionIcon
                  variant="default" size="input-sm" className="fullViewButton"
                  aria-label={fullView ? "Exit full screen" : "Full screen"}
                  onMouseDown={event => event.preventDefault()} onClick={() => setFull(!fullView)}
                >
                  {fullView ? <TbMinimize /> : <TbMaximize />}
                </ActionIcon>
              </Tooltip>
            </>}
          />
        </section>
      </main>

      <nav className="mobileTabs">
        <SegmentedControl
          fullWidth size="sm" value={mobileTab} onChange={value => chooseMobileTab(value as MobileTab)}
          data={[
            {value: "code", label: "Code"}, {value: "animation", label: "Timeline"}, {value: "sliders", label: "Sliders"},
            {value: "textures", label: "Textures"},
            ...(tutorialOpen ? [{
              value: "learn",
              label: tutorialStepDone && mobileTab !== "learn"
                ? <span className="learnTabLabel">Learn<TbCircleCheckFilled aria-label="step done" /></span>
                : "Learn",
            }] : []),
          ]}
        />
      </nav>

      {tutorialOpen && tutorialStart && !loading &&
        <Suspense fallback={<div className="learnPanel" />}>
          <TutorialPanel
            initial={tutorialStart} state={tutorialState} onPutCode={putTutorialCode}
            onLessonChange={changeTutorialLesson} onClose={closeTutorial}
            onStepDoneChange={setTutorialStepDone}
          />
        </Suspense>}

      <section className="bottomPanel">
        <Tabs
          value={panelTab} keepMounted
          onChange={value => {
            setPanelTab(value === "textures" || value === "sliders" ? value : "animation");
            setShowFooter(true);
          }}
        >
          <Tabs.List>
            <Tabs.Tab value="animation">Timeline</Tabs.Tab>
            <Tabs.Tab value="sliders">Sliders</Tabs.Tab>
            <Tabs.Tab value="textures">Textures</Tabs.Tab>
            <ActionIcon
              variant="subtle" color="gray" className="toggleFooter" aria-label="Toggle footer"
              onClick={() => setShowFooter(s => !s)}
            >
              <TbChevronDown />
            </ActionIcon>
          </Tabs.List>
          <Tabs.Panel value="animation">
            <Timeline
              variables={doc.variables} variableValues={values} names={floatNameList}
              onVariablesChange={(variables: Variable[]) => {
                showTip({kind: "variablesChanged", before: doc.variables, after: variables});
                updateDoc({variables});
              }}
              duration={doc.duration} currentTime={time} onSeek={seek} onDurationChange={onDurationChange}
              rowCount={rowCount} onAddRow={() => setMinRows(rowCount + 1)}
            />
          </Tabs.Panel>
          <Tabs.Panel value="sliders">
            <Sliders
              variables={doc.variables} values={values} names={floatNameList}
              code={allCode}
              held={new Set(heldRows.keys())} onVariablesChange={(variables: Variable[]) => updateDoc({variables})}
              onHold={hold}
            />
          </Tabs.Panel>
          <Tabs.Panel value="textures">
            <Textures
              textures={doc.textures} onChange={(textures: TextureSlot[]) => updateDoc({textures})}
              count={slotCount} onAdd={() => setMinSlots(slotCount + 1)}
              onMessage={setAlert}
            />
          </Tabs.Panel>
        </Tabs>
      </section>

      {loading && <div id="loading"><Loader size="sm" /></div>}

      <DocumentBrowser
        show={dialog === "open"} onHide={() => setDialog(null)} currentId={documentId}
        onDeleted={id => {
          if (id === documentId) {
            // Keep what's in the editor, as an unsaved new animation.
            window.history.replaceState({}, "", "#new");
            setDocumentId(null);
            setHasUnsavedChanges(true);
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
        show={dialog === "import"} onHide={() => setDialog(null)}
        onChooseFiles={() => {setDialog(null); fileInput.current?.click();}}
        onImportLink={importLink}
      />
      <Share
        show={dialog === "share"} doc={doc} onHide={() => setDialog(null)} onMessage={setAlert}
        onDownload={() => void download()}
        source={sharedFrom && documentId === null && !hasUnsavedChanges ? routeHash(sharedFrom) : null}
      />
      <SaveCopy
        show={dialog === "saveCopy"} title={doc.title} onHide={() => setDialog(null)}
        onSave={title => {setDialog(null); void save(true, title);}}
      />
      <ExportSettings
        show={dialog === "export"} duration={doc.duration} aspectRatio={doc.aspectRatio}
        options={exportOptions} onOptionsChange={setExportOptions}
        onExport={() => void startExport()} onCancel={cancelExport}
        progress={exportProgress} error={exportError}
      />
      <Splash
        show={dialog === "splash"} onHide={() => setDialog(null)}
        onTour={() => void takeTour()} tourTaken={tourTaken}
      />
      <AppModal opened={alert !== null} onClose={() => setAlert(null)} withCloseButton={false} zIndex={400}>
        <p className="alertText">{alert}</p>
        <Group justify="flex-end"><Button onClick={() => setAlert(null)}>Ok</Button></Group>
      </AppModal>
    </div>
  );
}
