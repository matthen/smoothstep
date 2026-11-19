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
