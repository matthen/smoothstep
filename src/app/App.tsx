import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Button, Form, Modal, Nav, Navbar, NavDropdown, OverlayTrigger, Spinner, Tab, Tabs, Toast, Tooltip,
} from 'react-bootstrap';
import { FaAngleDown, FaCogs, FaCopy, FaDownload, FaFile, FaFolderOpen, FaSave } from 'react-icons/fa';

import Acknowledgements from '../dialogs/Acknowledgements';
import DocumentBrowser from '../dialogs/DocumentBrowser';
import ExportSettings from '../dialogs/ExportSettings';
import type { ExportOptions, ExportProgress } from '../dialogs/exportTypes';
import SaveCopy from '../dialogs/SaveCopy';
import Splash from '../dialogs/Splash';
import Textures from '../dialogs/Textures';
import CodeEditor from '../editor/CodeEditor';
import * as archive from '../lib/archive';
import { asset, documentHref, DOCS_URL, textureURL } from '../lib/config';
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
import { setCrashDocument } from './crashState';
import { parseHash, useHashLinks } from './routing';

const STORAGE_BLOCKED = "This browser isn't letting smoothstep store data, so animations can't be saved here. " +
  "Private browsing can cause this.";

function windowTitle(title: string) {
  document.title = title === DEFAULT_TITLE ? "smoothstep.io" : title + " - smoothstep.io";
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
  const [message, setMessage] = useState<string | null>(null);
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
      if (hasUnsavedChanges) {
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

  const save = useCallback(async (asCopy: boolean, copyTitle?: string) => {
    setMessage("Saving animation...");
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
      setHasUnsavedChanges(false);
      setMessage("Animation saved.");
    } catch (error) {
      console.error(error);
      setMessage(null);
      setAlert(errorMessage(error, "Error saving animation. The browser may be out of storage space."));
    }
  }, [doc, documentId]);

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
        void save(false);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [save]);

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
      setMessage("Video exported.");
    } catch (error) {
      if (!controller.signal.aborted) {
        console.error(error);
        setExportError(error instanceof Error ? error.message : String(error));
      }
    } finally {
      exportAbort.current = null;
      setExportProgress(null);
    }
  };

  const cancelExport = () => {
    exportAbort.current?.abort();
    setDialog(null);
  };

  const buildVariant = lineErrors.length > 0 ? "danger" : builtCode === doc.code ? "hidden" : "primary";

  return (
    <div id="root" className={(showFooter ? "showFooter " : "hideFooter ") + (wideCanvas ? "wideCanvas" : "")}>
      <header id="header">
        <Navbar variant="dark" expand="sm">
          <Navbar.Brand href="./">
            <img src={asset("images/logo.svg")} width="26" height="26" alt="smoothstep logo" />
            smoothstep<i>.io</i>
          </Navbar.Brand>
          <Navbar.Toggle aria-controls="header-nav" />
          <Navbar.Collapse id="header-nav">
            <Nav className="me-auto">
              <Form.Control
                type="text" id="titleInput" plaintext ref={titleRef}
                value={titleInput} maxLength={MAX_TITLE_LENGTH}
                className={doc.title === DEFAULT_TITLE ? "default" : undefined}
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
              <NavDropdown title="File" id="fileMenu">
                <NavDropdown.Item href="#new" id="newButton"><FaFile /> New</NavDropdown.Item>
                <NavDropdown.Item onClick={() => setDialog("open")}><FaFolderOpen /> Open</NavDropdown.Item>
                <NavDropdown.Item onClick={() => void save(false)} className={hasUnsavedChanges ? "emph" : ""}>
                  <FaSave /> Save
                </NavDropdown.Item>
                {documentId &&
                  <NavDropdown.Item onClick={() => setDialog("saveCopy")}><FaCopy /> Save copy</NavDropdown.Item>}
                <NavDropdown.Item onClick={() => void download()}><FaDownload /> Download</NavDropdown.Item>
              </NavDropdown>
              <Nav.Link onClick={() => {setExportError(null); setDialog("export");}}>Export video</Nav.Link>
              <Nav.Link href={DOCS_URL} target="_blank" rel="noreferrer">Documentation</Nav.Link>
            </Nav>
          </Navbar.Collapse>
        </Navbar>
      </header>
      <div id="main">
        <div id="left">
          <CodeEditor
            value={doc.code} onChange={onCodeChange} onBuild={build} onSave={() => void save(false)}
            lineErrors={lineErrors}
          />
          <div className="buildButton">
            <OverlayTrigger placement="bottom" delay={{show: 250, hide: 400}} overlay={<Tooltip>Shift + Enter</Tooltip>}>
              <Button onClick={build} variant={buildVariant} className={"build" + (buildVariant === "hidden" ? " d-none" : "")}>
                <FaCogs /> build
              </Button>
            </OverlayTrigger>
          </div>
          <Toast className="message" show={message !== null} onClose={() => setMessage(null)} delay={1500} autohide>
            <Toast.Body>{message}</Toast.Body>
          </Toast>
        </div>
        <div id="right">
          <Canvas
            ref={canvasRef}
            code={builtCode} buildId={buildId} textureURLs={textureURLs}
            time={time} duration={doc.duration} frameIndex={frameIndex} variableValues={values}
            aspectRatio={doc.aspectRatio}
            onAspectRatioChange={(aspectRatio: AspectRatio) => updateDoc({aspectRatio})}
            onBuilt={setLineErrors} onLayout={setLayout} onToggleWide={() => setWideCanvas(w => !w)}
          />
          <PlayerControls
            duration={doc.duration} currentTime={time} isPlaying={isPlaying}
            onSeek={seek} onPlayPause={() => setIsPlaying(p => !p)} onReset={() => seek(0)}
            onDurationChange={onDurationChange}
            onScrubStart={() => setScrubbing(true)} onScrubEnd={() => setScrubbing(false)}
            width={layout.width || undefined} top={layout.top}
          />
        </div>
      </div>
      <footer id="footer" className={showFooter ? "show" : "hide"}>
        <button type="button" className="toggleFooter" aria-label="Toggle footer" onClick={() => setShowFooter(s => !s)}>
          <FaAngleDown />
        </button>
        <Tabs defaultActiveKey="animation" onSelect={() => setShowFooter(true)}>
          <Tab eventKey="animation" title="Animation">
            <Timeline
              variables={doc.variables} variableValues={values}
              onVariablesChange={(variables: Variable[]) => updateDoc({variables})}
              duration={doc.duration} currentTime={time} onSeek={seek} onDurationChange={onDurationChange}
            />
          </Tab>
          <Tab eventKey="textures" title="Textures">
            <Textures
              textures={doc.textures} onChange={(textures: TextureSlot[]) => updateDoc({textures})}
              onMessage={setAlert}
            />
          </Tab>
        </Tabs>
      </footer>
      <div id="footerLinks">
        <Button onClick={() => setDialog("splash")}>Welcome</Button>
        <Button onClick={() => setDialog("acknowledgements")}>Acknowledgements</Button>
      </div>
      {loading && <div id="loading"><Spinner animation="border" size="sm" /></div>}

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
      <Modal show={alert !== null} onHide={() => setAlert(null)} centered>
        <Modal.Header closeButton />
        <Modal.Body><p>{alert}</p></Modal.Body>
        <Modal.Footer><Button onClick={() => setAlert(null)}>Ok</Button></Modal.Footer>
      </Modal>
    </div>
  );
}
