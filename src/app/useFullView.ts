import { useEffect, useState } from 'react';

import { anyModalOpen } from './AppModal';

function browserFullScreen(on: boolean) {
  if (on) {
    if (document.fullscreenEnabled) {
      void document.documentElement.requestFullscreen().catch(() => {});
    }
  } else if (document.fullscreenElement) {
    void document.exitFullscreen().catch(() => {});
  }
}

// The canvas and its play bar filling the screen. The browser's own full screen hides its bars
// too where it's allowed; iPhones only allow it for videos, so there the page alone fills it.
export function useFullView() {
  const [fullView, setFullView] = useState(false);
  const setFull = (on: boolean) => {
    setFullView(on);
    browserFullScreen(on);
  };
  useEffect(() => {
    if (!fullView) {
      return;
    }
    // Esc leaves the browser's full screen by itself; this covers the page-only one, unless Esc is
    // closing a dialog over it.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !anyModalOpen()) {
        setFullView(false);
        browserFullScreen(false);
      }
    };
    const onFullscreenChange = () => {
      if (!document.fullscreenElement) {
        setFullView(false);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
    };
  }, [fullView]);
  return [fullView, setFull] as const;
}
