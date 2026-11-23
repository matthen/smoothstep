// Turns the Markdown in docs/ into pages for the docs site and the app's Docs tab, at build
// time. Links between the Markdown files become links between pages, other files in the repository
// link to GitHub, and code blocks are highlighted with the editor's colours.
import { highlightCode, tagHighlighter, tags as t } from '@lezer/highlight';
import { parser as jsParser } from '@lezer/javascript';
import { Marked, type Tokens } from 'marked';

import { tokenizeGlsl, type GlslToken } from '../editor/glslLanguage.ts';

export interface DocFile {
  // Its path in docs/, like "canvas2d.md" or "tutorial/README.md".
  path: string;
  text: string;
}

interface DocSection {
  // The heading's id, or "" for the text before the first heading.
  id: string;
  heading: string;
  text: string;
}

export interface DocPage {
  slug: string;
  title: string;
  path: string;
  html: string;
  headings: { id: string; text: string; level: number }[];
  // Plain text by section, for search.
  sections: DocSection[];
}

export interface RenderOptions {
  // "site" for the pages in dist/docs/, "app" for the Docs tab in the app's page.
  target: 'site' | 'app';
  repoUrl: string;
}

// Where the app is published; links to it in the docs work wherever this copy is served.
const APP_URL = 'https://smoothstep.io/app/';

// docs/README.md is the index, a folder's README.md is named after the folder.
function pageSlug(path: string): string {
  const slug = path.replace(/\.md$/, '').replace(/(^|\/)README$/, '').replace(/\//g, '-');
  return slug || 'index';
}

// GitHub's ids for headings.
function headingId(text: string): string {
  return text.toLowerCase().trim().replace(/<[^>]+>/g, '').replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/\s/g, '-');
}

const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Blocks are kept apart; inline tags like <code> join their text to the words around them.
const plainText = (html: string) =>
  html.replace(/<button[^>]*>[^<]*<\/button>/g, ' ').replace(/<\/?(?:p|li|ul|ol|h\d|t[dhr]|table|pre|div|br)\b[^>]*>/g, ' ').replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

const GLSL_CLASSES: Record<GlslToken, string> = {
  keyword: 'tok-keyword', typeName: 'tok-type', 'variableName.standard': 'tok-builtin', variableName: 'tok-variable',
  atom: 'tok-atom', number: 'tok-number', comment: 'tok-comment', string: 'tok-string', meta: 'tok-meta',
  operator: 'tok-operator',
};

// As the Canvas2D tab colours JavaScript.
const jsHighlighter = tagHighlighter([
  { tag: [t.keyword, t.self], class: 'tok-keyword' },
  { tag: t.typeName, class: 'tok-type' },
  { tag: t.propertyName, class: 'tok-property' },
  { tag: t.variableName, class: 'tok-variable' },
  { tag: [t.atom, t.bool, t.null], class: 'tok-atom' },
  { tag: t.number, class: 'tok-number' },
  { tag: t.comment, class: 'tok-comment' },
  { tag: [t.string, t.regexp], class: 'tok-string' },
  { tag: t.operator, class: 'tok-operator' },
]);

const span = (text: string, cls: string) => cls ? `<span class="${cls}">${escapeHtml(text)}</span>` : escapeHtml(text);

type CodeLanguage = 'glsl' | 'js' | '';

function codeLanguage(lang: string | undefined): CodeLanguage {
  const name = (lang ?? '').toLowerCase().split(/\s/)[0];
  return name === 'glsl' ? 'glsl' : name === 'js' || name === 'javascript' ? 'js' : '';
}

function highlight(code: string, language: CodeLanguage): string {
  if (language === 'glsl') {
    return tokenizeGlsl(code).map((line) => line.map((tok) => span(tok.text, tok.type ? GLSL_CLASSES[tok.type] : ''))
      .join('')).join('\n');
  }
  if (language === 'js') {
    let out = '';
    highlightCode(code, jsParser.parse(code), jsHighlighter, (text, cls) => out += span(text, cls), () => out += '\n');
    return out;
  }
  return escapeHtml(code);
}

function posixJoin(dir: string, href: string): string {
  const parts = dir ? dir.split('/') : [];
  for (const part of href.split('/')) {
    if (part === '..') parts.pop();
    else if (part !== '.' && part !== '') parts.push(part);
  }
  return parts.join('/');
}

