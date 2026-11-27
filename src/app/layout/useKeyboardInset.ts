import { useEffect, useState } from 'react';

// More of the page than this hidden at the bottom means an on-screen keyboard, not a browser toolbar.
const KEYBOARD_MIN_HEIGHT = 120;

export interface KeyboardState {
  open: boolean;
  // The page's height without the keyboard.
  fullHeight: number;
}

// Sets --keyboard-inset on <html> to how much of the bottom of the page the on-screen keyboard
// covers, so things fixed to the bottom of the screen can sit above it, and --visible-top and
// --visible-height to the part of the page still in sight. Some browsers shrink the page for the
// keyboard and others (Safari) only shrink the visual viewport, so a keyboard is anything that takes
// the visible height well below the tallest the page has been at this width.
export function useKeyboardInset(): KeyboardState {
  const [state, setState] = useState<KeyboardState>({open: false, fullHeight: window.innerHeight});
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) {
      return;
    }
    const root = document.documentElement;
    let tallest = {width: window.innerWidth, height: window.innerHeight};
    const update = () => {
      // A new width is a rotation or a resized window, with a new full height.
      tallest = window.innerWidth === tallest.width ?
        {width: tallest.width, height: Math.max(tallest.height, window.innerHeight)} :
        {width: window.innerWidth, height: window.innerHeight};
      const covered = Math.max(0, Math.round(window.innerHeight - viewport.height - viewport.offsetTop));
      root.style.setProperty("--keyboard-inset", covered + "px");
      root.style.setProperty("--visible-top", Math.round(viewport.offsetTop) + "px");
      root.style.setProperty("--visible-height", Math.round(viewport.height) + "px");
      // Not offsetTop: iOS scrolls the page to show the focused field, with the keyboard still up.
      // And not while pinch-zoomed, which shrinks the visual viewport too.
      const open = tallest.height - viewport.height > KEYBOARD_MIN_HEIGHT && Math.abs(viewport.scale - 1) < 0.01;
      setState(previous => previous.open === open && previous.fullHeight === tallest.height ? previous :
        {open, fullHeight: tallest.height});
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
  return state;
}
