// Files for moving animations in and out of the browser. Formats (see FILE_FORMATS.md):
// - One animation: a .json file {format: "smoothstep-animation", version: 1, id, title,
//   created, modified, thumbnail, document, images: {<id>: {filename, width, height, data}}}
//   with its uploaded textures embedded as data URLs.
// - Everything (also what the old hosted smoothstep.io's "Download my data" produced): a
//   .zip with manifest.json, animations/<id>.json (document JSON), thumbnails/<id>.png
//   and images/<id>.<png|jpg|webp|gif>.
import { strFromU8, strToU8, unzip, zip } from 'fflate';

import * as localStore from './localStore';

export const ANIMATION_FORMAT = "smoothstep-animation";
export const EXPORT_FORMAT = "smoothstep-export";
const VERSION = 1;
const ASPECT_RATIOS = ["1,1", "4,3", "16,9", "3,4", "9,16"];

const TRANSITION_TYPES = ["step", "linear", "smoothstep"];

export function validateDocument(json) {
  // The checks the old hosted smoothstep.io applied when saving; throws on a bad document.
  const fail = (message) => {throw new Error("Invalid animation: " + message);};
  if (!json || typeof json !== "object") {fail("not an object");}
  if (json.aspectRatio === undefined) {
    json.aspectRatio = [1, 1];  // Documents saved before aspect ratios existed.
  }
  if (typeof json.title !== "string") {fail("title");}
  if (typeof json.code !== "string") {fail("code");}
  if (typeof json.duration !== "number" || !(json.duration > 0)) {fail("duration");}
  if (!Array.isArray(json.aspectRatio) || !json.aspectRatio.every(Number.isInteger) ||
      !ASPECT_RATIOS.includes(json.aspectRatio.join(","))) {
    fail("aspectRatio");
  }
  if (!Array.isArray(json.textures)) {fail("textures");}
  json.textures.forEach((texture, i) => {
    if (!texture || typeof texture.url !== "string" || texture.id !== "iTexture" + i) {
      fail("texture " + i);
    }
  });
  if (!Array.isArray(json.variables) || json.variables.length !== 16) {fail("variables");}
  json.variables.forEach((variable, i) => {
    if (!variable || !Array.isArray(variable.transitions)) {fail("variable " + i);}
    variable.transitions.forEach(t => {
      const ok = t && Number.isInteger(t.startDSecs) && t.startDSecs >= 0 &&
        Number.isInteger(t.endDSecs) && t.endDSecs > t.startDSecs &&
        typeof t.startValue === "number" && typeof t.endValue === "number" &&
        TRANSITION_TYPES.includes(t.type);
      if (!ok) {fail("transition in variable " + i);}
    });
  });
  return json;
}

function userImageIds(json) {
  return json.textures.filter(t => t.isUserUploaded).map(t => t.url);
}

function safeFilename(title) {
  return (title || "animation").replace(/[^\w\- ]+/g, "").trim() || "animation";
}

function iso(ms) {
  return new Date(ms).toISOString();
}

function parseTime(value, fallback) {
  const ms = Date.parse(value);
  return isNaN(ms) ? fallback : ms;
}

function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function dataURLToBlob(dataURL) {
  if (typeof dataURL !== "string" || !dataURL.startsWith("data:image/")) {
    throw new Error("Bad image data");
  }
  return (await fetch(dataURL)).blob();
}

const IMAGE_EXTENSIONS = {
  "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif",
};

async function imageType(data) {
  // An image's type from its first bytes (data: Uint8Array or Blob); PNG if unrecognised.
  const b = data instanceof Blob ? new Uint8Array(await data.slice(0, 12).arrayBuffer()) : data;
  const ascii = (start, end) => String.fromCharCode(...b.subarray(start, end));
  if (b[0] === 0xff && b[1] === 0xd8) {return "image/jpeg";}
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") {return "image/webp";}
  if (ascii(0, 3) === "GIF") {return "image/gif";}
  return "image/png";
}

function pngDataURL(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return "data:image/png;base64," + btoa(binary);
}

