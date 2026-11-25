// Sharing without a server: an animation compressed into the link itself, or an animation file
// that anyone can download (a GitHub gist, or any URL that lets other websites read it).
import { deflateSync, inflateSync, strFromU8, strToU8 } from 'fflate';

import { ANIMATION_FORMAT, mediaDataURLBytes } from './archive';
import { asset } from './config';
import { EMPTY_TEXTURE, InvalidDocumentError, parseDocument, type AnimationDocument } from './document';
import { mediaType } from './media';
import type { Route } from './routes';

// A message to show the person who opened the link.
export class ShareError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ShareError";
  }
}

export interface LoadedAnimation {
  doc: AnimationDocument;
  // The images it uses that aren't built in, by id, from an animation file that embeds them.
  images: Map<string, Blob>;
}

// Files bigger than this are surely not animations, so stop before the tab runs out of memory. It
// leaves room for a video in every texture slot.
const MAX_FILE_LENGTH = 400_000_000;

function toBase64URL(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64URL(text: string): Uint8Array {
  const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}

// The images a link can't carry: the texture slots holding the user's own images.
export function userImageSlots(doc: AnimationDocument): string[] {
  return doc.textures.filter(t => t.isUserUploaded).map(t => t.id);
}

// The animation as a link carries it: the user's own images are left out, so those slots are empty.
export function encodeDocument(doc: AnimationDocument): string {
  const shared: AnimationDocument = {
    ...doc,
    textures: doc.textures.map(t => t.isUserUploaded ? {...t, url: EMPTY_TEXTURE, isUserUploaded: false} : t),
  };
  return toBase64URL(deflateSync(strToU8(JSON.stringify(shared)), {level: 9}));
}

export function decodeDocument(data: string): AnimationDocument {
  let json: unknown;
  try {
    json = JSON.parse(strFromU8(inflateSync(fromBase64URL(data))));
  } catch {
    throw new ShareError("This link is incomplete. Check that the whole link was copied.");
  }
  return parseShared(json);
}

// A built-in texture's path under images/textures/, with no way to climb out of it.
const BUILT_IN_TEXTURE = /^[\w-][\w.-]*(?:\/[\w-][\w.-]*)*$/;
const IMAGE_ID = /^[a-f0-9]{1,32}$/;

function parseShared(json: unknown): AnimationDocument {
  try {
    const doc = parseDocument(json);
    // Anything else in a slot from someone else's link opens empty.
    const textures = doc.textures.map(slot =>
      (slot.isUserUploaded ? IMAGE_ID : BUILT_IN_TEXTURE).test(slot.url)
        ? slot : {...slot, url: EMPTY_TEXTURE, isUserUploaded: false});
    return {...doc, textures};
  } catch (error) {
    if (error instanceof InvalidDocumentError) {
      throw new ShareError("That isn't a smoothstep.io animation file.");
    }
    throw error;
  }
}

// An animation file's contents: a downloaded `.smoothstep.json` with its images, or a bare document.
export function readAnimationFile(text: string): LoadedAnimation {
  if (text.length > MAX_FILE_LENGTH) {
    throw new ShareError("That file is too big to be a smoothstep.io animation.");
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new ShareError("That isn't a smoothstep.io animation file.");
  }
  const file = json as Record<string, unknown> | null;
  if (file?.format !== ANIMATION_FORMAT) {
    return {doc: parseShared(json), images: new Map()};
  }
  const doc = parseShared(file.document);
  const images = new Map<string, Blob>();
  const embedded = (file.images ?? {}) as Record<string, {data?: unknown}>;
  for (const slot of doc.textures) {
    const image = slot.isUserUploaded ? embedded[slot.url] : undefined;
    if (image && !images.has(slot.url)) {
      try {
        const bytes = mediaDataURLBytes(image.data);
        images.set(slot.url, new Blob([bytes as Uint8Array<ArrayBuffer>], {type: mediaType(bytes)}));
      } catch (error) {
        console.warn(error);  // That slot shows as black, as for any missing image.
      }
    }
  }
  return {doc, images};
}

async function fetchText(url: string, what: string, notFound?: string): Promise<string> {
  let response: Response;
  try {
    response = await fetch(url, {credentials: "omit"});
  } catch {
    throw new ShareError(`Couldn't download ${what}. You may be offline, or the site may not let other ` +
      "websites read its files.");
  }
  if (response.status === 404 && notFound) {
    throw new ShareError(notFound);
  }
  if (!response.ok) {
    throw new ShareError(`Couldn't download ${what}: the site answered with error ${response.status}.`);
  }
  if (Number(response.headers.get("Content-Length")) > MAX_FILE_LENGTH) {
    throw new ShareError("That file is too big to be a smoothstep.io animation.");
  }
  return response.text();
}

interface GistFile {
  filename?: unknown;
  content?: unknown;
  truncated?: unknown;
  raw_url?: unknown;
}

// GitHub's API lets any website read public and secret gists, up to 60 times an hour per visitor.
async function fetchGist(id: string): Promise<LoadedAnimation> {
  let response: Response;
  try {
    response = await fetch("https://api.github.com/gists/" + id, {credentials: "omit"});
  } catch {
    throw new ShareError("Couldn't reach GitHub to open that gist. You may be offline.");
  }
  if (response.status === 404) {
    throw new ShareError("Couldn't find that GitHub gist. It may have been deleted.");
  }
  if (response.status === 403 || response.status === 429) {
    throw new ShareError("GitHub limits how many gists one browser can open in an hour. Try again later.");
  }
  if (!response.ok) {
    throw new ShareError(`Couldn't open that GitHub gist: GitHub answered with error ${response.status}.`);
  }
  const gist = await response.json() as {files?: Record<string, GistFile>};
  const files = Object.values(gist.files ?? {}).filter(f => typeof f.filename === "string");
  const file = files.find(f => (f.filename as string).endsWith(".smoothstep.json")) ??
    files.find(f => (f.filename as string).endsWith(".json"));
  if (!file) {
    throw new ShareError("That GitHub gist has no animation file in it.");
  }
  // GitHub leaves out the content of big files, which then has to be downloaded on its own.
  const text = file.truncated === true || typeof file.content !== "string"
    ? await fetchText(String(file.raw_url), "the gist's animation file")
    : file.content;
  return readAnimationFile(text);
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

// Loads the animation a route names, for every route except a saved animation and the tutorial.
export async function loadRoute(route: Route): Promise<LoadedAnimation> {
  switch (route.kind) {
    case "example": {
      const text = await fetchText(asset("examples/" + route.id + ".json"), "that example",
        "There's no example with that link.");
      return readAnimationFile(text);
    }
    case "share":
      return {doc: decodeDocument(route.data), images: new Map()};
    case "gist":
      return fetchGist(route.id);
    case "url":
      return readAnimationFile(await fetchText(route.url, "the animation from " + hostOf(route.url),
        "Couldn't find an animation file at " + route.url + "."));
    default:
      throw new Error("Not a shared animation: " + route.kind);
  }
}

// The app's own address with `hash`, or its embedded player's, wherever the app is served from.
export function appLink(hash: string, page: "app" | "embed" = "app", base = window.location.href): string {
  const dir = new URL("./", base).href;
  return dir + (page === "embed" ? "embed.html" : "") + hash;
}
