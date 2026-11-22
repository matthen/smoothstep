// Animations open from the URL hash (the routes are in lib/routes.ts), or #new.
// Each one opens with a fresh page load, which keeps every bit of editor state starting clean.
import { useEffect } from 'react';

import { useLatest } from '../lib/useLatest';

export { parseHash } from '../lib/routes';

// Set once the user has agreed to discard changes, so beforeunload doesn't ask again.
let confirmedLeaving = false;

export function hasConfirmedLeaving(): boolean {
  return confirmedLeaving;
}

// Opens what `hash` names with a fresh page load, after asking before unsaved changes are lost.
// pushState doesn't fire hashchange, so the reload happens once. Returns false if the user stays.
export function openHash(hash: string, hasUnsavedChanges: boolean): boolean {
  if (hasUnsavedChanges && !window.confirm("This animation has unsaved changes. Discard them?")) {
    return false;
  }
  confirmedLeaving = true;
  window.history.pushState({}, "", hash);
  window.location.reload();
  return true;
}

const APP_LINKS = 'a[href="#new"], a[href^="#anim/"], a[href^="#example/"], a[href^="#tutorial"], ' +
  'a[href^="#share/"], a[href^="#url/"], a[href^="#gist/"]';

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
      openHash(link.getAttribute("href")!, unsaved.current);
    };
    window.addEventListener("hashchange", onHashChange);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("hashchange", onHashChange);
      document.removeEventListener("click", onClick, true);
    };
  }, [unsaved]);
}