function dataURLBytes(dataURL) {
  const binary = atob(dataURL.split(",")[1]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function download(blob, filename) {
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

export async function animationFile(record) {
  // record: as stored in localStore (thumbnail may be null).
  const images = {};
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

export async function exportAll() {
  const docs = await Promise.all(
    (await localStore.listDocuments()).map(d => localStore.getDocument(d.id)));
  const images = await localStore.listImages();
  const files = {};
  const manifest = {
    format: EXPORT_FORMAT, version: VERSION, exported: new Date().toISOString(),
    animations: [], images: [],
  };
  for (const doc of docs) {
    const entry = {
      id: doc.id, title: doc.title, created: iso(doc.created), modified: iso(doc.modified),
      file: "animations/" + doc.id + ".json",
    };
    files[entry.file] = strToU8(JSON.stringify(doc.json, null, 1));
    if (validThumbnail(doc.thumbnail)) {
      entry.thumbnail = "thumbnails/" + doc.id + ".png";
      files[entry.thumbnail] = dataURLBytes(doc.thumbnail);
    }
    manifest.animations.push(entry);
  }
  for (const image of images) {
    const entry = {
      id: image.id, filename: image.filename, width: image.width, height: image.height,
      created: iso(image.created),
      file: "images/" + image.id + "." + (IMAGE_EXTENSIONS[image.blob.type] || "png"),
    };
    files[entry.file] = new Uint8Array(await image.blob.arrayBuffer());
    manifest.images.push(entry);
  }
  files["manifest.json"] = strToU8(JSON.stringify(manifest, null, 1));
  const bytes = await new Promise((resolve, reject) =>
    zip(files, {level: 0}, (err, data) => err ? reject(err) : resolve(data)));
  return {
    blob: new Blob([bytes], {type: "application/zip"}),
    filename: "smoothstep-animations-" + new Date().toISOString().slice(0, 10) + ".zip",
    count: docs.length,
  };
}

// Import.

function canonicalJSON(value) {
  // JSON with object keys sorted, so documents compare equal whatever wrote them.
  if (Array.isArray(value)) {
    return "[" + value.map(canonicalJSON).join(",") + "]";
  }
  if (value && typeof value === "object") {
    return "{" + Object.keys(value).sort().map(
      k => JSON.stringify(k) + ":" + canonicalJSON(value[k])).join(",") + "}";
  }
  return JSON.stringify(value);
}

async function knownDocuments() {
  // {ids: Set, contents: Set of canonicalJSON} for the animations already stored.
  const docs = await Promise.all(
    (await localStore.listDocuments()).map(d => localStore.getDocument(d.id)));
  return {
    ids: new Set(docs.map(d => d.id)),
    contents: new Set(docs.map(d => canonicalJSON(d.json))),
  };
}

function validThumbnail(value) {
  return typeof value === "string" && value.startsWith("data:image/png;base64,") ? value : null;
}

async function importAnimation(entry, summary, known) {
  // entry: {id, title, created, modified, thumbnail, json}. Skips an animation already
  // stored. Keeps the id unless that would overwrite a newer local copy; then saves alongside it.
  // Identical animations under different ids (e.g. two untouched saves) are all kept.
  validateDocument(entry.json);
  const content = canonicalJSON(entry.json);
  const unchanged = () => {summary.unchanged += 1;};
  const now = Date.now();
  const hasId = /^[a-f0-9]{1,32}$/.test(entry.id || "");
  let id = hasId ? entry.id : localStore.newId();
  const modified = parseTime(entry.modified, now);
  if (!hasId && known.contents.has(content)) {
    return unchanged();
  }
  if (known.ids.has(id)) {
    const existing = await localStore.getDocument(id);
    if (canonicalJSON(existing.json) === content) {
      return unchanged();
    }
    if (existing.modified > modified) {
      // Would be saved alongside; unless an earlier import already did that.
      if (known.contents.has(content)) {
        return unchanged();
      }
      id = localStore.newId();
    }
  }
  await localStore.putDocument({
    id, title: entry.json.title,
    created: parseTime(entry.created, now), modified,
    json: entry.json, thumbnail: validThumbnail(entry.thumbnail),
  });
  known.ids.add(id);
  known.contents.add(content);
  summary.animations += 1;
}

async function importImage(entry, blob, summary) {
  if (!/^[a-f0-9]{1,32}$/.test(entry.id || "")) {
    throw new Error("Bad image id");
  }
  if (await localStore.getImage(entry.id)) {
    return;  // Uploaded images never change, so a copy with the same id is the same image.
  }
  await localStore.putImage({
    id: entry.id, filename: entry.filename || entry.id + ".png",
    width: entry.width, height: entry.height,
    created: parseTime(entry.created, Date.now()),
    blob: new Blob([blob], {type: await imageType(blob)}),
  });
  summary.images += 1;
}

async function importAnimationFile(obj, summary, known) {
  if (obj.format === ANIMATION_FORMAT) {
    for (const [id, image] of Object.entries(obj.images || {})) {
      await importImage({...image, id}, await dataURLToBlob(image.data), summary);
    }
    await importAnimation({...obj, json: obj.document}, summary, known);
  } else {
    // A bare document JSON.
    await importAnimation({json: obj}, summary, known);
  }
}

async function importZip(bytes, summary, known) {
  const files = await new Promise((resolve, reject) =>
    unzip(bytes, (err, data) => err ? reject(err) : resolve(data)));
  // Allow the zip to have been re-made with everything inside one folder.
  const names = Object.keys(files);
  const manifestName = names.find(n => n === "manifest.json" || n.endsWith("/manifest.json"));
  if (!manifestName) {
    throw new Error("No manifest.json in zip");
  }
  const prefix = manifestName.slice(0, -"manifest.json".length);
  const manifest = JSON.parse(strFromU8(files[manifestName]));
  if (manifest.format !== EXPORT_FORMAT) {
    throw new Error("Not a smoothstep export");
  }
  const file = (name) => name && files[prefix + name];
  for (const image of manifest.images || []) {
    try {
      const data = file(image.file);
      if (!data) {throw new Error("missing " + image.file);}
      await importImage(image, data, summary);
    } catch (error) {
      console.log(error);
      summary.failed += 1;
    }
  }
  for (const anim of manifest.animations || []) {
    try {
      const data = file(anim.file);
      if (!data) {throw new Error("missing " + anim.file);}
      const thumb = file(anim.thumbnail);
      await importAnimation({
        ...anim, json: JSON.parse(strFromU8(data)),
        thumbnail: thumb ? pngDataURL(thumb) : null,
      }, summary, known);
    } catch (error) {
      console.log(error);
      summary.failed += 1;
    }
  }
}

export async function importFiles(fileList) {
  // Returns {animations, images, unchanged, failed} counts.
  const summary = {animations: 0, images: 0, unchanged: 0, failed: 0};
  const known = await knownDocuments();
  for (const file of Array.from(fileList)) {
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
      if (isZip) {
        await importZip(bytes, summary, known);
      } else {
        await importAnimationFile(JSON.parse(strFromU8(bytes)), summary, known);
      }
    } catch (error) {
      console.log(error);
      summary.failed += 1;
    }
  }
  return summary;
}
