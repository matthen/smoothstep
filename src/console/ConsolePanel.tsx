// The bottom panel's Console tab: the Canvas2D code's console calls, errors from every tab, a line
// for each build and the app's own warnings. Clicking an entry with a line goes to it in the code.
import { Button } from '@mantine/core';
import { useLayoutEffect, useRef, useSyncExternalStore } from 'react';

import { shaderName } from '../editor/ShaderTabs';
import type { ShaderId } from '../render/Renderer';
import type { ConsoleEntry, ConsoleStore } from './consoleStore';
import './console.scss';

interface Props {
  store: ConsoleStore;
  // Whether the tab shows; a hidden one doesn't draw its entries.
  active: boolean;
  // A phone has no tabs' row, so the Clear button goes above the entries.
  phone: boolean;
  onGoToLine(tab: ShaderId, line: number | null): void;
}

// How near the bottom counts as at it, so new entries keep it scrolled there.
const AT_BOTTOM = 8;

function stepLabel(entry: ConsoleEntry): string | null {
  if (entry.frame === undefined || entry.frame === null) {
    return entry.render ? "render" : null;
  }
  const time = entry.time === undefined || entry.time === null ? "" : ` · ${entry.time.toFixed(2)} s`;
  return (entry.render ? "render " : "") + `frame ${entry.frame}${time}`;
}

// "Canvas2D.js:12" beside a console call; errors say "Canvas2D.js, line 12:" before their message.
function place(entry: ConsoleEntry): string | null {
  if (entry.tab === undefined) {
    return null;
  }
  return shaderName(entry.tab) + (entry.line === undefined || entry.line === null ? "" : `:${entry.line + 1}`);
}

function Entry({entry, onGoToLine}: {entry: ConsoleEntry; onGoToLine: Props["onGoToLine"]}) {
  const step = stepLabel(entry);
  // A console call from the code, which has a step, even if it's null for code that ran before any.
  const isCall = entry.frame !== undefined;
  const where = place(entry);
  const go = entry.tab === undefined ? undefined : () => onGoToLine(entry.tab!, entry.line ?? null);
  const text = !isCall && entry.tab !== undefined
    ? `${shaderName(entry.tab)}${entry.line === undefined || entry.line === null ? "" : `, line ${entry.line + 1}`}: ${entry.text}`
    : entry.text;
  const body = <>
    {step !== null && <span className="consoleStep">{step}</span>}
    {entry.count > 1 && <span className="consoleCount">×{entry.count}</span>}
    <span className="consoleText">{text}</span>
    {isCall && where !== null && <span className="consolePlace">{where}</span>}
  </>;
  return go
    ? <button type="button" className="consoleEntry" data-level={entry.level} onClick={go} title="Go to this line">{body}</button>
    : <div className="consoleEntry" data-level={entry.level}>{body}</div>;
}

export default function ConsolePanel({store, active, phone, onGoToLine}: Props) {
  const {entries} = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const scroller = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);

  // Keeps the newest entry in sight, unless the list has been scrolled up.
  useLayoutEffect(() => {
    const element = scroller.current;
    if (element && atBottom.current) {
      element.scrollTop = element.scrollHeight;
    }
  }, [entries, active]);

  if (!active) {
    return null;
  }
  return (
    <div className="consolePanel">
      {phone && <div className="consolePhoneBar"><ConsoleClear store={store} /></div>}
      <div
        className="consoleEntries" ref={scroller} role="log" aria-label="Console" aria-live="off"
        onScroll={event => {
          const element = event.currentTarget;
          atBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < AT_BOTTOM;
        }}
      >
        {entries.map(entry => <Entry key={entry.id} entry={entry} onGoToLine={onGoToLine} />)}
        {/* Until there's more than the build's line. */}
        {entries.every(entry => entry.level === "note") &&
          <div className="consoleHint">console.log in the Canvas2D.js tab prints here, along with errors from every tab.</div>}
      </div>
    </div>
  );
}

// Empties the console. On a computer it sits in the tabs' row, and on a phone above the entries.
export function ConsoleClear({store}: {store: ConsoleStore}) {
  const {entries} = useSyncExternalStore(store.subscribe, store.getSnapshot);
  return (
    <Button
      variant="subtle" color="gray" size="compact-xs" className="consoleClear"
      disabled={entries.length === 0} onClick={() => store.clear()}
    >
      Clear
    </Button>
  );
}

// The tab's name, with a dot while it has errors that haven't been seen.
export function ConsoleLabel({store}: {store: ConsoleStore}) {
  const {unseenErrors} = useSyncExternalStore(store.subscribe, store.getSnapshot);
  return (
    <span className="consoleLabel">
      Console{unseenErrors && <span className="consoleDot" role="img" aria-label="new errors" />}
    </span>
  );
}
