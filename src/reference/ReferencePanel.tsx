// The docs, in the code editor's Docs tab, with a page list, search, and code you can copy or insert
// into the code tab open before it. The pages are built from docs/*.md at build time (docs/plugin.ts).
import { ActionIcon, CloseButton, Menu, TextInput, Tooltip, UnstyledButton } from '@mantine/core';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { TbArrowLeft, TbChevronDown, TbExternalLink, TbSearch } from 'react-icons/tb';
import pages from 'virtual:docs';

import { docsSiteHref, type DocTarget } from '../lib/docLinks';
import { searchDocs } from './search';
import './reference.scss';

export interface ReferencePanelProps {
  // Where to show; a new object each time it's asked for, even for the same place.
  target: DocTarget;
  // Whether the Docs tab is showing; the panel stays mounted while it isn't, to keep its place.
  active: boolean;
  // The code tab Insert puts code in, and what it's written in, so Insert only puts code where it can run.
  tabName: string;
  language: "glsl" | "js";
  // Whether there is a Canvas2D.js tab to insert JavaScript into.
  hasCanvas: boolean;
  onInsert(code: string): void;
}

const byName = new Map(pages.map(page => [page.slug, page]));

const LANGUAGE_NAMES = {glsl: "GLSL", js: "JavaScript"};

