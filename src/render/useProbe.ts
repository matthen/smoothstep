import { notifications } from '@mantine/notifications';
import type { EditorView } from '@codemirror/view';
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

import type { Range } from '../editor/glslDefinitions';
import { setShownExpression, shownExpression } from '../editor/showExpression';
import {
  dropTab as dropProbeTab, hold, probeResult, PROBE_OFF, release, request, reread, shownRequest,
  type ProbeState,
} from './probeState';
import type { ProbeRequest, ProbeResult, ShaderId } from './Renderer';

// How long after a picker's last change the canvas shows the expression again.
const PROBE_HOLD_MS = 250;

// Marks the expression shown in its tab's editor, and clears the mark from the others.
function markShown(views: Map<ShaderId, EditorView>, tab: ShaderId | null, range: Range | null) {
  views.forEach((view, t) => {
    const mark = t === tab ? range : null;
    const current = view.state.field(shownExpression, false);
    if (current !== undefined && (current?.from !== mark?.from || current?.to !== mark?.to)) {
      view.dispatch({effects: setShownExpression.of(mark)});
    }
  });
}

// An expression the canvas shows in place of the image, picked in a tab's editor, and whether pointing
// at it shows values.
export function useProbe(editorViews: RefObject<Map<ShaderId, EditorView>>) {
  const [probe, setProbe] = useState<ProbeState>(PROBE_OFF);
  const probeHoldTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(probeHoldTimer.current), []);
  const [inspect, setInspect] = useState(false);

  // The expression shown on the canvas, where its mark is now in its tab's code.
  const readMark = (p: ProbeRequest): ProbeRequest | null => {
    const view = editorViews.current.get(p.tab);
    const range = view?.state.field(shownExpression, false);
    return view && range ? {...p, code: view.state.doc.toString(), from: range.from, to: range.to} : null;
  };
  const refresh = () => setProbe(p => reread(p, readMark));

  // Shows an expression selected in a tab on the canvas, or nothing for no selection.
  const show = (tab: ShaderId, view: EditorView, range: Range | null) =>
    setProbe(request(range ? {tab, code: view.state.doc.toString(), from: range.from, to: range.to} : null));

  const clear = useCallback(() => setProbe(PROBE_OFF), []);
  // A tab's editor went, and the expression shown from it with it.
  const dropTab = (tab: ShaderId) => setProbe(p => dropProbeTab(p, tab));

  // Shows the image while a picker drags, as building the expression each time would slow it, and the
  // expression again once it stops.
  const holdWhileEditing = () => {
    if (probe.kind !== "shown" && probe.kind !== "held") {
      return;
    }
    setProbe(hold);
    window.clearTimeout(probeHoldTimer.current);
    probeHoldTimer.current = window.setTimeout(() => setProbe(p => release(p, readMark)), PROBE_HOLD_MS);
  };

  const onProbe = (result: ProbeResult) => {
    setProbe(p => probeResult(p, result.ok));
    if (result.ok) {
      markShown(editorViews.current, shownRequest(probe)?.tab ?? null, {from: result.from, to: result.to});
      return;
    }
    notifications.show({id: "probe", color: "red", autoClose: 5000, title: "Can't show that on the canvas", message: result.message});
  };
  useEffect(() => {
    if (probe.kind === "off") {
      markShown(editorViews.current, null, null);
    }
  }, [probe, editorViews]);

  return {shownProbe: shownRequest(probe), refresh, show, clear, dropTab, holdWhileEditing, onProbe, inspect, setInspect};
}
