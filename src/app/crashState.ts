// The animation being edited, kept outside React so the crash screen can still offer it.
import type { AnimationDocument } from '../lib/document';

let current: {id: string | null; json: AnimationDocument} | null = null;

export function setCrashDocument(value: {id: string | null; json: AnimationDocument}) {
  current = value;
}

export function crashDocument() {
  return current;
}
