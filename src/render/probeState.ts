// The expression the canvas shows in place of the image: none, asked for, shown, or held back while a
// picker drags, to show again once it stops.
import type { ProbeRequest, ShaderId } from './Renderer';

export type ProbeState =
  | {kind: "off"}
  | {kind: "requested"; request: ProbeRequest}
  | {kind: "shown"; request: ProbeRequest}
  | {kind: "held"; request: ProbeRequest};

// Where a request's expression is now in its tab's code, or null if it's gone.
export type Reread = (request: ProbeRequest) => ProbeRequest | null;

export const PROBE_OFF: ProbeState = {kind: "off"};

// The request the canvas should build now.
export function shownRequest(state: ProbeState): ProbeRequest | null {
  return state.kind === "requested" || state.kind === "shown" ? state.request : null;
}

// A new request replaces whatever was shown or held; null turns it off.
export function request(request: ProbeRequest | null): ProbeState {
  return request ? {kind: "requested", request} : PROBE_OFF;
}

// The canvas built the request, or couldn't.
export function probeResult(state: ProbeState, ok: boolean): ProbeState {
  if (!ok) {
    return PROBE_OFF;
  }
  return state.kind === "requested" ? {kind: "shown", request: state.request} : state;
}

// Follows the expression through edits to its code.
export function reread(state: ProbeState, read: Reread): ProbeState {
  if (state.kind === "off") {
    return state;
  }
  const next = read(state.request);
  return next ? {...state, request: next} : PROBE_OFF;
}

export function dropTab(state: ProbeState, tab: ShaderId): ProbeState {
  return state.kind !== "off" && state.request.tab === tab ? PROBE_OFF : state;
}

// Only a shown expression is held: its mark in the code follows the edits, so it can be found again.
// One still to be built is built once, then held by the next change.
export function hold(state: ProbeState): ProbeState {
  return state.kind === "shown" ? {kind: "held", request: state.request} : state;
}

// Shows the held expression again, where it is now; a request made during the hold has already replaced it.
export function release(state: ProbeState, read: Reread): ProbeState {
  return state.kind === "held" ? reread(request(state.request), read) : state;
}