export function renderDocs(files: readonly DocFile[], options: RenderOptions): DocPage[] {
  const slugs = new Map(files.map((f) => [f.path, pageSlug(f.path)]));
  const app = options.target === 'app';
  // Ids in the app share the page with everything else, so they get a prefix.
  const idPrefix = app ? 'doc-' : '';

  return files.map((file) => {
    const dir = file.path.includes('/') ? file.path.slice(0, file.path.lastIndexOf('/')) : '';
    const headings: DocPage['headings'] = [];
    const used = new Map<string, number>();

    // A link in this file, made right for where the page is shown.
    const resolve = (href: string, isImage: boolean): { href: string; external: boolean } => {
      if (href.startsWith(APP_URL + '#')) {
        return { href: (app ? './' : '../') + href.slice(APP_URL.length), external: true };
      }
      // A page of the published docs is a page of these.
      if (href.startsWith(APP_URL + 'docs/')) {
        return { href: href.slice(APP_URL.length + 'docs/'.length) || 'index.html', external: false };
      }
      if (/^[a-z]+:/i.test(href) || href.startsWith('#')) {
        return href.startsWith('#') ? { href, external: false } : { href, external: true };
      }
      const [path = '', anchor] = href.split('#');
      const target = posixJoin(dir, decodeURI(path));
      const slug = slugs.get(target) ?? slugs.get(posixJoin(target, 'README.md'));
      if (slug) {
        return { href: `${slug}.html${anchor ? '#' + anchor : ''}`, external: false };
      }
      if (isImage && target.startsWith('images/')) {
        return { href: (app ? 'docs/' : '') + target, external: false };
      }
      // Anything else in the repository is on GitHub.
      const repoPath = posixJoin(dir ? 'docs/' + dir : 'docs', path) + (path.endsWith('/') ? '/' : '');
      const kind = repoPath.endsWith('/') ? 'tree' : 'blob';
      return { href: `${options.repoUrl}/${kind}/main/${repoPath.replace(/\/$/, '')}${anchor ? '#' + anchor : ''}`,
        external: true };
    };

    const marked = new Marked({ gfm: true });
    marked.use({
      renderer: {
        heading({ tokens, depth, text }: Tokens.Heading) {
          let id = headingId(text);
          const seen = used.get(id) ?? 0;
          used.set(id, seen + 1);
          if (seen) id += '-' + seen;
          const inner = this.parser.parseInline(tokens);
          headings.push({ id, text: plainText(inner), level: depth });
          const anchor = depth > 1 ? `<a class="doc-anchor" href="#${id}" aria-hidden="true" tabindex="-1">#</a>` : '';
          return `<h${depth} id="${idPrefix}${id}">${inner}${anchor}</h${depth}>\n`;
        },
        code({ text, lang }: Tokens.Code) {
          const language = codeLanguage(lang);
          const buttons = app
            ? '<div class="doc-code-bar">' +
              (language ? '<span class="doc-insert-note"></span>' : '') +
              '<button type="button" class="doc-copy">Copy</button>' +
              (language ? '<button type="button" class="doc-insert">Insert</button>' : '') + '</div>'
            : '<button type="button" class="doc-copy">Copy</button>';
          return `<div class="doc-code" data-lang="${language}">${buttons}` +
            `<pre><code>${highlight(text.replace(/\n$/, ''), language)}</code></pre></div>\n`;
        },
        // A list whose items each start with a link and a line break, like the index's contents, is a
        // list of entries: the link as a title, and the rest as its description.
        list(token: Tokens.List) {
          const lead = (item: Tokens.ListItem) => {
            const first = item.tokens[0];
            return first?.type === 'text' && (first as Tokens.Text).tokens?.[0]?.type === 'link' &&
              (first as Tokens.Text).tokens?.[1]?.type === 'br' ? (first as Tokens.Text).tokens! : undefined;
          };
          if (token.ordered || !token.items.every(lead)) return false;
          const items = token.items.map((item) => {
            const [link, , ...note] = lead(item)!;
            return `<li>${this.parser.parseInline([link!])}<div class="doc-entry-note">${this.parser.parseInline(note)}</div>` +
              `${this.parser.parse(item.tokens.slice(1))}</li>`;
          });
          return `<ul class="doc-entries">\n${items.join('\n')}\n</ul>\n`;
        },
        link({ href, title, tokens }: Tokens.Link) {
          const { href: to, external } = resolve(href, false);
          const inner = this.parser.parseInline(tokens);
          const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
          const newTab = external ? ' target="_blank" rel="noreferrer"' : '';
          return `<a href="${escapeHtml(to)}"${titleAttr}${newTab}>${inner}</a>`;
        },
        image({ href, title, text }: Tokens.Image) {
          // Screenshots of the app only show the docs site's readers what they'd see; the Docs tab is already in it.
          if (app && /(^|\/)screenshot[^/]*$/.test(href)) {
            return '';
          }
          const { href: src } = resolve(href, true);
          const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
          return `<img src="${escapeHtml(src)}" alt="${escapeHtml(text)}"${titleAttr} loading="lazy">`;
        },
      },
    });
    const html = marked.parse(file.text, { async: false });
    const title = headings.find((h) => h.level === 1)?.text ?? file.path;

    // Splits the page's text at its headings, for search.
    const sections: DocSection[] = [];
    const headingRe = /<h([1-3]) id="([^"]+)">([\s\S]*?)<\/h\1>/g;
    let last = { id: '', heading: title, from: 0 };
    const close = (to: number) => {
      const text = plainText(html.slice(last.from, to).replace(/<a class="doc-anchor"[^>]*>#<\/a>/g, ''));
      if (text) sections.push({ id: last.id, heading: last.heading, text });
    };
    for (const match of html.matchAll(headingRe)) {
      close(match.index);
      const id = match[2]!.slice(idPrefix.length);
      last = { id: match[1] === '1' ? '' : id, heading: headings.find((h) => h.id === id)?.text ?? '', from: match.index };
    }
    close(html.length);

    return { slug: slugs.get(file.path)!, title, path: file.path, html, headings, sections };
  });
}
