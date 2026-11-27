import { notifications } from '@mantine/notifications';
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useOnboarding } from './useOnboarding';

vi.mock('@mantine/notifications', () => ({notifications: {show: vi.fn(), hide: vi.fn()}}));
vi.mock('./tour', () => ({startTour: vi.fn()}));

const options = {initialRoute: null, phone: false, showPane: () => {}, closeDialog: () => {}, busy: false};
const shownTips = () => vi.mocked(notifications.show).mock.calls.map(([n]) => n).filter(n => n.id === "tip");

describe("useOnboarding", () => {
  afterEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  it("hides a showing tip when the tour starts, and shows no more until the tour ends", async () => {
    const {result} = renderHook(() => useOnboarding(options));
    act(() => result.current.showTip({kind: "saved"}));
    expect(shownTips()).toHaveLength(1);

    await act(() => result.current.takeTour());
    expect(notifications.hide).toHaveBeenCalledWith("tip");
    // The hidden tip's close comes after the tour has started, and mustn't let another tip through.
    act(() => shownTips()[0]!.onClose?.({} as never));
    act(() => result.current.showTip({kind: "built", ok: false, code: "", edited: true}));
    expect(shownTips()).toHaveLength(1);
  });
});
