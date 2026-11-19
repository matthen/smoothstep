import { ActionIcon, Button, Group, Kbd, Loader, Menu, SegmentedControl, Tabs, Text, TextInput, Tooltip } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  TbBook, TbBrandGithub, TbChevronDown, TbCopy, TbDeviceFloppy, TbDownload, TbFile, TbFolderOpen, TbHammer,
  TbHeart, TbHelp, TbHome, TbMovie, TbSchool,
} from 'react-icons/tb';

import Acknowledgements from '../dialogs/Acknowledgements';
import DocumentBrowser from '../dialogs/DocumentBrowser';
import ExportSettings from '../dialogs/ExportSettings';
import type { ExportOptions, ExportProgress } from '../dialogs/exportTypes';
import SaveCopy from '../dialogs/SaveCopy';
import Splash from '../dialogs/Splash';
import Textures from '../dialogs/Textures';
import CodeEditor from '../editor/CodeEditor';
import * as archive from '../lib/archive';
import { asset, documentHref, DOCS_URL, REPO_URL, textureURL, TUTORIAL_URL } from '../lib/config';
import {
  DEFAULT_TITLE, MAX_TITLE_LENGTH, newDocument, parseDocument, variableValues,
  type AnimationDocument, type AspectRatio, type TextureSlot, type Variable,
} from '../lib/document';
import * as localStore from '../lib/localStore';
import type { LineError } from '../lib/types';
import { useLatest } from '../lib/useLatest';
import Canvas, { type CanvasHandle, type CanvasLayout } from '../render/Canvas';
import PlayerControls from '../timeline/PlayerControls';
import Timeline from '../timeline/Timeline';
import AppModal from './AppModal';
import { setCrashDocument } from './crashState';
import { hasConfirmedLeaving, parseHash, useHashLinks } from './routing';

const STORAGE_BLOCKED = "This browser isn't letting smoothstep store data, so animations can't be saved here. " +
  "Private browsing can cause this.";

function windowTitle(title: string) {
  document.title = title === DEFAULT_TITLE ? "smoothstep.io" : title + " - smoothstep.io";
}

// Which pane fills the screen below the canvas on a phone.
type MobileTab = "code" | "animation" | "textures";

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
const MOD_KEY = isMac ? "⌘" : "Ctrl";

function showMessage(text: string, loading = false) {
  const options = {id: "status", message: text, loading, autoClose: loading ? false : 1500, withCloseButton: !loading};
  // Each is a no-op when the other applies: update needs an existing id, show skips one.
  notifications.update(options);
  notifications.show(options);
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof localStore.StorageFullError ? error.message + " Delete some animations or uploads, " +
    "or download everything from the Open dialog and clear space." : fallback;
}

