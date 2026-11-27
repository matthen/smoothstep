// A WorkerHost for tests: records what each worker is sent, and lets the test answer for it.
import type { LayerWorker, WorkerHost } from './host';
import type { FromWorker, ToWorker } from './runtime';

export class FakeBitmap {
  closed = false;
  constructor(public width: number, public height: number) {}
  close() {
    this.closed = true;
  }
}

export class FakeWorker implements LayerWorker {
  posts: {message: ToWorker; transfer: Transferable[]}[] = [];
  onMessage: ((data: unknown) => void) | null = null;
  killed = false;

  constructor(private onError: (error: {message: string; line: number}) => void) {}

  post(message: ToWorker, transfer: Transferable[] = []) {
    this.posts.push({message, transfer});
  }

  kill() {
    this.killed = true;
  }

  // Sends a message as the worker, even once killed, as one may already be on its way.
  reply(message: Partial<FromWorker> | Record<string, unknown>) {
    this.onMessage?.(message);
  }

  crash(error: {message: string; line: number}) {
    this.onError(error);
  }

  // The batches of steps it has been sent.
  get batches(): Extract<ToWorker, {type: "steps"}>[] {
    return this.posts.flatMap(({message}) => message.type === "steps" ? [message] : []);
  }

  ready(hasDraw = true) {
    this.reply({type: "ready", registered: true, hasDraw, stoppedEarly: false});
  }

  // Answers its latest batch with a frame of the given size.
  frame(width: number, height: number): FakeBitmap {
    const bitmap = new FakeBitmap(width, height);
    this.reply({type: "frame", id: this.batches.at(-1)!.id, bitmap});
    return bitmap;
  }
}

export class FakeHost implements WorkerHost {
  workers: FakeWorker[] = [];
  disposed = false;

  spawn(_source: string, onError: (error: {message: string; line: number}) => void): FakeWorker {
    const worker = new FakeWorker(onError);
    this.workers.push(worker);
    return worker;
  }

  dispose() {
    this.disposed = true;
  }
}
