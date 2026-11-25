// Telling the user's videos from their images: by their bytes, and by the texture URLs made for them.

// Object URLs made for video blobs. A blob URL doesn't say what it holds, so they're noted here.
const videoURLs = new Set<string>();

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

// Whether a texture's URL is a video, so it's played rather than loaded as an image.
export function isVideoURL(url: string | null | undefined): boolean {
  return typeof url === "string" && (url.startsWith("data:video/") || videoURLs.has(url));
}

// An image's or video's type from its first bytes; PNG if unrecognised.
export function mediaType(bytes: Uint8Array): string {
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {return "image/jpeg";}
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") {return "image/webp";}
  if (ascii(0, 3) === "GIF") {return "image/gif";}
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) {return "video/webm";}
  if (ascii(4, 8) === "ftyp") {
    return ascii(8, 12) === "qt  " ? "video/quicktime" : "video/mp4";
  }
  return "image/png";
}

// The file extension a zip export gives each type.
export const MEDIA_EXTENSIONS: Record<string, string> = {
  "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif",
  "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov",
};
