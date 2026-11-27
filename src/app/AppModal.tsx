// The modal every dialog in the app opens in, built on Mantine's.
import { Modal, type ModalProps } from '@mantine/core';
import { useEffect, useState, useSyncExternalStore } from 'react';

// Mantine's modals each close on Escape, so with one open over another a single press would
// close both. This keeps a stack of open modals and lets only the top one handle Escape.
const stack: symbol[] = [];
const listeners = new Set<() => void>();
let version = 0;

function changed() {
  version += 1;
  listeners.forEach(listener => listener());
}

export function anyModalOpen(): boolean {
  return stack.length > 0;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export default function AppModal({opened, closeOnEscape = true, ...props}: ModalProps) {
  const [id] = useState(() => Symbol("modal"));
  useSyncExternalStore(subscribe, () => version);
  useEffect(() => {
    if (!opened) {
      return;
    }
    stack.push(id);
    changed();
    return () => {
      stack.splice(stack.indexOf(id), 1);
      changed();
    };
  }, [opened, id]);
  return <Modal opened={opened} closeOnEscape={closeOnEscape && stack.at(-1) === id} {...props} />;
}
