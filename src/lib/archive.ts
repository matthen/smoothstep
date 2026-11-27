// Files for moving animations in and out of the browser (formats in FILE_FORMATS.md):
// one animation as `<title>.smoothstep.json` with its uploads embedded, or everything as a zip.
import { strFromU8, strToU8, unzip, Zip, ZipPassThrough, type Unzipped } from 'fflate';

import { canonicalJSON, parseDocument, type AnimationDocument } from './document';
import * as localStore from './localStore';
import type { StoredDocument } from './localStore';
import { extensionType, isVideoType, mediaExtension, mediaType } from './media';

export const ANIMATION_FORMAT = "smoothstep-animation";
const EXPORT_FORMAT = "smoothstep-export";
const VERSION = 1;
const ID_PATTERN = /^[a-f0-9]{1,32}$/;

export interface ImportSummary {
  animations: number;
  images: number;
  unchanged: number;
  failed: number;
  // Why each refused image or video was refused.
  refused: string[];
  // Every animation in the files, added or already here, so one can be opened.
  ids: string[];
}

export interface DownloadableFile {
  blob: Blob;
  filename: string;
}

function userImageIds(json: AnimationDocument): string[] {
  return json.textures.filter(t => t.isUserUploaded).map(t => t.url);
}

export function safeFilename(title: string): string {
  return title.replace(/[^\w\- ]+/g, "").trim() || "animation";
}

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

