// Files for moving animations in and out of the browser (formats in FILE_FORMATS.md):
// one animation as `<title>.smoothstep.json` with its uploads embedded, or everything as a zip.
import { strFromU8, strToU8, unzip, zip, type Unzipped } from 'fflate';

import { canonicalJSON, parseDocument, type AnimationDocument } from './document';
import * as localStore from './localStore';
import type { StoredDocument } from './localStore';

export const ANIMATION_FORMAT = "smoothstep-animation";
export const EXPORT_FORMAT = "smoothstep-export";
const VERSION = 1;
const ID_PATTERN = /^[a-f0-9]{1,32}$/;

const IMAGE_EXTENSIONS: Record<string, string> = {
  "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif",
};

export interface ImportSummary {
  animations: number;
  images: number;
  unchanged: number;
  failed: number;
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
  return "data:" + (blob.type || imageType(bytes)) + ";base64," + bytesToBase64(bytes);
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

function imageDataURLBytes(dataURL: unknown): Uint8Array {
  if (typeof dataURL !== "string" || !/^data:image\/[\w+.-]+;base64,/.test(dataURL)) {
    throw new Error("Bad image data");
  }
  return dataURLBytes(dataURL);
}

function pngDataURL(bytes: Uint8Array): string {
  return "data:image/png;base64," + bytesToBase64(bytes);
}

// An image's type from its first bytes; PNG if unrecognised.
export function imageType(bytes: Uint8Array): string {
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {return "image/jpeg";}
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") {return "image/webp";}
  if (ascii(0, 3) === "GIF") {return "image/gif";}
  return "image/png";
}

export function validThumbnail(value: unknown): string | null {
  return typeof value === "string" && value.startsWith("data:image/png;base64,") ? value : null;
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
  const images: Record<string, {filename: string; width: number; height: number; data: string}> = {};
  for (const imageId of userImageIds(record.json)) {
    const image = await localStore.getImage(imageId);
    if (image && !images[imageId]) {
      images[imageId] = {
        filename: image.filename, width: image.width, height: image.height,
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
  const files: Record<string, Uint8Array> = {};
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
    files[entry.file!] = strToU8(JSON.stringify(doc.json, null, 1));
    const thumbnail = validThumbnail(doc.thumbnail);
    if (thumbnail) {
      entry.thumbnail = "thumbnails/" + doc.id + ".png";
      files[entry.thumbnail] = dataURLBytes(thumbnail);
    }
    manifest.animations.push(entry);
  }
  for (const image of images) {
    const file = "images/" + image.id + "." + (IMAGE_EXTENSIONS[image.blob.type] ?? "png");
    files[file] = new Uint8Array(await image.blob.arrayBuffer());
    manifest.images.push({
      id: image.id, filename: image.filename, width: image.width, height: image.height,
      created: iso(image.created), file,
    });
  }
  files["manifest.json"] = strToU8(JSON.stringify(manifest, null, 1));
  const bytes = await new Promise<Uint8Array>((resolve, reject) =>
    zip(files, {level: 0}, (err, data) => err ? reject(err) : resolve(data)));
  return {
    blob: new Blob([bytes as Uint8Array<ArrayBuffer>], {type: "application/zip"}),
    filename: "smoothstep-animations-" + new Date().toISOString().slice(0, 10) + ".zip",
    count: docs.length,
  };
}

// Import.

interface Known {
  ids: Set<string>;
  contents: Set<string>;
}

async function knownDocuments(): Promise<Known> {
  const docs = await localStore.allDocuments();
  return {
    ids: new Set(docs.map(d => d.id)),
    contents: new Set(docs.map(d => canonicalJSON(d.json))),
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
  if (!hasId && known.contents.has(content)) {
    summary.unchanged += 1;
    return;
  }
  if (known.ids.has(id)) {
    const existing = await localStore.getDocument(id);
    if (existing && canonicalJSON(existing.json) === content) {
      summary.unchanged += 1;
      return;
    }
    if (existing && existing.modified > modified) {
      // Would be saved alongside; unless an earlier import already did that.
      if (known.contents.has(content)) {
        summary.unchanged += 1;
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
  known.contents.add(content);
  summary.animations += 1;
}

interface ImageEntry {
  id?: unknown;
  filename?: unknown;
  width?: unknown;
  height?: unknown;
  created?: unknown;
}

async function importImage(entry: ImageEntry, bytes: Uint8Array, summary: ImportSummary) {
  if (typeof entry.id !== "string" || !ID_PATTERN.test(entry.id)) {
    throw new Error("Bad image id");
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
    blob: new Blob([bytes as Uint8Array<ArrayBuffer>], {type: imageType(bytes)}),
  });
  summary.images += 1;
}

async function importAnimationFile(obj: unknown, summary: ImportSummary, known: Known) {
  const file = obj as Record<string, unknown>;
  if (file && file.format === ANIMATION_FORMAT) {
    const images = (file.images ?? {}) as Record<string, ImageEntry & {data?: unknown}>;
    for (const [id, image] of Object.entries(images)) {
      await importImage({...image, id}, imageDataURLBytes(image.data), summary);
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
    throw new Error("Not a smoothstep export");
  }
  const file = (name: unknown) => typeof name === "string" ? files[prefix + name] : undefined;
  for (const image of (manifest.images ?? []) as (ImageEntry & {file?: unknown})[]) {
    try {
      const data = file(image.file);
      if (!data) {throw new Error("missing " + String(image.file));}
      await importImage(image, data, summary);
    } catch (error) {
      console.warn(error);
      summary.failed += 1;
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
      console.warn(error);
      summary.failed += 1;
    }
  }
}

export async function importFiles(files: Iterable<File>): Promise<ImportSummary> {
  const summary: ImportSummary = {animations: 0, images: 0, unchanged: 0, failed: 0};
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
      console.warn(error);
      summary.failed += 1;
    }
  }
  return summary;
}

export function importMessage({animations, images, unchanged, failed}: ImportSummary): string {
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
  return parts.join(" ");
}
