import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { install, listenForInstallOffer, onLaunchFiles, useCanInstall } from './install';

describe("install", () => {
  it("offers Install only once the browser has, without its banner, and each offer once", async () => {
    const target = new EventTarget() as Window;
    listenForInstallOffer(target);
    const {result} = renderHook(() => useCanInstall());
    expect(result.current).toBe(false);

    const offer = Object.assign(new Event("beforeinstallprompt", {cancelable: true}), {prompt: vi.fn(() => Promise.resolve())});
    act(() => void target.dispatchEvent(offer));
    expect(offer.defaultPrevented).toBe(true);
    expect(result.current).toBe(true);

    await act(() => install());
    expect(offer.prompt).toHaveBeenCalledOnce();
    expect(result.current).toBe(false);
  });

  it("hides Install once the app is installed", () => {
    const target = new EventTarget() as Window;
    listenForInstallOffer(target);
    const {result} = renderHook(() => useCanInstall());
    act(() => void target.dispatchEvent(Object.assign(new Event("beforeinstallprompt"), {prompt: vi.fn()})));
    expect(result.current).toBe(true);
    act(() => void target.dispatchEvent(new Event("appinstalled")));
    expect(result.current).toBe(false);
  });

  it("hides Install when the app is already running installed", () => {
    const matchMedia = vi.spyOn(window, "matchMedia").mockImplementation(query =>
      ({matches: query === "(display-mode: standalone)"}) as MediaQueryList);
    const target = new EventTarget() as Window;
    listenForInstallOffer(target);
    const {result} = renderHook(() => useCanInstall());
    act(() => void target.dispatchEvent(Object.assign(new Event("beforeinstallprompt"), {prompt: vi.fn()})));
    expect(result.current).toBe(false);
    matchMedia.mockRestore();
  });
});

describe("onLaunchFiles", () => {
  it("opens the files the installed app was launched with", async () => {
    let consumer: ((params: unknown) => void) | undefined;
    Object.assign(window, {launchQueue: {setConsumer: (c: typeof consumer) => {consumer = c;}}});
    const open = vi.fn();
    onLaunchFiles(open);
    const file = new File(["{}"], "a.smoothstep.json");
    consumer!({files: [{getFile: () => Promise.resolve(file)}]});
    consumer!({files: []});
    await vi.waitFor(() => expect(open).toHaveBeenCalledWith([file]));
    expect(open).toHaveBeenCalledOnce();
    delete (window as {launchQueue?: unknown}).launchQueue;
  });

  it("does nothing in browsers that can't open files with apps", () => {
    expect(() => onLaunchFiles(vi.fn())).not.toThrow();
  });
});
