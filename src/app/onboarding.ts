// Remembers, in this browser, whether the tour has been offered or taken. Storage can be blocked
// (private browsing), in which case the tour is simply offered again.
const KEY = "smoothstep.tour";

type TourState = "offered" | "taken";

export function tourState(): TourState | null {
  try {
    const value = window.localStorage.getItem(KEY);
    return value === "offered" || value === "taken" ? value : null;
  } catch {
    return null;
  }
}

export function setTourState(state: TourState) {
  try {
    window.localStorage.setItem(KEY, state);
  } catch {
    // Not stored; see above.
  }
}

// Whether the user has closed the docs, so new animations open without them.
const DOCS_KEY = "smoothstep.docsTab";

export function docsClosed(): boolean {
  try {
    return window.localStorage.getItem(DOCS_KEY) === "closed";
  } catch {
    return false;
  }
}

export function setDocsClosed(closed: boolean) {
  try {
    if (closed) {
      window.localStorage.setItem(DOCS_KEY, "closed");
    } else {
      window.localStorage.removeItem(DOCS_KEY);
    }
  } catch {
    // Not stored, so they open again next time.
  }
}
