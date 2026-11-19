// Animations open from the URL hash: #anim/<id> (saved in this browser), #example/<id>, or #new.
// Each one opens with a fresh page load, which keeps every bit of editor state starting clean.
import { useEffect } from 'react';

import { useLatest } from '../lib/useLatest';

export type Route = {kind: "anim" | "example"; id: string};

export function parseHash(hash: string): Route | null {
  const match = hash.match(/^#(anim|example)\/([a-f0-9]+)$/);
  return match ? {kind: match[1] as Route["kind"], id: match[2]!} : null;
}

const APP_LINKS = 'a[href="#new"], a[href^="#anim/"], a[href^="#example/"]';

export function useHashLinks(hasUnsavedChanges: boolean) {
  const unsaved = useLatest(hasUnsavedChanges);
  useEffect(() => {
    // Back/forward or an edited URL.
    const onHashChange = () => window.location.reload();
    // Confirm here rather than in beforeunload, so cancelling leaves the URL alone, and the same
    // link reloads too. Plain href="#" is left alone: react-bootstrap's dropdown toggles use it.
    const onClick = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest(APP_LINKS) : null;
      if (!link || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey) {
        return;
      }
      event.preventDefault();
      if (unsaved.current && !window.confirm("This animation has unsaved changes. Discard them?")) {
        return;
      }
      unsaved.current = false;
      window.removeEventListener("hashchange", onHashChange);
      window.history.pushState({}, "", link.getAttribute("href"));
      window.location.reload();
    };
    window.addEventListener("hashchange", onHashChange);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("hashchange", onHashChange);
      document.removeEventListener("click", onClick, true);
    };
  }, [unsaved]);
}
