// @vitest-environment node
// Node's own Blob survives fake-indexeddb's structured clone; jsdom's doesn't.
import 'fake-indexeddb/auto';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { beforeEach, describe, expect, it } from 'vitest';

import { animationFile, exportAll, importFiles, imageType, importMessage } from './archive';
import { newDocument, type AnimationDocument } from './document';
import * as localStore from './localStore';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 4, 5, 6]);
const THUMB = "data:image/png;base64," + btoa("thumbnail");

async function clearStore() {
  for (const d of await localStore.allDocuments()) {
    await localStore.deleteDocument(d.id);
  }
  for (const i of await localStore.listImages()) {
    await localStore.deleteImage(i.id);
  }
}

function docWithTexture(title: string, imageId: string | null): AnimationDocument {
  const doc = newDocument();
  doc.title = title;
  doc.code = "void mainImage(out vec4 c, in vec2 p) { c = vec4(1.); } // " + title;
  if (imageId) {
    doc.textures[0] = {id: "iTexture0", url: imageId, isUserUploaded: true};
  }
  doc.variables[2]!.transitions.push({startDSecs: 5, endDSecs: 25, startValue: 0, endValue: 3, type: "smoothstep"});
  return doc;
}

async function seed() {
  await localStore.putImage({
    id: "aaaa00000001", filename: "photo.jpg", width: 10, height: 8, created: 1000,
    blob: new Blob([JPEG], {type: "image/jpeg"}),
  });
  await localStore.putDocument({
    id: "aaaa0000d001", title: "With texture", created: 1000, modified: 2000,
    json: docWithTexture("With texture", "aaaa00000001"), thumbnail: THUMB,
  });
  await localStore.putDocument({
    id: "aaaa0000d002", title: "Plain", created: 3000, modified: 4000,
    json: docWithTexture("Plain", null), thumbnail: null,
  });
}

async function zipFile(): Promise<File> {
  const {blob, filename} = await exportAll();
  return new File([await blob.arrayBuffer()], filename);
}

beforeEach(clearStore);

describe("exportAll", () => {
  it("writes the manifest, documents, thumbnails and images", async () => {
    await seed();
    const files = unzipSync(new Uint8Array(await (await exportAll()).blob.arrayBuffer()));
    expect(Object.keys(files).sort()).toEqual([
      "animations/aaaa0000d001.json", "animations/aaaa0000d002.json", "images/aaaa00000001.jpg",
      "manifest.json", "thumbnails/aaaa0000d001.png",
    ]);
    const manifest = JSON.parse(strFromU8(files["manifest.json"]!)) as {format: string; animations: {id: string}[]};
    expect(manifest.format).toBe("smoothstep-export");
    expect(manifest.animations.map(a => a.id)).toEqual(["aaaa0000d002", "aaaa0000d001"]);
    expect(files["images/aaaa00000001.jpg"]).toEqual(JPEG);
  });
});

