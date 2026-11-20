// Animations and uploaded textures, kept in the browser's IndexedDB.
import { createStore, del, get, set, values, type UseStore } from 'idb-keyval';

import type { AnimationDocument } from './document';

export interface StoredDocument {
  id: string;
  title: string;
  created: number;  // ms since the epoch
  modified: number;
  json: AnimationDocument;
  thumbnail: string | null;  // 128px PNG data URL
}

export interface StoredImage {
  id: string;
  filename: string;
  width: number;
  height: number;
  created: number;
  blob: Blob;  // PNG, JPEG, WebP or GIF
}

export type DocumentSummary = Omit<StoredDocument, "json">;

export const MAX_IMAGE_DIM = 4096;
// Uploads in these formats are stored unchanged when they don't need shrinking. JPEG and WebP
// are always redrawn, which strips EXIF data (such as a photo's location) and applies its rotation.
const KEPT_TYPES = ["image/png", "image/gif"];
const THUMB_DIM = 128;

export class StorageFullError extends Error {
  constructor() {
    super("The browser is out of storage space for smoothstep.");
    this.name = "StorageFullError";
  }
}

// Opened on first use, so a browser that blocks IndexedDB fails inside a promise (and the app
// can say so) rather than when this module loads.
let stores: {documents: UseStore; images: UseStore} | null = null;
function store(name: "documents" | "images"): UseStore {
  stores ??= {
    documents: createStore("smoothstep-documents", "documents"),
    images: createStore("smoothstep-images", "images"),
  };
  return stores[name];
}

async function write<T>(op: () => Promise<T>): Promise<T> {
  try {
    return await op();
  } catch (error) {
    if (error instanceof DOMException && error.name === "QuotaExceededError") {
      throw new StorageFullError();
    }
    throw error;
  }
}

// Object URLs for every stored image, so textures can be drawn synchronously.
const imageURLs = new Map<string, string>();
const imageListeners = new Set<() => void>();

export function onImagesChanged(listener: () => void): () => void {
  imageListeners.add(listener);
  return () => imageListeners.delete(listener);
}

function imagesChanged() {
  imageListeners.forEach(listener => listener());
}

export function newId(): string {
  // 12 hex characters, the same shape as ids from the old hosted smoothstep.io.
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
}

export async function init(): Promise<void> {
  // Ask the browser not to evict our data under storage pressure (best effort).
  navigator.storage?.persist?.().catch(() => {});
  const images = await values<StoredImage>(store("images"));
  images.forEach(cacheImageURL);
  imagesChanged();
}

function cacheImageURL(image: StoredImage) {
  const old = imageURLs.get(image.id);
  if (old) {
    URL.revokeObjectURL(old);
  }
  imageURLs.set(image.id, URL.createObjectURL(image.blob));
}

export function imageURL(id: string): string | null {
  return imageURLs.get(id) ?? null;
}

// Images from an animation opened from a link, kept in memory until that animation is saved.
const temporaryImages = new Map<string, Blob>();

export function addTemporaryImage(id: string, blob: Blob) {
  if (imageURLs.has(id)) {
    return;  // Images never change, so one with the same id is already here.
  }
  temporaryImages.set(id, blob);
  imageURLs.set(id, URL.createObjectURL(blob));
  imagesChanged();
}

async function storeTemporaryImages(json: AnimationDocument) {
  for (const slot of json.textures) {
    const blob = slot.isUserUploaded ? temporaryImages.get(slot.url) : undefined;
    if (blob) {
      let image: {width: number; height: number};
      try {
        image = await loadImage(blob);
      } catch (error) {
        console.warn(error);  // It never showed, so save the animation without it.
        continue;
      }
      await putImage({
        id: slot.url, filename: slot.url + "." + (blob.type.split("/")[1] ?? "png"),
        width: image.width, height: image.height, created: Date.now(), blob,
      });
      temporaryImages.delete(slot.url);
    }
  }
}

export async function listDocuments(): Promise<DocumentSummary[]> {
  const docs = await values<StoredDocument>(store("documents"));
  docs.sort((a, b) => b.modified - a.modified);
  return docs.map(({id, title, created, modified, thumbnail}) => ({id, title, created, modified, thumbnail}));
}

