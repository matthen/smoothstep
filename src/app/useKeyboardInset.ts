import { useEffect, useState } from 'react';

// More of the page than this hidden at the bottom means an on-screen keyboard, not a browser toolbar.
const KEYBOARD_MIN_HEIGHT = 120;

// Sets --keyboard-inset on <html> to how much of the bottom of the page the on-screen keyboard
// covers, so things fixed to the bottom of the screen can sit above it, and --visible-top and
// --visible-height to the part of the page still in sight. Browsers don't resize the page for the
// keyboard (iOS never does), but the visual viewport shrinks. Returns whether the keyboard is up.
export function useKeyboardInset(): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) {
      return;
    }
    const root = document.documentElement;
    const update = () => {
      const covered = Math.max(0, Math.round(window.innerHeight - viewport.height - viewport.offsetTop));
      root.style.setProperty("--keyboard-inset", covered + "px");
      root.style.setProperty("--visible-top", Math.round(viewport.offsetTop) + "px");
      root.style.setProperty("--visible-height", Math.round(viewport.height) + "px");
      // Not offsetTop: iOS scrolls the page to show the focused field, with the keyboard still up.
      // And not while pinch-zoomed, which shrinks the visual viewport too.
      setOpen(window.innerHeight - viewport.height > KEYBOARD_MIN_HEIGHT && Math.abs(viewport.scale - 1) < 0.01);
    };
    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
      for (const name of ["--keyboard-inset", "--visible-top", "--visible-height"]) {
        root.style.removeProperty(name);
      }
    };
  }, []);
  return open;
}
