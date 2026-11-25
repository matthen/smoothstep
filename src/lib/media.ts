// Telling videos from images: by their bytes, and by their texture URLs.

// Object URLs made for video blobs. A blob URL doesn't say what it holds, so they're noted here.
const videoURLs = new Set<string>();

// Videos are stored as they are, so they're kept small enough to embed in an animation file.
export const MAX_VIDEO_MB = 32;

export function isVideoType(type: string): boolean {
  return type.startsWith("video/");
}

// An object URL for an uploaded image or video, which isVideoURL recognises if it's a video.
export function mediaObjectURL(blob: Blob): string {
  const url = URL.createObjectURL(blob);
  if (isVideoType(blob.type)) {
    videoURLs.add(url);
  }
  return url;
}

export function revokeMediaURL(url: string) {
  videoURLs.delete(url);
  URL.revokeObjectURL(url);
}

// A video's data URL as an object URL, which browsers play more readily; any other URL as it is.
export function playableURL(url: string): string {
  const match = /^data:(video\/[\w+.-]+);base64,/.exec(url);
  if (!match) {
    return url;
  }
  const binary = atob(url.slice(match[0].length));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return mediaObjectURL(new Blob([bytes], {type: match[1]}));
}

// Whether a texture's URL is a video, so it's played rather than loaded as an image: an uploaded
// video's data or object URL, or a built-in video's path.
export function isVideoURL(url: string | null | undefined): boolean {
  return typeof url === "string" &&
    (url.startsWith("data:video/") || videoURLs.has(url) ||
      (!/^(data|blob):/.test(url) && /\.(mp4|webm|mov|m4v)$/i.test(url.split(/[?#]/)[0]!)));
}

// An image's or video's type from its first bytes. Bytes it doesn't recognise keep the type they
// were stored with, or are taken as PNG.
export function mediaType(bytes: Uint8Array, stored?: unknown): string {
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));
  if (ascii(1, 4) === "PNG") {return "image/png";}
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {return "image/jpeg";}
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") {return "image/webp";}
  if (ascii(0, 3) === "GIF") {return "image/gif";}
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) {return "video/webm";}
  if (ascii(4, 8) === "ftyp") {
    return ascii(8, 12) === "qt  " ? "video/quicktime" : "video/mp4";
  }
  return typeof stored === "string" && /^(image|video)\/[\w+.-]+$/.test(stored) ? stored : "image/png";
}

const MEDIA_EXTENSIONS: Record<string, string> = {
  "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif",
  "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov", "video/x-m4v": "m4v",
};

// The file extension a zip export gives a type.
export function mediaExtension(type: string): string {
  const subtype = (type.split("/")[1] ?? "").replace(/^x-/, "").replace(/[^a-z0-9]/gi, "");
  return MEDIA_EXTENSIONS[type] ?? (subtype || "bin");
}

// The type a file name's extension stands for, if it's one mediaExtension gives.
export function extensionType(name: unknown): string | undefined {
  const extension = typeof name === "string" ? name.split(".").pop() : undefined;
  return Object.keys(MEDIA_EXTENSIONS).find(type => MEDIA_EXTENSIONS[type] === extension);
}

// Why a video can't be a texture, or null if it can.
export function videoProblem(bytes: number, width: number, height: number, maxDim: number): string | null {
  const megabytes = bytes / 1024 / 1024;
  if (megabytes > MAX_VIDEO_MB) {
    return `Videos can be up to ${MAX_VIDEO_MB} MB, and that one is ${Math.ceil(megabytes)} MB.`;
  }
  if (width > maxDim || height > maxDim) {
    return `Videos can be up to ${maxDim} px wide and tall, and that one is ${width} × ${height}.`;
  }
  return null;
}

// A video's length for people to read, like "6.5 s", "1 min 12 s" or "2 h 5 min", or null if it isn't known.
export function formatDuration(seconds: number | null | undefined): string | null {
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds <= 0) {
    return null;
  }
  if (seconds < 0.05) {
    return "<0.1 s";
  }
  if (seconds < 59.95) {
    return `${Number(seconds.toFixed(1))} s`;
  }
  if (seconds < 3570) {
    const whole = Math.round(seconds);
    const rest = whole % 60;
    return `${Math.floor(whole / 60)} min` + (rest ? ` ${rest} s` : "");
  }
  // An hour or more, to the nearest minute.
  const minutes = Math.round(seconds / 60);
  const rest = minutes % 60;
  return `${Math.floor(minutes / 60)} h` + (rest ? ` ${rest} min` : "");
}

// How long a video may take to show its first frame.
const VIDEO_LOAD_TIMEOUT_MS = 20_000;
const HAVE_CURRENT_DATA = 2;

// Resolves once `video` can show its first frame. Some browsers, like Safari on iPhone, wait for
// playback before loading, so a muted play starts it if it's slow.
export function videoLoaded(video: HTMLVideoElement, timeoutMs = VIDEO_LOAD_TIMEOUT_MS): Promise<void> {
  if (video.readyState >= HAVE_CURRENT_DATA) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const finish = (error?: Error) => {
      window.clearTimeout(prime);
      window.clearTimeout(timer);
      video.removeEventListener("loadeddata", loaded);
      video.removeEventListener("error", failed);
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    };
    const loaded = () => finish();
    const failed = () => finish(new Error("This browser can't play that video."));
    video.addEventListener("loadeddata", loaded);
    video.addEventListener("error", failed);
    const prime = window.setTimeout(() => {
      if (video.paused) {
        video.play().then(() => video.pause(), () => {});
      }
    }, 500);
    const timer = window.setTimeout(() => finish(new Error("That video took too long to load.")), timeoutMs);
  });
}
