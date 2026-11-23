// Where a Canvas2D layer's code runs: a worker inside a hidden, sandboxed iframe. The iframe has no
// origin, so the code can't reach the app's storage or pages, and its policy lets nothing load from
// the network. The page holding it must forbid frames from loading URLs (frame-src 'none'), so the
// iframe can't send anything out by navigating itself.

const POLICY = "default-src 'none'; script-src 'unsafe-inline' blob:; worker-src blob:";

interface ToFrame {
  spawn?: number;
  source?: string;
  port?: MessagePort;
  kill?: number;
}

type FromFrame = {ready: true} | {worker: number; error: {message: unknown; line: unknown}};

// Runs in the iframe, which gets it as source text: starts and stops workers for the app, hands
// each its message port, and passes on errors the worker couldn't catch itself.
function frameMain() {
  const workers = new Map<number, {worker: Worker; url: string}>();
  addEventListener("message", (event: MessageEvent<ToFrame>) => {
    if (event.source !== parent) {
      return;
    }
    const {spawn, source, port, kill} = event.data;
    if (spawn !== undefined && source !== undefined && port) {
      const url = URL.createObjectURL(new Blob([source], {type: "text/javascript"}));
      const worker = new Worker(url);
      worker.onerror = error => {
        error.preventDefault();  // The app shows it on its line, so the console needn't.
        parent.postMessage({worker: spawn, error: {message: error.message, line: error.lineno}}, "*");
      };
      worker.postMessage({port}, [port]);
      workers.set(spawn, {worker, url});
    } else if (kill !== undefined) {
      const entry = workers.get(kill);
      if (entry) {
        entry.worker.terminate();
        URL.revokeObjectURL(entry.url);
        workers.delete(kill);
      }
    }
  });
  parent.postMessage({ready: true}, "*");
}

export interface SandboxWorker {
  port: MessagePort;
  kill(): void;
}

export class Sandbox {
  private frame: HTMLIFrameElement;
  private ready: Promise<void>;
  private nextId = 1;
  private errorListeners = new Map<number, (error: {message: string; line: number}) => void>();
  private onMessage: (event: MessageEvent<FromFrame>) => void;

  constructor() {
    const frame = document.createElement("iframe");
    frame.setAttribute("sandbox", "allow-scripts");
    frame.setAttribute("aria-hidden", "true");
    frame.tabIndex = -1;
    frame.style.cssText = "position:fixed;left:0;top:0;width:0;height:0;border:0;visibility:hidden;pointer-events:none";
    const script = `(${frameMain.toString()})()`.replace(/<\/script/gi, "<\\/script").replace(/<!--/g, "<\\!--");
    frame.srcdoc = `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${POLICY}">` +
      `<body><script>${script}</` + "script>";
    this.frame = frame;
    let resolveReady: () => void;
    this.ready = new Promise(resolve => {resolveReady = resolve;});
    this.onMessage = event => {
      if (event.source !== frame.contentWindow) {
        return;
      }
      const data = event.data as Partial<{ready: true; worker: number; error: {message: unknown; line: unknown}}>;
      if (data.ready) {
        resolveReady();
      } else if (typeof data.worker === "number" && data.error) {
        const line = Number(data.error.line);
        this.errorListeners.get(data.worker)?.({
          message: typeof data.error.message === "string" ? data.error.message.slice(0, 500) : "",
          line: Number.isFinite(line) ? line : 0,
        });
      }
    };
    window.addEventListener("message", this.onMessage);
    document.body.append(frame);
  }

  // Starts a worker running `source`. `onError` gets errors it didn't catch, such as syntax errors.
  spawn(source: string, onError: (error: {message: string; line: number}) => void): SandboxWorker {
    const id = this.nextId++;
    const channel = new MessageChannel();
    let killed = false;
    this.errorListeners.set(id, onError);
    void this.ready.then(() => {
      if (!killed) {
        this.frame.contentWindow?.postMessage({spawn: id, source, port: channel.port2} satisfies ToFrame, "*", [channel.port2]);
      }
    });
    return {
      port: channel.port1,
      kill: () => {
        killed = true;
        this.errorListeners.delete(id);
        channel.port1.close();
        this.frame.contentWindow?.postMessage({kill: id} satisfies ToFrame, "*");
      },
    };
  }

  dispose() {
    window.removeEventListener("message", this.onMessage);
    this.errorListeners.clear();
    // Removing the iframe stops its workers.
    this.frame.remove();
  }
}
