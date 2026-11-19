import React from 'react';
import { Button, ButtonToolbar, Form, Modal, Navbar, Nav, NavDropdown, OverlayTrigger, Spinner, Tab, Tabs, Toast, Tooltip } from 'react-bootstrap';
import { FaAngleDown, FaCogs, FaDownload, FaFile, FaFolderOpen, FaSave } from "react-icons/fa";

import './App.scss';

import * as archive from './archive';
import { asset, documentHref, DOCS_URL } from './config';
import * as localStore from './localStore';
import Acknowledgements from './components/Acknowledgements';
import {AnimationControls, TransitionsHelper} from './components/AnimationControls';
import Canvas from './components/Canvas';
import CodeEditor from './components/CodeEditor';
import DocumentBrowser from './components/DocumentBrowser';
import ExportSettings from './components/ExportSettings';
import PlayerControls from './components/PlayerControls';
import SaveCopy from './components/SaveCopy';
import Splash from './components/Splash';
import Textures from './components/Textures';


// mp4 export uses ffmpeg.wasm 0.12 with the single-threaded core. Unlike 0.9 it doesn't
// need SharedArrayBuffer, so it works without cross-origin isolation (COOP/COEP headers),
// which many static hosts can't set.
// webpack 4 can't parse ffmpeg.wasm 0.12, so its browser files are copied into
// public/ffmpeg/ (`npm run vendor-ffmpeg`) and loaded at runtime. The ~31MB core is
// loaded from a CDN.
const FFMPEG_SCRIPT_PATH = asset("/ffmpeg/ffmpeg.js");
const FFMPEG_WORKER_PATH = asset("/ffmpeg/worker.js");
const FFMPEG_CORE_BASE_URL = "https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm";

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.onload = resolve;
    script.onerror = () => reject(new Error("Failed to load " + src));
    document.head.appendChild(script);
  });
}

async function toBlobURL(url, mimeType) {
  // Fetch a cross-origin file into a same-origin blob URL, so the worker can import it.
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Failed to fetch " + url + ": " + response.status);
  }
  const buffer = await response.arrayBuffer();
  return URL.createObjectURL(new Blob([buffer], {type: mimeType}));
}