export default function App() {
  const initialRoute = useMemo(() => parseHash(window.location.hash), []);
  const [doc, setDoc] = useState<AnimationDocument>(newDocument);
  const [documentId, setDocumentId] = useState<string | null>(initialRoute?.kind === "anim" ? initialRoute.id : null);
  const [loading, setLoading] = useState(initialRoute !== null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [titleInput, setTitleInput] = useState(doc.title);
  const [builtCode, setBuiltCode] = useState<string | null>(initialRoute ? null : doc.code);
  const [buildId, setBuildId] = useState(0);
  const [lineErrors, setLineErrors] = useState<LineError[]>([]);
  const [time, setTime] = useState(0);
  const [frameIndex, setFrameIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [scrubbing, setScrubbing] = useState(false);
  const [imagesVersion, setImagesVersion] = useState(0);
  const [layout, setLayout] = useState<CanvasLayout>({width: 0, height: 0, top: 0});
  const [showFooter, setShowFooter] = useState(true);
  const [wideCanvas, setWideCanvas] = useState(false);
  const [mobileTab, setMobileTab] = useState<MobileTab>("code");
  const [panelTab, setPanelTab] = useState<"animation" | "textures">("animation");
  const [alert, setAlert] = useState<string | null>(null);
  const [dialog, setDialog] = useState<"open" | "saveCopy" | "export" | "splash" | "acknowledgements" | null>(
    window.location.hash ? null : "splash");
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

  const values = useMemo(() => variableValues(doc.variables, time), [doc.variables, time]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const textureURLs = useMemo(() => doc.textures.map(textureURL), [doc.textures, imagesVersion]);

  const updateDoc = useCallback((change: Partial<AnimationDocument>) => {
    setDoc(d => ({...d, ...change}));
    setHasUnsavedChanges(true);
  }, []);

  useHashLinks(hasUnsavedChanges);
  useEffect(() => setCrashDocument({id: documentId, json: doc}), [documentId, doc]);

  const loadDocument = useCallback((json: AnimationDocument) => {
    setDoc(json);
    setTitleInput(json.title);
    setBuiltCode(json.code);
    setBuildId(id => id + 1);
    windowTitle(json.title);
    setHasUnsavedChanges(false);
  }, []);

  // Open the storage, then the animation the URL names.
  useEffect(() => {
    const unsubscribe = localStore.onImagesChanged(() => setImagesVersion(v => v + 1));
    const route = initialRoute;
    localStore.init().catch(error => {
      console.error(error);
      setAlert(STORAGE_BLOCKED);
    }).then(async () => {
      if (!route) {
        return;
      }
      try {
        if (route.kind === "example") {
          const response = await fetch(asset("examples/" + route.id + ".json"));
          if (!response.ok) {
            throw new Error("Example " + route.id + ": " + response.status);
          }
          loadDocument(parseDocument(await response.json()));
        } else {
          const record = await localStore.getDocument(route.id);
          if (!record) {
            throw new Error("Not found");
          }
          loadDocument(parseDocument(record.json));
        }
      } catch (error) {
        console.error(error);
        const text = "Could not find that animation in this browser.";
        setAlert(text);
        // Saving now creates a new animation rather than reusing the missing id.
        window.history.replaceState({}, "", "#new");
        setDocumentId(null);
        setDoc(d => ({...d, code: "// " + text}));
        setBuiltCode("// " + text);
      } finally {
        setLoading(false);
      }
    });
    return unsubscribe;
  }, [initialRoute, loadDocument]);

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
        const next = timeRef.current + Math.max(0, (now - last) / 1000);
        if (next > doc.duration) {
          setTime(0);
          setFrameIndex(0);
        } else {
          setTime(next);
          setFrameIndex(f => f + 1);
        }
      }
      last = now;
      id = requestAnimationFrame(step);
    };
    id = requestAnimationFrame(step);
    return () => cancelAnimationFrame(id);
  }, [isPlaying, scrubbing, doc.duration, timeRef]);

  const restartFrames = useCallback(() => setFrameIndex(0), []);

  const seek = useCallback((t: number) => {
    setTime(t);
    if (t === 0) {
      setFrameIndex(0);
    }
  }, []);

  const build = () => {
    setBuiltCode(doc.code);
    setBuildId(id => id + 1);
  };

  const onCodeChange = (code: string, isHelperChange: boolean) => {
    setDoc(d => ({...d, code}));
    setHasUnsavedChanges(true);
    // Picker drags rebuild live, as long as the code was built before the drag.
    if (isHelperChange && builtCode === doc.code) {
      setBuiltCode(code);
    }
  };

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
      if (id !== documentId) {
        window.history.replaceState({}, "", documentHref(id));
      }
      setDocumentId(id);
      // Edits made while saving are still unsaved.
      setHasUnsavedChanges(docRef.current !== json);
      showMessage("Animation saved.");
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
      showMessage("Video exported.");
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


  const chooseMobileTab = (tab: MobileTab) => {
    setMobileTab(tab);
    if (tab !== "code") {
      setPanelTab(tab);
    }
  };

  const buildState = lineErrors.length > 0 ? "error" : builtCode === doc.code ? "built" : "changed";

  return (
    <div
      className="app" data-footer={showFooter ? "open" : "closed"} data-wide={wideCanvas || undefined}
      data-mobile-tab={mobileTab}
    >
      <header className="appHeader">
        <a className="brand" href="./" aria-label="smoothstep home">
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
        <Group gap={4} wrap="nowrap" className="headerActions">
          <Menu>
            <Menu.Target>
              <Button variant="subtle" color="gray" aria-label="File" rightSection={<TbChevronDown />}>
                <TbFile className="mobileOnly" aria-hidden /><span className="desktopOnly">File</span>
              </Button>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item component="a" href="#new" leftSection={<TbFile />}>New</Menu.Item>
              <Menu.Item leftSection={<TbFolderOpen />} onClick={() => setDialog("open")}>Open</Menu.Item>
              <Menu.Item
                leftSection={<TbDeviceFloppy />} onClick={() => void save(false)} fw={hasUnsavedChanges ? 600 : undefined}
                rightSection={<Kbd size="xs">{MOD_KEY} S</Kbd>}
              >Save</Menu.Item>
              {documentId &&
                <Menu.Item leftSection={<TbCopy />} onClick={() => setDialog("saveCopy")}>Save copy</Menu.Item>}
              <Menu.Item leftSection={<TbDownload />} onClick={() => void download()}>
                Download animation file
                <Text size="xs" c="dimmed">Code, timeline and textures, to open again later</Text>
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
          <Button
            variant="subtle" color="gray" leftSection={<TbMovie />} aria-label="Export video"
            onClick={() => {setExportError(null); setDialog("export");}}
          >
            <span className="desktopOnly">Export video</span>
          </Button>
          <Menu position="bottom-end">
            <Menu.Target>
              <Button variant="subtle" color="gray" leftSection={<TbHelp />} aria-label="Help">
                <span className="desktopOnly">Help</span>
              </Button>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item leftSection={<TbHome />} onClick={() => setDialog("splash")}>Welcome</Menu.Item>
              <Menu.Item component="a" href={TUTORIAL_URL} target="_blank" rel="noreferrer" leftSection={<TbSchool />}>
                Tutorial
              </Menu.Item>
              <Menu.Item component="a" href={DOCS_URL} target="_blank" rel="noreferrer" leftSection={<TbBook />}>
                Documentation
              </Menu.Item>
              <Menu.Item component="a" href={REPO_URL} target="_blank" rel="noreferrer" leftSection={<TbBrandGithub />}>
                Source code
              </Menu.Item>
              <Menu.Divider />
              <Menu.Item leftSection={<TbHeart />} onClick={() => setDialog("acknowledgements")}>Acknowledgements</Menu.Item>
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
        </Group>
      </header>

      <main className="workspace">
        <section className="editorPane">
          <CodeEditor
            value={doc.code} onChange={onCodeChange} onBuild={build} onSave={() => void save(false)}
            lineErrors={lineErrors}
          />
          {buildState !== "built" &&
            <Tooltip label="Shift + Enter" position="top">
              <Button
                className="buildButton" onClick={build} leftSection={<TbHammer />}
                color={buildState === "error" ? "red" : undefined}
              >
                Build
              </Button>
            </Tooltip>}
        </section>
        <section className="previewPane">
          <Canvas
            ref={canvasRef}
            code={builtCode} buildId={buildId} textureURLs={textureURLs}
            time={time} duration={doc.duration} frameIndex={frameIndex} variableValues={values}
            aspectRatio={doc.aspectRatio}
            onAspectRatioChange={(aspectRatio: AspectRatio) => updateDoc({aspectRatio})}
            onBuilt={setLineErrors} onRestart={restartFrames} onLayout={setLayout} onToggleWide={() => setWideCanvas(w => !w)}
          />
          <PlayerControls
            duration={doc.duration} currentTime={time} isPlaying={isPlaying}
            onSeek={seek} onPlayPause={() => setIsPlaying(p => !p)} onReset={() => seek(0)}
            onDurationChange={onDurationChange}
            onScrubStart={() => setScrubbing(true)} onScrubEnd={() => setScrubbing(false)}
            width={layout.width || undefined} top={layout.top}
          />
        </section>
      </main>

      <nav className="mobileTabs">
        <SegmentedControl
          fullWidth size="sm" value={mobileTab} onChange={value => chooseMobileTab(value as MobileTab)}
          data={[{value: "code", label: "Code"}, {value: "animation", label: "Timeline"}, {value: "textures", label: "Textures"}]}
        />
      </nav>

      <section className="bottomPanel">
        <Tabs
          value={panelTab} keepMounted
          onChange={value => {setPanelTab(value === "textures" ? "textures" : "animation"); setShowFooter(true);}}
        >
          <Tabs.List>
            <Tabs.Tab value="animation">Animation</Tabs.Tab>
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
              variables={doc.variables} variableValues={values}
              onVariablesChange={(variables: Variable[]) => updateDoc({variables})}
              duration={doc.duration} currentTime={time} onSeek={seek} onDurationChange={onDurationChange}
            />
          </Tabs.Panel>
          <Tabs.Panel value="textures">
            <Textures
              textures={doc.textures} onChange={(textures: TextureSlot[]) => updateDoc({textures})}
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
      />
      <SaveCopy
        show={dialog === "saveCopy"} title={doc.title} onHide={() => setDialog(null)}
        onSave={title => {setDialog(null); void save(true, title);}}
      />
      <ExportSettings
        show={dialog === "export"} options={exportOptions} onOptionsChange={setExportOptions}
        onExport={() => void startExport()} onCancel={cancelExport}
        progress={exportProgress} error={exportError}
      />
      <Splash show={dialog === "splash"} onHide={() => setDialog(null)} />
      <Acknowledgements show={dialog === "acknowledgements"} onHide={() => setDialog(null)} />
      <AppModal opened={alert !== null} onClose={() => setAlert(null)} withCloseButton={false} zIndex={400}>
        <p className="alertText">{alert}</p>
        <Group justify="flex-end"><Button onClick={() => setAlert(null)}>Ok</Button></Group>
      </AppModal>
    </div>
  );
}
