// Store helpers for the dialog tests.
import { Blob as NodeBlob } from 'node:buffer';

import { newDocument } from '../lib/document';
import * as localStore from '../lib/localStore';

export async function clearStore() {
  for (const d of await localStore.allDocuments()) {
    await localStore.deleteDocument(d.id);
  }
  for (const i of await localStore.listImages()) {
    await localStore.deleteImage(i.id);
  }
}

export async function addDocument(id: string, title: string, modified: number) {
  const json = newDocument();
  json.title = title;
  await localStore.putDocument({id, title, created: modified - 1000, modified, json, thumbnail: null});
}

// jsdom's Blob doesn't survive fake-indexeddb's structured clone; Node's does.
export async function addImage(id: string, filename: string, created = Date.now(), type = "image/png") {
  const blob = new NodeBlob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], {type}) as unknown as Blob;
  const record = {id, filename, width: 64, height: 32, created, blob};
  await localStore.putImage(record);
  return record;
}