class App extends React.Component {
  constructor(props) {
    super(props);
    this.numTextures = props.numTextures || 8;
    this.defaultTitle = "Untitled animation";
    this.titleInputRef = React.createRef();
    this.numVariables = props.numVariables || 16;
    this.canvas = React.createRef();
    this.messageDiv = React.createRef();
    this.onBeforeUnload = this.onBeforeUnload.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);
    // Bumped when an export starts or is cancelled; async export steps bail once theirs is stale.
    this.exportRunId = 0;
    // The run id of the mp4 conversion using this.ffmpeg, or null when idle.
    this.ffmpegRunId = null;
    this.state = {
      documentId: null,
      exampleId: null,
      loading: true,
      hasUnsavedChanges: false,
      title: this.defaultTitle,
      titleInputValue: this.defaultTitle,
      code: props.code,
      editorCode: props.code,
      latestIsCompiled: true,
      lineErrors: [],
      timeComplete: 0.0,
      duration: this.props.duration || 12,
      isPlaying: false,
      lastTimestamp: null,
      timeIntent: false,
      frameIndex: 0,
      textures: this.initialTextures(),
      variables: this.initialVariables(),
      variableValues: this.initialVariableValues(),
      aspectRatio: [1, 1],
      exportType: "webm",
      ffmpegArgs: "-vcodec libx264 -crf 10 -pix_fmt yuv420p",
      exportResolution: props.exportResolution || 512,
      exportFps: props.exportFps || 30,
      exportDialogOpen: false,
      exportRequested: false,
      exportStarted: false,
      encodingLogMessage: "",
      encodingProgress: 0.0,
      encodingRunning: false,
      showAlert: false,
      alertText: "",
      documentBrowserOpen: false,
      acknowledgementsOpen: false,
      splashOpen: false,
      splashSeen: false,
      // Set to request a PNG of the next rendered frame, passed to frameCallback.
      requestedFrame: false,
      frameCallback: null,
      showFooter: true,
      playerControlsTop: 0,
      message: "",
      showMessage: false,
      wideCanvas: false,
    };
    this.setDocumentId(this.state);
  }

  setDocumentId(state) {
    // #anim/<id> is an animation saved in this browser; #example/<id> a bundled example.
    const match = window.location.hash.match(/^#(anim|example)\/([a-f0-9]+)$/);
    state.loading = Boolean(match);
    if (match) {
      state[match[1] === "anim" ? "documentId" : "exampleId"] = match[2];
      state.editorCode = "     Loading";
    }
  }

  componentDidMount() {
    window.addEventListener("beforeunload", this.onBeforeUnload);
    document.addEventListener("keydown", this.handleKeyDown);
    this.progressTime();
    // Each animation opens with a fresh page load.
    window.addEventListener("hashchange", this.onHashChange);
    document.addEventListener("click", this.onHashLinkClick, true);
    localStore.init().catch(error => {
      console.log(error);
      this.showAlert("This browser isn't letting smoothstep store data, so animations can't be saved here. Private browsing can cause this.");
    }).then(() => {
      this.forceUpdate();  // Uploaded textures are now available.
      if (this.state.documentId || this.state.exampleId) {
        this.loadDocument();
      }
    });
    if (!window.location.hash) {
      this.setState({splashOpen: true, splashSeen: true});
    }
  }

  componentWillUnmount() {
      document.removeEventListener("keydown", this.handleKeyDown);
      window.removeEventListener("beforeunload", this.onBeforeUnload);
      window.removeEventListener("hashchange", this.onHashChange);
      document.removeEventListener("click", this.onHashLinkClick, true);
      window.cancelAnimationFrame(this.requestAnimationFrameID);
    }

  onHashChange() {
    // Back/forward or an edited URL.
    window.location.reload();
  }

  onHashLinkClick = (event) => {
    // In-app links (#new, #anim/<id>, #example/<id>): confirm here rather than in
    // beforeunload, so cancelling leaves the URL alone, and the same link reloads too.
    // Not plain href="#": react-bootstrap's dropdown toggles use that.
    const link = event.target.closest && event.target.closest(
      'a[href="#new"], a[href^="#anim/"], a[href^="#example/"]');
    if (!link || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey) {
      return;
    }
    event.preventDefault();
    if (this.state.hasUnsavedChanges &&
        !window.confirm("This animation has unsaved changes. Discard them?")) {
      return;
    }
    this.skipUnloadPrompt = true;
    window.history.pushState({}, "", link.getAttribute("href"));
    window.location.reload();
  }

  loadDocument() {
    const load = this.state.exampleId ?
      fetch(asset("/examples/" + this.state.exampleId + ".json")).then(
        response => response.ok ? response.json() : Promise.reject(response)) :
      localStore.getDocument(this.state.documentId).then(
        record => record ? record.json : Promise.reject(new Error("Not found")));
    load.then(
      json => {
        this.setState({hasUnsavedChanges: false, loading: false});
        this.loadJSON(json);
      }
    ).catch(
      error => {
        console.log(error);
        const message = "Could not find that animation in this browser.";
        this.showAlert(message);
        // Saving now creates a new animation rather than reusing the missing id.
        window.history.replaceState({}, "", "#new");
        this.setState({loading: false, editorCode: "// " + message, documentId: null, exampleId: null});
      }
    );
  }

  onBeforeUnload(event) {
    if (this.state.hasUnsavedChanges && !this.skipUnloadPrompt) {
      event.preventDefault();
      event.returnValue = "Animation has unsaved changes.";
    }
  }

  loadJSON(jsonObj) {
    // Load a document from a JSON object.
    // restore information from the transitions.
    for (let i = 0; i < jsonObj.variables.length; i++) {
      const transitions = jsonObj.variables[i].transitions;
      for (let j = 0; j < transitions.length; j++) {
        let transition = transitions[j];
        transition.row = i;
        transition.isHover = false;
        transition.isStartValueValid = true;
        transition.isEndValueValid = true;
      }
    }
    let stateUpdate ={
      title: jsonObj.title,
      titleInputValue: jsonObj.title,
      editorCode: jsonObj.code,
      latestIsCompiled: false,
      duration: jsonObj.duration,
      textures: jsonObj.textures,
      variables: jsonObj.variables,
      aspectRatio: jsonObj.aspectRatio,
    };
    this.setState(stateUpdate);
    this.recompileCode();
    this.updateDocumentTitle(jsonObj.title);
  }

  toJSON() {
    // Serialize the document being edited as a JSON object.
    let jsonObj = {};
    jsonObj.title = this.state.title;
    jsonObj.code = this.state.editorCode;
    jsonObj.duration = this.state.duration;
    jsonObj.textures = this.state.textures;
    jsonObj.variables = this.state.variables;
    jsonObj.aspectRatio = this.state.aspectRatio;
    // lazy way to do deep copy & make sure is serializable.
    jsonObj = JSON.parse(JSON.stringify(jsonObj));
    // trim unnecessary information.
    for (let i = 0; i < jsonObj.variables.length; i++) {
      const transitions = jsonObj.variables[i].transitions;
      for (let j = 0; j < transitions.length; j++) {
        let transition = transitions[j];
        delete transition.row;
        delete transition.isHover;
        delete transition.isStartValueValid;
        delete transition.isEndValueValid;
      }
    }
    return jsonObj;
  }

  handleKeyDown(event) {
    let char = String.fromCharCode(event.which).toLowerCase();
    if (event.target.type === "textarea") {
      // The code editor handles its own shortcuts.
      return;
    }
    if (event.ctrlKey || event.metaKey) {
      if (char === "s") {
        event.preventDefault();
        this.handleSave();
      }
    }
  }

  initialTextures() {
    let textures = [];
    for (let i = 0; i < this.numTextures; i++) {
      textures.push({
        url: "special/black.png",
        isUserUploaded: false,
        id: "iTexture" + i,
      });
    }
    return textures;
  }

  initialVariables() {
    let variables = [];
    for (let i = 0; i < this.numVariables; i++) {
      variables.push({transitions: []});
    }
    return variables;
  }

  initialVariableValues() {
    let values = [];
    for (let i = 0; i < this.numVariables; i++) {
      values.push(0.0);
    }
    return values;
  }

  handleCodeChange(newCode, isHelperChange) {
    this.setState({editorCode: newCode, hasUnsavedChanges: true});
    if (isHelperChange && this.state.latestIsCompiled) {
      this.recompileCode();
    } else {
      this.setState({latestIsCompiled: false});
    }
  }

  handleLineErrors(newLineErrors) {
    this.setState({lineErrors: newLineErrors});
  }

  recompileCode() {
    this.setState({code: this.state.editorCode, latestIsCompiled: true});
  }

  handlePlayButton() {
    this.setState({isPlaying: !this.state.isPlaying});
  }

  handleTimeChange(newTime) {
    if (newTime > 1.0) {
      newTime = 0.0;
    }
    if (newTime === 0.0) {
      this.setState({frameIndex: 0});
    }
    this.setState({timeComplete: newTime});
  }

  handleTimeIntent() {
    this.setState({timeIntent: true});
  }

  handleTimeIntentEnd() {
    this.setState({timeIntent: false});
  }

  handleDurationChange(newDuration) {
    const absoluteTime = this.state.timeComplete * this.state.duration;
    const timeComplete = Math.min(1.0, absoluteTime / newDuration)
    this.setState({
      duration: newDuration, timeComplete: timeComplete,
      hasUnsavedChanges: true});
  }

  progressTime(newTimestamp) {
    this.maybeSetupExport();

    let newState = {};
    let complete;
    if (this.capturer && !this.state.exportStarted) {
      newState.timeComplete = 0.0;
      newState.frameIndex = 0;
      newState.exportStarted = true;
    } else if (!this.state.timeIntent && this.state.isPlaying && this.state.lastTimestamp !== null) {
      const timeDeltaSeconds = Math.max(0.0, (newTimestamp - this.state.lastTimestamp) / 1000.0);
      const timeCompleteDelta = timeDeltaSeconds / this.state.duration;
      newState.timeComplete = this.state.timeComplete + timeCompleteDelta;
      newState.frameIndex = this.state.frameIndex + 1;
      complete = newState.timeComplete > 1.0;
      if (complete) {
        newState.timeComplete = 0.0;
        newState.frameIndex = 0;
      }
    }
    newState.lastTimestamp = newTimestamp;
    newState.variableValues = this.variableValues();

    this.setState(newState);
    if (complete) {
      this.maybeFinishExport();
    }
    this.requestAnimationFrameID = window.requestAnimationFrame(this.progressTime.bind(this));
  }

  maybeSetupExport() {
    if (!this.state.exportRequested || !this.canvas.current || this.canvas.current.width !== this.state.exportResolution) {
      return;
    }
    if (this.capturer) {
      return;
    }
    // mp4 is recorded as webm, then converted with ffmpeg.
    const format = {png: "png", webm: "webm", mp4: "webm", gif: "gif"}[this.state.exportType];
    this.capturer = new window.CCapture({
      name: this.state.title,
      format: format,
      quality: 90,
      framerate: this.state.exportFps,
      verbose: false,
      workersPath: asset("/"),
      onProgress: (progress) => this.setState({encodingProgress: progress}),
    });
    this.capturer.start();
  }

  maybeFinishExport() {
    if (!this.state.exportRequested || !this.capturer) {
      return;
    }

    this.capturer.stop();
    const runId = this.exportRunId;

    if (this.state.exportType === "mp4") {
      this.setState({encodingLogMessage: "Loading ffmpeg."});
      this.capturer.save((blob) => this.convertToMp4(blob, runId));
      this.setState({
        exportRequested: false, timeComplete: 1.0, isPlaying: false,
        exportStarted: false, encodingRunning: true,
      });
    } else if (this.state.exportType === "gif") {
      this.setState({
        exportRequested: false, timeComplete: 1.0, isPlaying: false,
        exportStarted: false, encodingRunning: true,
      });
      this.capturer.save((blob) => {
        if (runId !== this.exportRunId) {
          return;
        }
        window.download(blob, this.state.title + '.gif', 'image/gif');
        this.setState({exportDialogOpen: false, encodingRunning: false});
      });
    } else {
      this.capturer.save();
      this.setState({
        exportRequested: false, timeComplete: 1.0, isPlaying: false,
        exportStarted: false, exportDialogOpen: false,
      });
    }
    this.capturer = null;
  }

  async convertToMp4(blob, runId) {
    const isStale = () => runId !== this.exportRunId;
    if (isStale()) {
      return;
    }
    this.ffmpegRunId = runId;
    let ffmpeg = null;
    let failed = false;
    try {
      ffmpeg = await this.maybeLoadFfmpeg();
      if (isStale()) {return;}
      const buffer = new Uint8Array(await blob.arrayBuffer());
      if (isStale()) {return;}
      await ffmpeg.writeFile('input.webm', buffer);
      if (isStale()) {return;}
      const args = ['-i', 'input.webm'].concat(
        this.state.ffmpegArgs.trim().split(/\s+/), ['output.mp4']);
      const exitCode = await ffmpeg.exec(args);
      if (isStale()) {return;}
      if (exitCode !== 0) {
        throw new Error("ffmpeg exited with code " + exitCode);
      }
      const mp4Data = await ffmpeg.readFile('output.mp4');
      if (isStale()) {return;}
      const mp4Blob = new Blob([mp4Data.buffer], { type: 'video/mp4' });
      window.download(mp4Blob, this.state.title + '.mp4', 'video/mp4');
      this.setState({exportDialogOpen: false, encodingRunning: false});
    } catch (error) {
      // A cancelled run's ffmpeg was already terminated by cancelExport.
      if (isStale()) {return;}
      failed = true;
      console.log(error);
      this.setState({exportDialogOpen: false, encodingRunning: false});
      this.showAlert("Error encoding mp4.");
    } finally {
      if (failed) {
        this.resetFfmpeg();
      } else if (ffmpeg && this.ffmpeg === ffmpeg) {
        await ffmpeg.deleteFile('input.webm').catch(() => {});
        await ffmpeg.deleteFile('output.mp4').catch(() => {});
      }
      if (this.ffmpegRunId === runId) {
        this.ffmpegRunId = null;
      }
    }
  }

  resetFfmpeg() {
    // Terminate the current (possibly half-loaded) ffmpeg so the next mp4 export loads a fresh one.
    if (this.ffmpeg) {
      this.ffmpeg.terminate();
    }
    this.ffmpeg = null;
    this.ffmpegLoaded = null;
    this.ffmpegLoadToken = null;
  }

  maybeLoadFfmpeg() {
    // Resolves to a loaded FFmpeg instance, shared between exports until resetFfmpeg().
    if (this.ffmpegLoaded) {
      return this.ffmpegLoaded;
    }
    const token = {};
    this.ffmpegLoadToken = token;
    const isCurrent = () => this.ffmpegLoadToken === token;
    const loaded = (async () => {
      if (!window.FFmpegWASM) {
        await loadScript(FFMPEG_SCRIPT_PATH);
      }
      if (!isCurrent()) {
        throw new Error("ffmpeg load abandoned");
      }
      const ffmpeg = new window.FFmpegWASM.FFmpeg();
      this.ffmpeg = ffmpeg;
      try {
        ffmpeg.on('log', ({message}) => {
          if (this.ffmpeg !== ffmpeg) {return;}
          this.setState({encodingLogMessage: message});
          console.log(message);
        });
        ffmpeg.on('progress', ({progress}) => {
          if (this.ffmpeg !== ffmpeg) {return;}
          this.setState({encodingProgress: Math.min(1.0, Math.max(0.0, progress))});
        });
        const coreURL = await toBlobURL(FFMPEG_CORE_BASE_URL + "/ffmpeg-core.js", "text/javascript");
        const wasmURL = await toBlobURL(FFMPEG_CORE_BASE_URL + "/ffmpeg-core.wasm", "application/wasm");
        if (!isCurrent()) {
          throw new Error("ffmpeg load abandoned");
        }
        await ffmpeg.load({
          classWorkerURL: new URL(FFMPEG_WORKER_PATH, window.location.href).href,
          coreURL: coreURL,
          wasmURL: wasmURL,
        });
        return ffmpeg;
      } catch (error) {
        ffmpeg.terminate();
        if (isCurrent()) {
          // Allow retrying on the next export.
          this.resetFfmpeg();
        }
        throw error;
      }
    })();
    this.ffmpegLoaded = loaded;
    return loaded;
  }

  maybeCaptureFrame() {
    // Called by the canvas after each frame is rendered.
    if (this.capturer) {
      this.capturer.capture(this.canvas.current);
    }
    if (this.state.requestedFrame && this.state.frameCallback) {
      const imageDataURL = this.canvas.current.toDataURL("image/png");
      this.state.frameCallback(imageDataURL);
      this.setState({requestedFrame: false});
    }
  }

  requestExport() {
    if (this.state.exportRequested) {
      return;
    }
    this.startNewExportRun();
    this.setState({
      encodingLogMessage: "", encodingProgress: 0.0,
      exportRequested: true, timeComplete: 0.0,
      frameIndex: 0,
      isPlaying: true, lastTimestamp: null,
      exportDialogOpen: true,
    });
  }

  startNewExportRun() {
    // Invalidate any in-flight export, killing its ffmpeg conversion if one is running.
    this.exportRunId += 1;
    if (this.ffmpegRunId !== null) {
      this.ffmpegRunId = null;
      this.resetFfmpeg();
    }
  }

  cancelExport() {
    this.startNewExportRun();
    if (this.capturer) {
      this.capturer.stop();
      this.capturer = null;
    }
    this.setState({
      exportRequested: false, isPlaying: false, exportDialogOpen: false,
      encodingRunning: false});
  }

  variableValues() {
    let values = [];
    for (let i = 0; i < this.state.variables.length; i++) {
      const helper = new TransitionsHelper(this.state.variables[i].transitions);
      let value = helper.computeValue(this.state.timeComplete * this.state.duration);
      value = Number(value);
      if (isNaN(value)) {
        value = 0.0;
      }
      values.push(value);
    }
    return values;
  }

  compileButtonVariant() {
    if (this.state.lineErrors.length > 0) {
      return 'danger';
    }
    else if (this.state.code === this.state.editorCode) {
      return 'hidden';
    }
    return 'primary';
  }

  handleTextureSelect(newTexture) {
    let newTextures = this.state.textures.slice();
    for (let i = 0; i < newTextures.length; i++) {
      let texture = newTextures[i];
      if (texture.id === newTexture.id) {
        Object.assign(texture, newTexture);
      }
    }

    this.setState({textures: newTextures, hasUnsavedChanges: true});
  }

  handleTitleChange() {
    let title = this.state.titleInputValue;
    title = title || this.defaultTitle;
    title = title.slice(0, 32);
    this.updateDocumentTitle(title);
    this.setState({title: title, titleInputValue: title, hasUnsavedChanges: true});
  }

  updateDocumentTitle(title) {
    if (title === this.defaultTitle) {
      document.title = "smoothstep.io";
    } else {
      document.title = title + " - smoothstep.io";
    }
  }

  saveLocal(saveAsCopy, imageDataURL) {
    localStore.saveDocument(
      saveAsCopy ? null : this.state.documentId, this.toJSON(), imageDataURL,
    ).then(
      documentId => {
        this.showMessage("Animation saved.");
        if (documentId !== this.state.documentId) {
          window.history.replaceState({}, "", documentHref(documentId));
        }
        this.setState({documentId, exampleId: null, hasUnsavedChanges: false});
      }
    ).catch(
      error => {
        console.log(error);
        this.showAlert("Error saving animation. The browser may be out of storage space.");
      }
    );
  }

  downloadCurrent() {
    const now = Date.now();
    archive.animationFile({
      id: this.state.documentId || localStore.newId(), title: this.state.title,
      created: now, modified: now, thumbnail: null, json: this.toJSON(),
    }).then(
      ({blob, filename}) => archive.download(blob, filename)
    ).catch(
      error => {
        console.log(error);
        this.showAlert("Error downloading animation.");
      }
    );
  }

  handleSave(saveAsCopy, copyTitle) {
    this.showMessage("Saving animation...");
    const wasPaused = !this.state.isPlaying;
    if (copyTitle) {
      this.updateDocumentTitle(copyTitle);
      this.setState({title: copyTitle, titleInputValue: copyTitle, hasUnsavedChanges: true});
    }
    // Render a frame to use as the thumbnail, then save.
    this.setState({
      requestedFrame: true,
      isPlaying: true,
      frameCallback: (imageDataURL) => {
        if (wasPaused) {
          this.setState({isPlaying: false});
        }
        this.saveLocal(saveAsCopy, imageDataURL);
      },
    });
  }

  handleOpen() {
    this.setState({documentBrowserOpen: true});
  }

  showMessage(message) {
    this.setState({message: message, showMessage: true});
  }

  showAlert(message) {
    this.setState({showAlert: true, alertText: message});
  }

  render() {
    // Can use <NavDropdown.Divider />.
    return (
      <div
        id="root"
        className={
          (this.state.showFooter ? "showFooter " : "hideFooter ") +
          (this.state.wideCanvas ? "wideCanvas" : "")
        }
      >
        <header id="header">
          <Navbar variant="dark" expand="sm">
            <Navbar.Brand href="./">
              <img
                src={asset("/images/logo.svg")}
                width="26"
                height="26"
                alt="smoothstep.io logo"
              />
              smoothstep<i>.io</i>
            </Navbar.Brand>
            <Navbar.Toggle aria-controls="responsive-navbar-nav" />
            <Navbar.Collapse>
              <Nav className="mr-auto">
                <Form.Control
                  type="text"
                  value={this.state.titleInputValue}
                  plaintext={true}
                  className={this.state.title === this.defaultTitle ? "default" : null}
                  onChange={(event) => this.setState({
                    titleInputValue: event.target.value, hasUnsavedChanges: true})}
                  id="titleInput"
                  ref={this.titleInputRef}
                  onFocus={() => {
                    if (this.state.titleInputValue === this.defaultTitle) {
                      this.titleInputRef.current.select();
                    }
                  }}
                  onBlur={(event) => this.handleTitleChange()}
                  maxLength="32"
                />
                <NavDropdown title="File">
                  <NavDropdown.Item href="#new" id="newButton"><FaFile /> New</NavDropdown.Item>
                  <NavDropdown.Item
                    onClick={() => this.handleOpen()}
                  ><FaFolderOpen /> Open</NavDropdown.Item>
                  <NavDropdown.Item
                    onClick={() => this.handleSave()}
                    className={this.state.hasUnsavedChanges ? "emph" : ""}
                  ><FaSave /> Save</NavDropdown.Item>
                  {this.state.documentId &&
                    <SaveCopy
                      title={this.state.title}
                      handleSave={(title) => this.handleSave(true, title)}
                    />
                  }
                  <NavDropdown.Item
                    onClick={() => this.downloadCurrent()}
                  ><FaDownload /> Download</NavDropdown.Item>
                </NavDropdown>
                <Nav.Link onClick={() => this.setState({exportDialogOpen: true})}>Export video</Nav.Link>
                <Nav.Link href={DOCS_URL} target="_blank" rel="noreferrer">Documentation</Nav.Link>
              </Nav>
            </Navbar.Collapse>

            <DocumentBrowser
              show={this.state.documentBrowserOpen}
              onHide={() => this.setState({documentBrowserOpen: false})}
              showAlert={(message) => this.showAlert(message)}
              documentId={this.state.documentId}
              onDeletedOpenDocument={() => {
                // Keep what's in the editor, as an unsaved new animation.
                window.history.replaceState({}, "", "#new");
                this.setState({documentId: null, hasUnsavedChanges: true});
              }}
            />

            {this.canvas.current &&
              <ExportSettings
                exportResolution={this.state.exportResolution}
                onExportResolutionChange={(exportResolution) => this.setState({exportResolution})}
                exportFps={this.state.exportFps}
                onExportFpsChange={(exportFps) => this.setState({exportFps})}
                exportType={this.state.exportType}
                onExportTypeChange={(exportType) => this.setState({exportType})}
                ffmpegArgs={this.state.ffmpegArgs}
                onFfmpegArgsChange={(ffmpegArgs) => this.setState({ffmpegArgs})}
                onRequestExport={() => this.requestExport()}
                onCancelExport={() => this.cancelExport()}
                exportRequested={this.state.exportRequested}
                timeComplete={this.state.timeComplete}
                encodingRunning={this.state.encodingRunning}
                encodingProgress={this.state.encodingProgress}
                duration={this.state.duration}
                frameIndex={this.state.frameIndex}
                encodingLogMessage={this.state.encodingLogMessage}
                show={this.state.exportDialogOpen}
              />
            }

          </Navbar>
        </header>
        <div id="main">
          <div id="left">
            <CodeEditor
              value={this.state.editorCode}
              onChange={(newCode, isHelperChange) => this.handleCodeChange(newCode, isHelperChange)}
              onSave={() => this.handleSave()}
              recompileCode={() => this.recompileCode()}
              lineErrors={this.state.lineErrors}
            />
            <ButtonToolbar>
              <OverlayTrigger
                placement='bottom'
                delay={{ show: 250, hide: 400 }}
                overlay={
                  <Tooltip>Shift + Enter</Tooltip>
                }
              >
                <Button
                    onClick={() => this.recompileCode()}
                    variant={this.compileButtonVariant()}
                    className="build"
                  >
                    <FaCogs /> build
                </Button>
              </OverlayTrigger>
            </ButtonToolbar>
            <Toast
              className="message"
              show={this.state.showMessage}
              onClose={() => this.setState({showMessage: false})}
              delay={1500}
              autohide
            >
              <Toast.Body>{this.state.message}</Toast.Body>
            </Toast>
          </div>
          <div id="right">
            <Canvas
              canvasRef={this.canvas}
              code={this.state.code}
              onLineErrors={(newLineErrors) => this.handleLineErrors(newLineErrors)}
              time={this.state.timeComplete * this.state.duration}
              duration={this.state.duration}
              frameIndex={this.state.frameIndex}
              updateFrameIndex={(frameIndex) => this.setState({frameIndex})}
              resolution={this.state.resolution}
              updateResolution={(resolution) => this.setState({resolution})}
              viewResolution={this.state.viewResolution}
              updateViewResolution={(viewResolution) => this.setState({viewResolution})}
              textures={this.state.textures}
              variableValues={this.state.variableValues}
              exportRequested={this.state.exportRequested}
              exportResolution={this.state.exportResolution}
              captureFrame={() => this.maybeCaptureFrame()}
              aspectRatio={this.state.aspectRatio}
              onChangeAspectRatio={(aspectRatio) => this.setState({aspectRatio})}
              updatePlayerControlsTop={(playerControlsTop) => this.setState({playerControlsTop})}
              toggleWideCanvas={() => this.setState({wideCanvas: !this.state.wideCanvas})}
            />
            <PlayerControls
              duration={this.state.duration}
              timeComplete={this.state.timeComplete}
              onChange={(newTime) => this.handleTimeChange(newTime)}
              onDurationChange={((newDuration) => this.handleDurationChange(newDuration))}
              onPlayClick={() => this.handlePlayButton()}
              onIntent={intent => this.handleTimeIntent()}
              onIntentEnd={() => this.handleTimeIntentEnd()}
              isPlaying={this.state.isPlaying}
              width={this.state.viewResolution && this.state.viewResolution[0]}
              top={this.state.playerControlsTop}
            />
          </div>
        </div>
        <footer id="footer" className={this.state.showFooter ? "show" : "hide"}>
          <div
            className="toggleFooter"
            onClick={() => this.setState({showFooter: !this.state.showFooter})}
          >
            <FaAngleDown />
          </div>
          <Tabs
            defaultActiveKey="animation"
            onSelect={() => this.setState({showFooter: true})}
            onClick={() => this.setState({showFooter: true})}
          >
          <Tab eventKey="animation" title="Animation">
            <AnimationControls
              variables={this.state.variables}
              variableValues={this.state.variableValues}
              onVariablesChange={
                (variables) => this.setState(
                  {variables: variables, hasUnsavedChanges: true})}
              numVariables={this.numVariables}
              duration={this.state.duration}
              timeComplete={this.state.timeComplete}
              onTimeChange={(newTime) => this.handleTimeChange(newTime)}
              onDurationChange={((newDuration) => this.handleDurationChange(newDuration))}
            />
          </Tab>
          <Tab eventKey="textures" title="Textures">
            <Textures
              textures={this.state.textures}
              onSelect={(texture) => this.handleTextureSelect(texture)}
              showAlert={(message) => this.showAlert(message)}
             />
          </Tab>
        </Tabs>
        </footer>
        <div id="footerLinks">
          <p>
            <Button onClick={() => this.setState({splashOpen: true})}>Welcome</Button>
            <Button onClick={() => this.setState({acknowledgementsOpen: true})}>Acknowledgements</Button>
          </p>
        </div>
        <div
          style={{
            display: this.state.loading ? "block" : "none",
          }}
          id="loading"
        >
          <Spinner variant="light" animation="border" size="sm"/>
        </div>
        <Modal
          id="loadingBlocker"
          show={this.state.loading}
          keyboard={false}
          onHide={() => {}}
        ></Modal>
        <Modal
          show={this.state.showAlert}
          onHide={() => this.setState({showAlert: false})}
          centered
        >
          <Modal.Header closeButton>
          </Modal.Header>
          <Modal.Body>
            <p>{this.state.alertText}</p>
          </Modal.Body>
          <Modal.Footer>
            <Button
              onClick={() => this.setState({showAlert: false})}
            >Ok</Button>
          </Modal.Footer>
        </Modal>
        <Acknowledgements
          show={this.state.acknowledgementsOpen}
          onHide={() => this.setState({acknowledgementsOpen: false})}
        />
        <Splash
          show={this.state.splashOpen}
          onHide={() => this.setState({splashOpen: false})}
        />
      </div>
    );
  }
}


export default App;
