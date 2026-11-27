import { describe, expect, it } from 'vitest';

import { dropTab, hold, probeResult, PROBE_OFF, release, request, reread, shownRequest } from './probeState';
import type { ProbeRequest } from './Renderer';

const OLD: ProbeRequest = {tab: "image", code: "old", from: 0, to: 3};
const NEW: ProbeRequest = {tab: 0, code: "new", from: 1, to: 2};
// Where each request's mark is after the picker's edits.
const moved = (p: ProbeRequest) => ({...p, code: p.code + " edited"});

describe("probe state", () => {
  it("holds a shown expression back during a drag, and shows it again where it is now", () => {
    const shown = probeResult(request(OLD), true);
    const held = hold(shown);
    expect(shownRequest(held)).toBeNull();
    expect(shownRequest(release(held, moved))).toEqual(moved(OLD));
  });

  it("shows a new request made during a hold, which the hold's end leaves alone", () => {
    const asked = request(NEW);
    expect(shownRequest(asked)).toBe(NEW);
    expect(release(asked, moved)).toBe(asked);
  });

  it("builds a request not yet shown rather than holding it, as it has no mark to find again", () => {
    const asked = request(NEW);
    expect(hold(asked)).toBe(asked);
  });

  it("turns off when the expression can't be shown or found again, or its tab goes", () => {
    expect(probeResult(request(OLD), false)).toEqual(PROBE_OFF);
    expect(release(hold(probeResult(request(OLD), true)), () => null)).toEqual(PROBE_OFF);
    expect(reread(request(OLD), () => null)).toEqual(PROBE_OFF);
    expect(dropTab(request(NEW), 0)).toEqual(PROBE_OFF);
    expect(dropTab(request(NEW), "image")).toEqual(request(NEW));
  });
});
