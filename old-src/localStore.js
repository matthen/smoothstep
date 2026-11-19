// Animations and uploaded textures kept in the browser's IndexedDB.
//
// documents: {id, title, created, modified (ms since epoch), json (document JSON),
//             thumbnail (128px PNG data URL)}
// images:    {id, filename, width, height, created, blob (PNG, JPEG, WebP or GIF, at most
//             4096px)}
import { createStore, del, get, set, values } from 'idb-keyval';

const MAX_IMAGE_DIM = 4096;
// Uploads in these formats are stored unchanged when they don't need shrinking.
const KEPT_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const THUMB_DIM = 128;

// Opened on first use, so a browser that blocks IndexedDB fails inside a promise (and
// gets an alert) rather than at import.
let stores = null;
function store(name) {
  if (!stores) {
    stores = {
      documents: createStore("smoothstep-documents", "documents"),
      images: createStore("smoothstep-images", "images"),
    };
  }
  return stores[name];
}

// Object URLs for every stored image, so textures can be drawn synchronously.
const imageURLs = {};

export function newId() {
  // 12 hex characters, the same shape as ids from the old hosted smoothstep.io.
  const bytes = window.crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
}

export async function init() {
  // Ask the browser not to evict our data under storage pressure (best effort).
  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persist().catch(() => {});
  }
  const images = await values(store("images"));
  images.forEach(cacheImageURL);
}

function cacheImageURL(image) {
  if (imageURLs[image.id]) {
    URL.revokeObjectURL(imageURLs[image.id]);
  }
  imageURLs[image.id] = URL.createObjectURL(image.blob);
}

export function imageURL(id) {
  return imageURLs[id] || null;
}

export async function listDocuments() {
  const docs = await values(store("documents"));
  docs.sort((a, b) => b.modified - a.modified);
  return docs.map(({id, title, created, modified, thumbnail}) => (
    {id, title, created, modified, thumbnail}));
}

export async function getDocument(id) {
  return get(id, store("documents"));
}

export async function saveDocument(id, json, frameDataURL) {
  // Saves over `id`, or as a new animation when id is null. Returns the id.
  const now = Date.now();
  const existing = id ? await get(id, store("documents")) : null;
  const record = {
    id: id || newId(),
    title: json.title,
    created: existing ? existing.created : now,
    modified: now,
    json: json,
    thumbnail: frameDataURL ? await thumbnailDataURL(frameDataURL) : (existing && existing.thumbnail),
  };
  await set(record.id, record, store("documents"));
  return record.id;
}

export async function putDocument(record) {
  return set(record.id, record, store("documents"));
}

export async function deleteDocument(id) {
  return del(id, store("documents"));
}


export async function listImages() {
  const images = await values(store("images"));
  images.sort((a, b) => b.created - a.created);
  return images;
}

export async function getImage(id) {
  return get(id, store("images"));
}

export async function putImage(record) {
  await set(record.id, record, store("images"));
  cacheImageURL(record);
}

export async function deleteImage(id) {
  await del(id, store("images"));
  if (imageURLs[id]) {
    URL.revokeObjectURL(imageURLs[id]);
    delete imageURLs[id];
  }
}

let maxTextureSize = null;
function textureSizeLimit() {
  // The GPU's own limit, when it's below MAX_IMAGE_DIM.
  if (maxTextureSize === null) {
    const gl = document.createElement("canvas").getContext("webgl2");
    maxTextureSize = (gl && gl.getParameter(gl.MAX_TEXTURE_SIZE)) || MAX_IMAGE_DIM;
    const lose = gl && gl.getExtension("WEBGL_lose_context");
    if (lose) {lose.loseContext();}
  }
  return Math.min(MAX_IMAGE_DIM, maxTextureSize);
}

export async function addUploadedImage(file) {
  // Store an image file the user picked. It's kept as is when small enough; otherwise
  // shrunk to fit, as JPEG for a JPEG and PNG for anything else.
  const bitmap = await loadBitmap(file);
  const scale = Math.min(1, textureSizeLimit() / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  let blob = file;
  if (scale < 1 || !KEPT_TYPES.includes(file.type)) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d").drawImage(bitmap, 0, 0, width, height);
    const type = file.type === "image/jpeg" ? "image/jpeg" : "image/png";
    blob = await new Promise(resolve => canvas.toBlob(resolve, type, 0.92));
    if (!blob) {
      throw new Error("Could not encode image");
    }
  }
  const record = {
    id: newId(), filename: file.name || "image.png", width, height,
    created: Date.now(), blob,
  };
  await putImage(record);
  return record;
}

function loadBitmap(src) {
  // Decode a Blob or URL into something drawable on a canvas.
  return new Promise((resolve, reject) => {
    const isBlob = src instanceof Blob;
    const url = isBlob ? URL.createObjectURL(src) : src;
    const image = new Image();
    image.onload = () => {
      if (isBlob) {URL.revokeObjectURL(url);}
      resolve(image);
    };
    image.onerror = () => {
      if (isBlob) {URL.revokeObjectURL(url);}
      reject(new Error("Not a readable image"));
    };
    image.src = url;
  });
}

async function thumbnailDataURL(dataURL) {
  const image = await loadBitmap(dataURL);
  const scale = Math.min(1, THUMB_DIM / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/png");
}
