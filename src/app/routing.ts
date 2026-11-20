// Animations open from the URL hash: #anim/<id> (saved in this browser), #example/<id>, #new, or
// #tutorial/<lesson>, a new animation with the tutorial open.
// Each one opens with a fresh page load, which keeps every bit of editor state starting clean.
import { useEffect } from 'react';

import { useLatest } from '../lib/useLatest';

export type Route = {kind: "anim" | "example"; id: string} | {kind: "tutorial"; lesson: number | null};

export function parseHash(hash: string): Route | null {
  const tutorial = hash.match(/^#tutorial(?:\/(\d+))?$/);
  if (tutorial) {
    // Lessons are numbered from 1 in the URL.
    return {kind: "tutorial", lesson: tutorial[1] ? Math.max(0, Number(tutorial[1]) - 1) : null};
  }
  const match = hash.match(/^#(anim|example)\/([a-f0-9]+)$/);
  return match ? {kind: match[1] as "anim" | "example", id: match[2]!} : null;
}

// Set once the user has agreed to discard changes, so beforeunload doesn't ask again.
let confirmedLeaving = false;

export function hasConfirmedLeaving(): boolean {
  return confirmedLeaving;
}

const APP_LINKS = 'a[href="#new"], a[href^="#anim/"], a[href^="#example/"], a[href^="#tutorial"]';

export function useHashLinks(hasUnsavedChanges: boolean) {
  const unsaved = useLatest(hasUnsavedChanges);
  useEffect(() => {
    // Back/forward or an edited URL.
    const onHashChange = () => window.location.reload();
    // Confirm here rather than in beforeunload, so cancelling leaves the URL alone, and the same
    // link reloads too.
    const onClick = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest(APP_LINKS) : null;
      if (!link || link.getAttribute("target") === "_blank" || event.button !== 0 || event.ctrlKey ||
          event.metaKey || event.shiftKey) {
        return;
      }
      event.preventDefault();
      if (unsaved.current && !window.confirm("This animation has unsaved changes. Discard them?")) {
        return;
      }
      confirmedLeaving = true;
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