export default function ReferencePanel({target, active, tabName, language, hasCanvas, onInsert}: ReferencePanelProps) {
  const [place, setPlace] = useState<DocTarget>(target);
  const [history, setHistory] = useState<DocTarget[]>([]);
  const [query, setQuery] = useState("");
  const bodyRef = useRef<HTMLDivElement>(null);
  // Each new request from outside moves the panel there.
  const [lastTarget, setLastTarget] = useState(target);
  if (lastTarget !== target) {
    setLastTarget(target);
    setPlace(target);
    setQuery("");
  }
  const page = byName.get(place.page) ?? pages[0]!;
  const results = useMemo(() => searchDocs(pages, query), [query]);

  const go = (next: DocTarget) => {
    setHistory(h => [...h.slice(-19), place]);
    setPlace(next);
    setQuery("");
  };

  // Scrolls to the heading asked for, or the top of a new page, once the panel shows. A hidden panel
  // loses its scroll, so coming back to it returns to where it was.
  const scrolled = useRef<{place: DocTarget; top: number} | null>(null);
  useLayoutEffect(() => {
    const body = bodyRef.current;
    if (!body || query || !active) {
      return;
    }
    if (scrolled.current?.place === place) {
      body.scrollTop = scrolled.current.top;
      return;
    }
    scrolled.current = {place, top: 0};
    const heading = place.anchor ? body.querySelector<HTMLElement>(`[id="doc-${place.anchor}"]`) : null;
    body.scrollTop = heading ? heading.offsetTop - 8 : 0;
    heading?.classList.add("referenceTarget");
    const timer = window.setTimeout(() => heading?.classList.remove("referenceTarget"), 1600);
    return () => window.clearTimeout(timer);
  }, [place, query, active]);

  // Insert only puts code in a tab of its own language.
  useEffect(() => {
    bodyRef.current?.querySelectorAll<HTMLElement>(".doc-code").forEach(block => {
      const button = block.querySelector<HTMLButtonElement>(".doc-insert");
      const lang = block.dataset.lang as "glsl" | "js" | "";
      if (button && lang) {
        // Says why Insert is off in words beside it, since a disabled button shows no tooltip.
        const why = lang === language ? "" :
          lang === "js" ? (hasCanvas ? "Open the Canvas2D.js tab to insert" : "Add the Canvas2D layer to insert") : "Open a shader tab to insert";
        button.disabled = why !== "";
        button.title = why || `Insert at the cursor in the ${tabName} tab`;
        const note = block.querySelector(".doc-insert-note");
        if (note) {
          note.textContent = why;
        }
        button.setAttribute("aria-label", `Insert this ${LANGUAGE_NAMES[lang]}`);
      }
    });
  }, [page, language, tabName, hasCanvas, query]);

  const onBodyClick = (event: MouseEvent) => {
    const element = event.target as HTMLElement;
    const button = element.closest<HTMLButtonElement>(".doc-copy, .doc-insert");
    if (button) {
      const code = button.closest(".doc-code")?.querySelector("pre")?.textContent ?? "";
      if (button.classList.contains("doc-insert")) {
        onInsert(code);
      } else {
        // The clipboard is missing outside secure pages.
        void Promise.resolve().then(() => navigator.clipboard.writeText(code)).then(() => {
          button.textContent = "Copied";
          window.setTimeout(() => {button.textContent = "Copy";}, 1200);
        }, () => {});
      }
      return;
    }
    const link = element.closest("a");
    const href = link?.getAttribute("href") ?? "";
    const inPage = /^#(.+)$/.exec(href);
    const toPage = /^([\w-]+)\.html(?:#(.+))?$/.exec(href);
    if (inPage) {
      event.preventDefault();
      go({page: page.slug, anchor: inPage[1]!});
    } else if (toPage && byName.has(toPage[1]!)) {
      event.preventDefault();
      go({page: toPage[1]!, anchor: toPage[2]});
    }
  };

  const contents = page.headings.filter(h => h.level === 2);

  return (
    <section className="referencePanel" aria-label="Docs" hidden={!active}>
      <div className="referenceHeader">
        {history.length > 0 &&
          <Tooltip label="Back">
            <ActionIcon
              variant="subtle" color="gray" aria-label="Back"
              onClick={() => {setPlace(history.at(-1)!); setHistory(h => h.slice(0, -1)); setQuery("");}}
            >
              <TbArrowLeft />
            </ActionIcon>
          </Tooltip>}
        <Menu position="bottom-start" width={260}>
          <Menu.Target>
            <UnstyledButton className="referencePicker" aria-label="Choose a page">
              <span className="referencePageTitle">{page.title}</span>
              <TbChevronDown aria-hidden />
            </UnstyledButton>
          </Menu.Target>
          <Menu.Dropdown>
            {pages.map(p =>
              <Menu.Item key={p.slug} onClick={() => go({page: p.slug})} fw={p.slug === page.slug ? 600 : undefined}>
                {p.title}
              </Menu.Item>)}
          </Menu.Dropdown>
        </Menu>
        <Tooltip label="Open the docs in a new tab">
          <ActionIcon
            component="a" href={docsSiteHref({page: page.slug, anchor: place.anchor})} target="_blank" rel="noreferrer"
            variant="subtle" color="gray" aria-label="Open the docs in a new tab" className="referenceSite"
          >
            <TbExternalLink />
          </ActionIcon>
        </Tooltip>
      </div>
      <div className="referenceSearch">
        <TextInput
          size="xs" leftSection={<TbSearch />} placeholder="Search the docs" aria-label="Search the docs"
          value={query} onChange={event => setQuery(event.currentTarget.value)}
          rightSection={query ? <CloseButton size="xs" aria-label="Clear the search" onClick={() => setQuery("")} /> : null}
          onKeyDown={event => {
            if (event.key === "Escape") {
              setQuery("");
            } else if (event.key === "Enter" && results[0]) {
              go({page: results[0].page.slug, anchor: results[0].anchor || undefined});
            }
          }}
        />
      </div>
      <div
        className="referenceBody" ref={bodyRef} onClick={onBodyClick}
        onScroll={event => {
          if (active && !query && scrolled.current) {
            scrolled.current.top = event.currentTarget.scrollTop;
          }
        }}
      >
        {query ?
          <ul className="referenceResults" aria-label="Search results">
            {results.length === 0 && <li className="referenceNone">Nothing in the docs matches “{query}”.</li>}
            {results.map(r =>
              <li key={r.page.slug + "#" + r.anchor}>
                <UnstyledButton onClick={() => go({page: r.page.slug, anchor: r.anchor || undefined})}>
                  <span className="referenceResultTitle">
                    {r.page.title}{r.heading && r.heading !== r.page.title && <> › {r.heading}</>}
                  </span>
                  <span className="referenceExcerpt">{r.before}<mark>{r.match}</mark>{r.after}</span>
                </UnstyledButton>
              </li>)}
          </ul> :
          <>
            {contents.length > 2 &&
              <nav className="referenceContents" aria-label="On this page">
                {contents.map(h => <a key={h.id} href={"#" + h.id}>{h.text}</a>)}
              </nav>}
            <div className="referenceDoc" dangerouslySetInnerHTML={{__html: page.html}} />
          </>}
      </div>
    </section>
  );
}