describe("importFiles", () => {
  it("round-trips everything into an empty browser", async () => {
    await seed();
    const before = await localStore.allDocuments();
    const file = await zipFile();
    await clearStore();
    const summary = await importFiles([file]);
    expect(summary).toMatchObject({animations: 2, images: 1, unchanged: 0, failed: 0});
    const after = await localStore.allDocuments();
    const byId = (docs: localStore.StoredDocument[]) => Object.fromEntries(docs.map(d => [d.id, d]));
    for (const doc of before) {
      expect(byId(after)[doc.id]).toEqual(doc);
    }
    const image = await localStore.getImage("aaaa00000001");
    expect(image?.blob.type).toBe("image/jpeg");
    expect(new Uint8Array(await image!.blob.arrayBuffer())).toEqual(JPEG);
  });

  it("names the animation a file holds, whether it was added or already here", async () => {
    await seed();
    const [doc] = await localStore.allDocuments();
    const file = await animationFile(doc!);
    const asFile = new File([await file.blob.arrayBuffer()], file.filename);
    expect((await importFiles([asFile])).ids).toEqual([doc!.id]);
    await clearStore();
    expect((await importFiles([asFile])).ids).toEqual([doc!.id]);
  });

  it("changes nothing when importing the same file again", async () => {
    await seed();
    const file = await zipFile();
    expect(await importFiles([file])).toMatchObject({animations: 0, images: 0, unchanged: 2, failed: 0});
    expect(await localStore.allDocuments()).toHaveLength(2);
  });

  it("keeps an edited local copy and adds the older import alongside it, once", async () => {
    await seed();
    const file = await zipFile();
    const doc = (await localStore.getDocument("aaaa0000d002"))!;
    await localStore.putDocument({...doc, json: {...doc.json, code: "// edited"}, modified: Date.now()});
    expect((await importFiles([file])).animations).toBe(1);
    expect((await importFiles([file])).animations).toBe(0);
    expect(await localStore.allDocuments()).toHaveLength(3);
    expect((await localStore.getDocument("aaaa0000d002"))!.json.code).toBe("// edited");
  });

  it("keeps identical animations that have different ids", async () => {
    const json = docWithTexture("Same", null);
    const manifest = {
      format: "smoothstep-export", version: 1, images: [],
      animations: ["aaaa00000011", "aaaa00000012"].map(id => ({id, file: `animations/${id}.json`})),
    };
    const zipped = zipSync({
      "manifest.json": strToU8(JSON.stringify(manifest)),
      "animations/aaaa00000011.json": strToU8(JSON.stringify(json)),
      "animations/aaaa00000012.json": strToU8(JSON.stringify(json)),
    });
    expect((await importFiles([new File([zipped], "x.zip")])).animations).toBe(2);
  });

  it("reads a zip re-made inside a folder, and an old hosted export with a README and PNGs", async () => {
    const json = docWithTexture("Hosted", "bbbb00000001");
    const manifest = {
      format: "smoothstep-export", version: 1,
      animations: [{id: "bbbb0000d001", title: "Hosted", file: "animations/bbbb0000d001.json"}],
      images: [{id: "bbbb00000001", filename: "red.png", width: 8, height: 6, file: "images/bbbb00000001.png"}],
    };
    const zipped = zipSync({
      "export/manifest.json": strToU8(JSON.stringify(manifest)),
      "export/README.txt": strToU8("hello"),
      "export/animations/bbbb0000d001.json": strToU8(JSON.stringify({...json, aspectRatio: undefined})),
      "export/images/bbbb00000001.png": PNG,
    });
    const summary = await importFiles([new File([zipped], "x.zip")]);
    expect(summary).toMatchObject({animations: 1, images: 1, unchanged: 0, failed: 0});
    expect((await localStore.getDocument("bbbb0000d001"))!.json.aspectRatio).toEqual([1, 1]);
    expect((await localStore.getImage("bbbb00000001"))!.blob.type).toBe("image/png");
  });

  it("opens a single animation file, and a bare document", async () => {
    await seed();
    const one = await animationFile((await localStore.getDocument("aaaa0000d001"))!);
    const bare = new File([JSON.stringify(docWithTexture("Bare", null))], "bare.json");
    await clearStore();
    const summary = await importFiles([new File([await one.blob.arrayBuffer()], one.filename), bare]);
    expect(summary).toMatchObject({animations: 2, images: 1, unchanged: 0, failed: 0});
    expect(one.filename).toBe("With texture.smoothstep.json");
    expect(await importFiles([bare])).toMatchObject({animations: 0, images: 0, unchanged: 1, failed: 0});
  });

  it("counts unreadable files and invalid animations as failed", async () => {
    const bad = {...docWithTexture("Bad", null), duration: -1};
    const summary = await importFiles([
      new File(["not json"], "a.json"), new File([JSON.stringify(bad)], "b.json"),
    ]);
    expect(summary).toEqual({animations: 0, images: 0, unchanged: 0, failed: 2, ids: []});
    expect(importMessage(summary)).toBe("2 items couldn't be read.");
  });

  it("drops thumbnails that aren't PNG data URLs", async () => {
    const file = {
      format: "smoothstep-animation", version: 1, id: "cccc0000d001", thumbnail: "https://example.com/x.png",
      document: docWithTexture("T", null), images: {},
    };
    await importFiles([new File([JSON.stringify(file)], "t.smoothstep.json")]);
    expect((await localStore.getDocument("cccc0000d001"))!.thumbnail).toBeNull();
  });
});

describe("imageType", () => {
  it("reads the type from the bytes", () => {
    expect(imageType(JPEG)).toBe("image/jpeg");
    expect(imageType(PNG)).toBe("image/png");
    expect(imageType(strToU8("GIF89a..."))).toBe("image/gif");
    expect(imageType(strToU8("RIFF....WEBPVP8 "))).toBe("image/webp");
  });
});