function parseTime(value: unknown, fallback: number): number {
  const ms = typeof value === "string" ? Date.parse(value) : NaN;
  return Number.isNaN(ms) ? fallback : ms;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

async function blobToDataURL(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return "data:" + (blob.type || mediaType(bytes)) + ";base64," + bytesToBase64(bytes);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function dataURLBytes(dataURL: string): Uint8Array {
  return base64ToBytes(dataURL.split(",")[1] ?? "");
}

// An embedded image's or video's bytes, and the type its data URL gives.
export function readMediaDataURL(dataURL: unknown): {bytes: Uint8Array; type: string} {
  const match = typeof dataURL === "string" ? /^data:((image|video)\/[\w+.-]+);base64,/.exec(dataURL) : null;
  if (!match) {
    throw new Error("Bad image data");
  }
  return {bytes: dataURLBytes(dataURL as string), type: match[1]!};
}

function pngDataURL(bytes: Uint8Array): string {
  return "data:image/png;base64," + bytesToBase64(bytes);
}

function validThumbnail(value: unknown): string | null {
  return typeof value === "string" && value.startsWith("data:image/png;base64,") ? value : null;
}

// A zip of stored files, written as each is added so its bytes needn't be held until the end.
export function zipWriter() {
  const parts: Blob[] = [];
  let failure: Error | null = null;
  const zip = new Zip((error, chunk) => {
    if (error) failure = error;
    else parts.push(new Blob([chunk]));
  });
  return {
    add(name: string, bytes: Uint8Array) {
      const file = new ZipPassThrough(name);
      zip.add(file);
      file.push(bytes, true);
    },
    finish(): Blob {
      zip.end();
      if (failure) throw failure;
      return new Blob(parts, {type: "application/zip"});
    },
  };
}

export function download({blob, filename}: DownloadableFile): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// Export.

export async function animationFile(record: StoredDocument): Promise<DownloadableFile> {
  const images: Record<string, {filename: string; width: number; height: number; duration?: number; data: string}> = {};
  for (const imageId of userImageIds(record.json)) {
    const image = await localStore.getImage(imageId);
    if (image && !images[imageId]) {
      images[imageId] = {
        filename: image.filename, width: image.width, height: image.height,
        ...(image.duration === undefined ? {} : {duration: image.duration}),
        data: await blobToDataURL(image.blob),
      };
    }
  }
  const file = {
    format: ANIMATION_FORMAT, version: VERSION,
    id: record.id, title: record.title,
    created: iso(record.created), modified: iso(record.modified),
    thumbnail: validThumbnail(record.thumbnail),
    document: record.json,
    images,
  };
  return {
    blob: new Blob([JSON.stringify(file, null, 1)], {type: "application/json"}),
    filename: safeFilename(record.title) + ".smoothstep.json",
  };
}

export async function exportAll(): Promise<DownloadableFile & {count: number}> {
  const docs = (await localStore.allDocuments()).sort((a, b) => b.modified - a.modified);
  const images = await localStore.listImages();
  const files = zipWriter();
  const manifest = {
    format: EXPORT_FORMAT, version: VERSION, exported: new Date().toISOString(),
    animations: [] as Record<string, string>[],
    images: [] as Record<string, string | number>[],
  };
  for (const doc of docs) {
    const entry: Record<string, string> = {
      id: doc.id, title: doc.title, created: iso(doc.created), modified: iso(doc.modified),
      file: "animations/" + doc.id + ".json",
    };
    files.add(entry.file!, strToU8(JSON.stringify(doc.json, null, 1)));
    const thumbnail = validThumbnail(doc.thumbnail);
    if (thumbnail) {
      entry.thumbnail = "thumbnails/" + doc.id + ".png";
      files.add(entry.thumbnail, dataURLBytes(thumbnail));
    }
    manifest.animations.push(entry);
  }
  for (const image of images) {
    const file = "images/" + image.id + "." + mediaExtension(image.blob.type);
    files.add(file, new Uint8Array(await image.blob.arrayBuffer()));
    manifest.images.push({
      id: image.id, filename: image.filename, width: image.width, height: image.height,
      created: iso(image.created), file, type: image.blob.type,
      ...(image.duration === undefined ? {} : {duration: image.duration}),
    });
  }
  files.add("manifest.json", strToU8(JSON.stringify(manifest, null, 1)));
  return {
    blob: files.finish(),
    filename: "smoothstep-animations-" + new Date().toISOString().slice(0, 10) + ".zip",
    count: docs.length,
  };
}

// Import.

interface Known {
  ids: Set<string>;
  // Each stored animation's id, by its content.
  contents: Map<string, string>;
}

async function knownDocuments(): Promise<Known> {
  const docs = await localStore.allDocuments();
  return {
    ids: new Set(docs.map(d => d.id)),
    contents: new Map(docs.map(d => [canonicalJSON(d.json), d.id])),
  };
}

interface ImportEntry {
  id?: unknown;
  created?: unknown;
  modified?: unknown;
  thumbnail?: unknown;
  json: unknown;
}

// Skips an animation already stored. Keeps the id unless that would overwrite a newer local
// copy; then saves alongside it. Identical animations under different ids are all kept.
async function importAnimation(entry: ImportEntry, summary: ImportSummary, known: Known) {
  const json = parseDocument(entry.json);
  const content = canonicalJSON(json);
  const now = Date.now();
  const hasId = typeof entry.id === "string" && ID_PATTERN.test(entry.id);
  let id = hasId ? entry.id as string : localStore.newId();
  const modified = parseTime(entry.modified, now);
  const same = known.contents.get(content);
  if (!hasId && same) {
    summary.unchanged += 1;
    summary.ids.push(same);
    return;
  }
  if (known.ids.has(id)) {
    const existing = await localStore.getDocument(id);
    if (existing && canonicalJSON(existing.json) === content) {
      summary.unchanged += 1;
      summary.ids.push(id);
      return;
    }
    if (existing && existing.modified > modified) {
      // Would be saved alongside; unless an earlier import already did that.
      if (same) {
        summary.unchanged += 1;
        summary.ids.push(same);
        return;
      }
      id = localStore.newId();
    }
  }
  await localStore.putDocument({
    id, title: json.title, created: parseTime(entry.created, now), modified,
    json, thumbnail: validThumbnail(entry.thumbnail),
  });
  known.ids.add(id);
  known.contents.set(content, id);
  summary.animations += 1;
  summary.ids.push(id);
}

interface ImageEntry {
  id?: unknown;
  filename?: unknown;
  width?: unknown;
  height?: unknown;
  created?: unknown;
  duration?: unknown;
}

// `storedType` is the type it was exported with, kept if its bytes aren't recognised.
async function importImage(entry: ImageEntry, bytes: Uint8Array, summary: ImportSummary, storedType: unknown) {
  if (typeof entry.id !== "string" || !ID_PATTERN.test(entry.id)) {
    throw new Error("Bad image id");
  }
  const type = mediaType(bytes, storedType);
  if (isVideoType(type)) {
    localStore.checkVideo(bytes.length, Number(entry.width) || 0, Number(entry.height) || 0);
  }
  if (await localStore.getImage(entry.id)) {
    return;  // Uploaded images never change, so a copy with the same id is the same image.
  }
  await localStore.putImage({
    id: entry.id,
    filename: typeof entry.filename === "string" ? entry.filename : entry.id + ".png",
    width: typeof entry.width === "number" ? entry.width : 0,
    height: typeof entry.height === "number" ? entry.height : 0,
    created: parseTime(entry.created, Date.now()),
    blob: new Blob([bytes as Uint8Array<ArrayBuffer>], {type}),
    ...(isVideoType(type) && typeof entry.duration === "number" && Number.isFinite(entry.duration) && entry.duration > 0
      ? {duration: entry.duration} : {}),
  });
  summary.images += 1;
}

async function importAnimationFile(obj: unknown, summary: ImportSummary, known: Known) {
  const file = obj as Record<string, unknown> | null;
  if (file && file.format === ANIMATION_FORMAT) {
    const images = (file.images ?? {}) as Record<string, ImageEntry & {data?: unknown}>;
    for (const [id, image] of Object.entries(images)) {
      const {bytes, type} = readMediaDataURL(image.data);
      await importImage({...image, id}, bytes, summary, type);
    }
    await importAnimation({...file, json: file.document}, summary, known);
  } else {
    await importAnimation({json: obj}, summary, known);  // A bare document JSON.
  }
}

async function importZip(bytes: Uint8Array, summary: ImportSummary, known: Known) {
  const files = await new Promise<Unzipped>((resolve, reject) =>
    unzip(bytes, (err, data) => err ? reject(err) : resolve(data)));
  // The zip may have been re-made with everything inside one folder.
  const manifestName = Object.keys(files).find(n => n === "manifest.json" || n.endsWith("/manifest.json"));
  if (!manifestName) {
    throw new Error("No manifest.json in zip");
  }
  const prefix = manifestName.slice(0, -"manifest.json".length);
  const manifest = JSON.parse(strFromU8(files[manifestName]!)) as Record<string, unknown>;
  if (manifest.format !== EXPORT_FORMAT) {
    throw new Error("Not a smoothstep.io export");
  }
  const file = (name: unknown) => typeof name === "string" ? files[prefix + name] : undefined;
  for (const image of (manifest.images ?? []) as (ImageEntry & {file?: unknown; type?: unknown})[]) {
    try {
      const data = file(image.file);
      if (!data) {throw new Error("missing " + String(image.file));}
      await importImage(image, data, summary, image.type ?? extensionType(image.file));
    } catch (error) {
      failed(summary, error);
    }
  }
  for (const anim of (manifest.animations ?? []) as (ImportEntry & {file?: unknown})[]) {
    try {
      const data = file(anim.file);
      if (!data) {throw new Error("missing " + String(anim.file));}
      const thumb = file(anim.thumbnail);
      await importAnimation({
        ...anim, json: JSON.parse(strFromU8(data)),
        thumbnail: thumb ? pngDataURL(thumb) : null,
      }, summary, known);
    } catch (error) {
      failed(summary, error);
    }
  }
}

function failed(summary: ImportSummary, error: unknown) {
  console.warn(error);
  summary.failed += 1;
  if (error instanceof localStore.UploadError && !summary.refused.includes(error.message)) {
    summary.refused.push(error.message);
  }
}

export async function importFiles(files: Iterable<File>): Promise<ImportSummary> {
  const summary: ImportSummary = {animations: 0, images: 0, unchanged: 0, failed: 0, refused: [], ids: []};
  const known = await knownDocuments();
  for (const file of files) {
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
        await importZip(bytes, summary, known);
      } else {
        await importAnimationFile(JSON.parse(strFromU8(bytes)), summary, known);
      }
    } catch (error) {
      failed(summary, error);
    }
  }
  return summary;
}

// Saves an animation loaded from a link, with its images, unless the same animation is already
// stored. Returns its id.
export async function importDocument(json: AnimationDocument, images: Map<string, Blob>): Promise<string> {
  const same = (await knownDocuments()).contents.get(canonicalJSON(json));
  if (same) {
    return same;
  }
  images.forEach((blob, id) => localStore.addTemporaryImage(id, blob));
  return localStore.saveDocument(null, json, null);
}

export function importMessage({animations, images, unchanged, failed, refused}: ImportSummary): string {
  const plural = (n: number, word: string) => n + " " + word + (n === 1 ? "" : "s");
  const parts: string[] = [];
  if (animations || images || !(unchanged || failed)) {
    parts.push(plural(animations, "animation") + " and " + plural(images, "image") + " added.");
  }
  if (unchanged) {
    parts.push(plural(unchanged, "animation") + " already here.");
  }
  if (failed) {
    parts.push(plural(failed, "item") + " couldn't be read.");
  }
  return [...parts, ...refused].join(" ");
}
