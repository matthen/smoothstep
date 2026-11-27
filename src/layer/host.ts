// What a Canvas2D layer starts its workers with: the sandbox in the app, or a fake in tests.
import type { ToWorker } from './runtime';

// A worker running a layer's script. Its messages come from the user's code, so they're unchecked.
export interface LayerWorker {
  post(message: ToWorker, transfer?: Transferable[]): void;
  onMessage: ((data: unknown) => void) | null;
  kill(): void;
}

export interface WorkerHost {
  // Starts a worker running `source`. `onError` gets errors it didn't catch, such as syntax errors.
  spawn(source: string, onError: (error: {message: string; line: number}) => void): LayerWorker;
  dispose(): void;
}
