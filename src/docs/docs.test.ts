/// <reference types="node" />
// The docs build: the site's pages link to each other, their headings and images, and the app's
// links into the docs, from its own code and from the code it comes with, all land on a heading that's there.
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import pages from 'virtual:docs';

import { CANVAS2D_REFERENCE } from '../editor/canvas2dReference';
import { linksIn } from '../editor/links';
import { snippetTemplates } from '../editor/snippets';
import { FONT_FAMILIES } from '../layer/fonts';
import { LIBRARIES } from '../layer/libraries';
import { DOC_SECTIONS, docTargetOf, type DocTarget } from '../lib/docLinks';
import { DEFAULT_CODE, newBufferCode, NEW_CANVAS_CODE, SHARED_PLACEHOLDER, type AnimationDocument } from '../lib/document';
import { SHADER_INPUTS } from '../lib/shaderInputs';
import { searchDocs } from '../reference/search';
import * as tutorialShaders from '../tutorial/shaders';
import { readDocs, siteFiles } from './plugin';
import { renderDocs } from './render';

const site = siteFiles('docs');
const html = (file: string) => String(site.get(file));
const ids = (text: string) => new Set([...text.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]));
const attributes = (text: string, name: string) => [...text.matchAll(new RegExp(`\\s${name}="([^"]+)"`, 'g'))].map(m => m[1]!);

