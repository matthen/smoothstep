import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Updates, type ContainerLike } from './updates';

class FakeWorker extends EventTarget {
  messages: unknown[] = [];
  constructor(public state = "installing") {
    super();
  }
  postMessage(message: unknown) {
    this.messages.push(message);
  }
  setState(state: string) {
    this.state = state;
    this.dispatchEvent(new Event("statechange"));
  }
}

class FakeRegistration extends EventTarget {
  waiting: FakeWorker | null = null;
  installing: FakeWorker | null = null;
  update = vi.fn(() => Promise.resolve());
  // A new version starts installing, as after a deploy.
  found(worker: FakeWorker) {
    this.installing = worker;
    this.dispatchEvent(new Event("updatefound"));
  }
}

class FakeContainer extends EventTarget implements ContainerLike {
  registered: string[] = [];
  constructor(public controller: unknown, public registration = new FakeRegistration()) {
    super();
  }
  register(url: string) {
    this.registered.push(url);
    return Promise.resolve(this.registration);
  }
  // The new version takes over this page.
  takeOver() {
    this.controller = {};
    this.dispatchEvent(new Event("controllerchange"));
  }
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

async function started(controller: unknown) {
  const container = new FakeContainer(controller);
  const reload = vi.fn();
  const updates = new Updates(container, reload);
  const ready = vi.fn();
  updates.onReady(ready);
  await updates.register("https://example.com/some/path/index.html#anim/abc");
  return {container, registration: container.registration, updates, reload, ready};
}

describe("Updates", () => {
  it("registers the worker beside the page, whatever its path", async () => {
    const {container} = await started(null);
    expect(container.registered).toEqual(["https://example.com/some/path/sw.js"]);
  });

  it("says nothing when the first version installs", async () => {
    const {container, registration, updates, reload, ready} = await started(null);
    const worker = new FakeWorker();
    registration.found(worker);
    worker.setState("installed");
    worker.setState("activated");
    container.takeOver();
    expect(ready).not.toHaveBeenCalled();
    expect(updates.ready).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  it("says when a new version has installed and is waiting", async () => {
    const {registration, updates, ready} = await started({});
    const worker = new FakeWorker();
    registration.found(worker);
    expect(ready).not.toHaveBeenCalled();
    worker.setState("installed");
    expect(ready).toHaveBeenCalledOnce();
    expect(updates.ready).toBe(true);
    const late = vi.fn();
    updates.onReady(late);
    expect(late).toHaveBeenCalledOnce();
  });

  it("finds a version that was already waiting when the page opened", async () => {
    const container = new FakeContainer({});
    container.registration.waiting = new FakeWorker("installed");
    const updates = new Updates(container, vi.fn());
    await updates.register("https://example.com/");
    expect(updates.ready).toBe(true);
  });

  it("never reloads by itself", async () => {
    const {registration, reload} = await started({});
    const worker = new FakeWorker();
    registration.found(worker);
    worker.setState("installed");
    vi.advanceTimersByTime(60_000);
    expect(reload).not.toHaveBeenCalled();
  });

  it("on Reload, lets the new version take over, then reloads once", async () => {
    const {container, registration, updates, reload} = await started({});
    const worker = new FakeWorker();
    registration.found(worker);
    worker.setState("installed");
    updates.apply();
    expect(worker.messages).toEqual([{type: "skipWaiting"}]);
    expect(reload).not.toHaveBeenCalled();
    container.takeOver();
    expect(reload).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(10_000);
    expect(reload).toHaveBeenCalledOnce();
  });

  it("reloads anyway if the new version never takes over", async () => {
    const {registration, updates, reload} = await started({});
    const worker = new FakeWorker();
    registration.found(worker);
    worker.setState("installed");
    updates.apply();
    vi.advanceTimersByTime(10_000);
    expect(reload).toHaveBeenCalledOnce();
  });

  it("reloads at once if another tab already switched to the new version", async () => {
    const {registration, updates, reload} = await started({});
    const worker = new FakeWorker();
    registration.found(worker);
    worker.setState("installed");
    worker.setState("activated");
    updates.apply();
    expect(reload).toHaveBeenCalledOnce();
  });

  it("checks for new versions while the page stays open", async () => {
    const {registration} = await started({});
    vi.advanceTimersByTime(2 * 60 * 60 * 1000);
    expect(registration.update).toHaveBeenCalledTimes(2);
  });
});