export async function allDocuments(): Promise<StoredDocument[]> {
  return values<StoredDocument>(store("documents"));
}

export async function getDocument(id: string): Promise<StoredDocument | undefined> {
  return get<StoredDocument>(id, store("documents"));
}

// Saves over `id`, or as a new animation when id is null. Returns the id.
export async function saveDocument(
  id: string | null, json: AnimationDocument, frameDataURL: string | null,
): Promise<string> {
  await storeTemporaryImages(json);
  const now = Date.now();
  const existing = id ? await getDocument(id) : undefined;
  const record: StoredDocument = {
    id: id ?? newId(),
    title: json.title,
    created: existing ? existing.created : now,
    modified: now,
    json,
    thumbnail: frameDataURL ? await thumbnailDataURL(frameDataURL) : (existing?.thumbnail ?? null),
  };
  await write(() => set(record.id, record, store("documents")));
  return record.id;
}

export async function putDocument(record: StoredDocument): Promise<void> {
  await write(() => set(record.id, record, store("documents")));
}

export async function deleteDocument(id: string): Promise<void> {
  await del(id, store("documents"));
}

export async function listImages(): Promise<StoredImage[]> {
  const images = await values<StoredImage>(store("images"));
  images.sort((a, b) => b.created - a.created);
  return images;
}

export async function getImage(id: string): Promise<StoredImage | undefined> {
  const temporary = temporaryImages.get(id);
  if (temporary) {
    return {id, filename: id + ".png", width: 0, height: 0, created: Date.now(), blob: temporary};
  }
  return get<StoredImage>(id, store("images"));
}

export async function putImage(record: StoredImage): Promise<void> {
  await write(() => set(record.id, record, store("images")));
  cacheImageURL(record);
  imagesChanged();
}

export async function deleteImage(id: string): Promise<void> {
  await del(id, store("images"));
  const url = imageURLs.get(id);
  if (url) {
    URL.revokeObjectURL(url);
    imageURLs.delete(id);
  }
  imagesChanged();
}

let maxTextureSize: number | null = null;
function textureSizeLimit(): number {
  // The GPU's own limit, when it's below MAX_IMAGE_DIM.
  if (maxTextureSize === null) {
    const gl = document.createElement("canvas").getContext("webgl2");
    maxTextureSize = (gl?.getParameter(gl.MAX_TEXTURE_SIZE) as number | undefined) || MAX_IMAGE_DIM;
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
  }
  return Math.min(MAX_IMAGE_DIM, maxTextureSize);
}

// Stores an image file the user picked: a small PNG or GIF as is, anything else redrawn (and
// shrunk to fit if needed) as JPEG for a JPEG and PNG otherwise.
export async function addUploadedImage(file: File): Promise<StoredImage> {
  const image = await loadImage(file);
  const scale = Math.min(1, textureSizeLimit() / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  let blob: Blob = file;
  if (scale < 1 || !KEPT_TYPES.includes(file.type)) {
    const type = file.type === "image/jpeg" ? "image/jpeg" : "image/png";
    blob = await drawToBlob(image, width, height, type);
  }
  const record: StoredImage = {
    id: newId(), filename: file.name || "image.png", width, height, created: Date.now(), blob,
  };
  await putImage(record);
  return record;
}

function loadImage(src: Blob | string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = src instanceof Blob ? URL.createObjectURL(src) : src;
    const done = () => {
      if (src instanceof Blob) {
        URL.revokeObjectURL(url);
      }
    };
    const image = new Image();
    image.onload = () => {done(); resolve(image);};
    image.onerror = () => {done(); reject(new Error("Not a readable image"));};
    image.src = url;
  });
}

function drawToCanvas(image: HTMLImageElement, width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("No 2D canvas");
  }
  context.drawImage(image, 0, 0, width, height);
  return canvas;
}

async function drawToBlob(image: HTMLImageElement, width: number, height: number, type: string): Promise<Blob> {
  const canvas = drawToCanvas(image, width, height);
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, type, 0.92));
  if (!blob) {
    throw new Error("Could not encode image");
  }
  return blob;
}

async function thumbnailDataURL(dataURL: string): Promise<string> {
  const image = await loadImage(dataURL);
  const scale = Math.min(1, THUMB_DIM / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  return drawToCanvas(image, width, height).toDataURL("image/png");
}