describe("the docs site", () => {
  const pagesOnSite = [...site.keys()].filter(file => file.endsWith(".html"));

  it("has a page for each Markdown file, with an index", () => {
    expect(pagesOnSite).toHaveLength(readDocs('docs').length);
    expect(pagesOnSite).toContain("index.html");
    // Each page lists every other page.
    for (const file of pagesOnSite) {
      expect(new Set(attributes(html(file), "href").filter(h => h.endsWith(".html")))).toEqual(new Set(pagesOnSite));
    }
  });

  it("links only to its own pages and headings, the app, or other websites", () => {
    let checked = 0;
    for (const file of pagesOnSite) {
      for (const href of attributes(html(file), "href")) {
        if (/^https?:/.test(href) || href.startsWith("../")) {
          continue;
        }
        const [path, anchor] = href.split("#");
        const target = path || file;
        expect(site.has(target), `${file} links to ${href}`).toBe(true);
        if (anchor) {
          expect(ids(html(target)).has(anchor), `${file} links to ${href}`).toBe(true);
        }
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(20);
  });

  it("copies the images its pages show", () => {
    const images = pagesOnSite.flatMap(file => attributes(html(file), "src").filter(src => !src.startsWith("../")));
    expect(images.length).toBeGreaterThan(0);
    for (const src of images) {
      expect(site.get(src), src).toBeInstanceOf(Buffer);
    }
  });

  it("links files elsewhere in the repository to GitHub", () => {
    expect(attributes(html("index.html"), "href"))
      .toContain("https://github.com/matthen/smoothstep/blob/main/public/images/textures/CREDITS.md");
  });

  it("lists the index's contents as entries, each a link to a page with a description", () => {
    const index = html("index.html");
    const entries = /<ul class="doc-entries">([\s\S]*?)\n<\/ul>/.exec(index)?.[1] ?? "";
    const titles = [...entries.matchAll(/<li><a href="([^"]+)"[^>]*>[^<]+<\/a><div class="doc-entry-note">\S/g)].map(m => m[1]);
    expect(titles).toEqual(expect.arrayContaining(["tutorial.html", "examples.html", "canvas2d.html", "reference.html"]));
    // The tutorial's lessons are still a list inside its entry.
    expect(entries).toMatch(/<ol>\s*<li><a href="\.\.\/#tutorial\/1"/);
    // A plain list stays a plain list.
    expect(html("acknowledgements.html")).toMatch(/<ul>\s*<li>/);
    expect(html("acknowledgements.html")).not.toContain("doc-entries");
  });
});

// The code the app comes with: what new animations and tabs start with, snippets, the tutorial's
// code, the examples, and the code in the docs.
function bundledCode(): [string, string][] {
  const examples = readdirSync('public/examples').filter(file => file.endsWith('.json')).flatMap(file => {
    const doc = JSON.parse(readFileSync('public/examples/' + file, 'utf8')) as AnimationDocument;
    return [doc.code, doc.shared ?? "", ...(doc.buffers ?? []).map(b => b.code), ...(doc.layers ?? []).map(l => l.code)]
      .map((code): [string, string] => [file, code]);
  });
  const docsCode = readDocs('docs').flatMap(({path, text}) =>
    [...text.matchAll(/```\w*\n([\s\S]*?)```/g)].map((m): [string, string] => [path, m[1]!]));
  return [
    ...[DEFAULT_CODE, NEW_CANVAS_CODE, SHARED_PLACEHOLDER, newBufferCode(0)].map((c): [string, string] => ["starter code", c]),
    ...snippetTemplates().map((c): [string, string] => ["snippets", c]),
    ...Object.values(tutorialShaders).map((c): [string, string] => ["tutorial", c]),
    ...examples, ...docsCode,
  ];
}

describe("the docs in the app", () => {
  const hasSection = ({page, anchor}: DocTarget, where: string) => {
    const doc = pages.find(p => p.slug === page);
    expect(doc, `${where}: ${page}`).toBeDefined();
    if (anchor) {
      expect(ids(doc!.html).has("doc-" + anchor), `${where}: ${page}#${anchor}`).toBe(true);
    }
  };

  it("have every section the app links to", () => {
    for (const target of Object.values(DOC_SECTIONS) as DocTarget[]) {
      hasSection(target, "the app");
    }
  });

  it("have every section the code the app comes with links to, as Markdown links rather than menu paths", () => {
    let checked = 0;
    for (const [where, code] of bundledCode()) {
      for (const line of code.split("\n")) {
        for (const {target} of linksIn(line)) {
          const docs = docTargetOf(target);
          if (docs) {
            hasSection(docs, where);
            checked++;
          }
        }
        expect(line, where).not.toMatch(/\[Help → (Documentation|Shader inputs|Keyboard shortcuts|Acknowledgements)\]/);
      }
    }
    expect(checked).toBeGreaterThanOrEqual(3);
  });

  it("leave out screenshots of the app", () => {
    const index = pages.find(p => p.slug === "index")!.html;
    expect(attributes(index, "src").some(src => src.includes("screenshot"))).toBe(false);
  });

  it("link to the docs site's pages and headings, so a link opened in a new tab works", () => {
    let checked = 0;
    for (const page of pages) {
      for (const href of attributes(page.html, "href").filter(h => h.startsWith("docs/"))) {
        const [path, anchor] = href.slice("docs/".length).split("#");
        expect(site.has(path!), `${page.slug} links to ${href}`).toBe(true);
        if (anchor) {
          expect(ids(html(path!)).has(anchor), `${page.slug} links to ${href}`).toBe(true);
        }
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(20);
  });

  it("show images from the copies next to the docs site, and make in-page links whole", () => {
    const files = [
      {path: "guide.md", text: "# Guide\n\n## Part\n\n![A diagram](images/diagram.png)\n\n[More](more.md#x) and [above](#part)\n"},
      {path: "more.md", text: "# More\n\n## X\n"},
    ];
    const [app] = renderDocs(files, {target: "app", repoUrl: "https://example.com/repo"});
    expect(attributes(app!.html, "src")).toEqual(["docs/images/diagram.png"]);
    expect(attributes(app!.html, "href")).toEqual(expect.arrayContaining(["docs/more.html#x", "docs/guide.html#part"]));
    const [onSite] = renderDocs(files, {target: "site", repoUrl: "https://example.com/repo"});
    expect(attributes(onSite!.html, "src")).toEqual(["images/diagram.png"]);
    expect(attributes(onSite!.html, "href")).toEqual(expect.arrayContaining(["more.html#x", "#part"]));
  });

  it("colour code blocks and give them Copy, and Insert when they're GLSL or JavaScript", () => {
    const canvas = pages.find(p => p.slug === "canvas2d")!.html;
    const block = /<div class="doc-code" data-lang="js">([\s\S]*?)<\/div>\n/.exec(canvas)![0];
    expect(block).toContain('class="doc-insert"');
    expect(block).toContain('<span class="tok-keyword">function</span>');
  });

  it("colour inline shader code, and leave file names and keys as they are", () => {
    const files = [{path: "a.md", text: "Use `#define size iFloat0` in `Image.glsl`, then press `Mod + S`."}];
    const [page] = renderDocs(files, {target: "site", repoUrl: "https://example.com/repo"});
    expect(page!.html).toContain('<code class="ss-code"><span class="tok-meta">#define</span> ' +
      '<span class="tok-macro">size</span> <span class="tok-builtin">iFloat0</span></code>');
    expect(page!.html).toContain('<code>Image.glsl</code>');
    expect(page!.html).toContain('<code>Mod + S</code>');
  });

  it("have a Reference page with every input, helper, font and library the editor knows", () => {
    const text = pages.find(p => p.slug === "reference")!.sections.map(s => s.text).join(" ");
    for (const input of SHADER_INPUTS) {
      expect(text).toContain(`${input.type} ${input.name}`);
      expect(text).toContain(input.description);
    }
    for (const entry of CANVAS2D_REFERENCE.filter(e => e.kind === "input" || e.kind === "helper")) {
      expect(text).toContain(entry.oneLiner);
    }
    for (const name of [...FONT_FAMILIES, ...LIBRARIES.map(l => l.example)]) {
      expect(text).toContain(name);
    }
  });

  it("credit every library the Canvas2D layer can import", () => {
    const text = pages.find(p => p.slug === "acknowledgements")!.sections.map(s => s.text).join(" ");
    for (const library of LIBRARIES) {
      expect(text).toContain(`${library.title} (${library.licence} licence)`);
    }
  });

  it("can be searched, best matches first", () => {
    expect(searchDocs(pages, "drawlist")[0]).toMatchObject({page: {slug: "canvas2d"}, anchor: "drawlist"});
    expect(searchDocs(pages, "seededRandom seed")[0]).toMatchObject({anchor: "other-helpers"});
    expect(searchDocs(pages, "gist").map(r => r.page.slug)).toContain("sharing");
    expect(searchDocs(pages, "zzzz")).toEqual([]);
  });
});
