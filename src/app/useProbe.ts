import { notifications } from '@mantine/notifications';
import type { EditorView } from '@codemirror/view';
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

import type { Range } from '../editor/glslDefinitions';
import { setShownExpression, shownExpression } from '../editor/showExpression';
import type { ProbeRequest, ProbeResult, ShaderId } from '../render/Renderer';

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
  const [probe, setProbe] = useState<ProbeRequest | null>(null);
  // While a picker drags, the canvas shows the image, as building the expression each time would slow it.
  const [probeHeld, setProbeHeld] = useState(false);
  const probeHoldTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(probeHoldTimer.current), []);
  const [inspect, setInspect] = useState(false);

  // The expression shown on the canvas, where it is now in its tab's code; null if it's gone.
  const probeAgain = (p: ProbeRequest | null): ProbeRequest | null => {
    const view = p && editorViews.current.get(p.tab);
    const range = view?.state.field(shownExpression, false);
    return p && view && range ? {...p, code: view.state.doc.toString(), from: range.from, to: range.to} : null;
  };
  const refresh = () => setProbe(probeAgain);

  // Shows an expression selected in a tab on the canvas, or nothing for no selection.
  const show = (tab: ShaderId, view: EditorView, range: Range | null) =>
    setProbe(range ? {tab, code: view.state.doc.toString(), from: range.from, to: range.to} : null);

  const clear = useCallback(() => setProbe(null), []);
  // A tab's editor went, and the expression shown from it with it.
  const dropTab = (tab: ShaderId) => setProbe(p => p?.tab === tab ? null : p);

  // Shows the image while a picker drags, and the expression again once it stops.
  const holdWhileEditing = () => {
    if (!probe) {
      return;
    }
    setProbeHeld(true);
    window.clearTimeout(probeHoldTimer.current);
    probeHoldTimer.current = window.setTimeout(() => {
      setProbeHeld(false);
      setProbe(probeAgain);
    }, PROBE_HOLD_MS);
  };

  const onProbe = (result: ProbeResult) => {
    if (result.ok) {
      markShown(editorViews.current, probe?.tab ?? null, {from: result.from, to: result.to});
      return;
    }
    setProbe(null);
    notifications.show({id: "probe", color: "red", autoClose: 5000, title: "Can't show that on the canvas", message: result.message});
  };
  useEffect(() => {
    if (!probe) {
      markShown(editorViews.current, null, null);
    }
  }, [probe, editorViews]);

  return {probe, shownProbe: probeHeld ? null : probe, refresh, show, clear, dropTab, holdWhileEditing, onProbe, inspect, setInspect};
}
