import { useEffect } from 'react';

// Sets --keyboard-inset on <html> to how much of the bottom of the page the on-screen keyboard
// covers, so things fixed to the bottom of the screen can sit above it. Browsers don't
// resize the page for the keyboard (iOS never does), but the visual viewport shrinks.
export function useKeyboardInset() {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) {
      return;
    }
    const root = document.documentElement;
    const update = () => {
      const covered = window.innerHeight - viewport.height - viewport.offsetTop;
      root.style.setProperty("--keyboard-inset", Math.max(0, Math.round(covered)) + "px");
    };
    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
      root.style.removeProperty("--keyboard-inset");
    };
  }, []);
}
