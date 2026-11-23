/// <reference types="node" />
// Builds docs/*.md into the pages of the app's Docs tab (`import pages from 'virtual:docs'`) and into the
// docs site in dist/docs/, and serves the site at /docs/ from the dev server.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { Plugin } from 'vite';

import { REPO_URL } from '../lib/urls.ts';
import { REFERENCE_PATH, referenceMarkdown } from './reference.ts';
import { renderDocs, type DocFile, type DocPage } from './render.ts';
import { SITE_CSS, sitePage } from './site.ts';

// The pages in the order the contents list them; others follow by name.
const ORDER = [
  'README.md', 'tutorial/README.md', 'examples.md', REFERENCE_PATH, 'coding-specification.md', 'canvas2d.md',
  'keyboard-shortcuts.md', 'sharing.md', 'acknowledgements.md',
];

function listFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(dir, join(entry.parentPath, entry.name)).split('\\').join('/'));
}

// The Markdown in docs/, and the Reference page made from the app's own lists.
export function readDocs(docsDir: string): DocFile[] {
  const rank = (path: string) => ORDER.includes(path) ? ORDER.indexOf(path) : ORDER.length;
  const files = listFiles(docsDir).filter((path) => path.endsWith('.md'))
    .map((path) => ({ path, text: readFileSync(join(docsDir, path), 'utf8') }));
  return [...files, { path: REFERENCE_PATH, text: referenceMarkdown() }]
    .sort((a, b) => rank(a.path) - rank(b.path) || a.path.localeCompare(b.path));
}

// Every file of the docs site, by its path under docs/.
export function siteFiles(docsDir: string): Map<string, string | Buffer> {
  const pages = renderDocs(readDocs(docsDir), { target: 'site', repoUrl: REPO_URL });
  const files = new Map<string, string | Buffer>([['docs.css', SITE_CSS]]);
  for (const page of pages) files.set(page.slug + '.html', sitePage(page, pages));
  for (const path of listFiles(docsDir).filter((p) => p.startsWith('images/'))) {
    files.set(path, readFileSync(join(docsDir, path)));
  }
  return files;
}

const appPages = (docsDir: string): DocPage[] => renderDocs(readDocs(docsDir), { target: 'app', repoUrl: REPO_URL });

export function docsPlugin(): Plugin {
  const id = '\0virtual:docs';
  let docsDir = 'docs';
  return {
    name: 'docs',
    configResolved(config) {
      docsDir = join(config.root, 'docs');
    },
    resolveId: (source) => source === 'virtual:docs' ? id : undefined,
    load(source) {
      if (source !== id) return undefined;
      for (const path of listFiles(docsDir).filter((p) => p.endsWith('.md'))) this.addWatchFile(join(docsDir, path));
      return 'export default ' + JSON.stringify(appPages(docsDir));
    },
    generateBundle() {
      for (const [path, source] of siteFiles(docsDir)) {
        this.emitFile({ type: 'asset', fileName: 'docs/' + path, source });
      }
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const match = /^\/docs\/(.*?)(?:\?.*)?$/.exec(req.url ?? '');
        if (!match) return next();
        const file = siteFiles(docsDir).get(match[1] || 'index.html');
        if (file === undefined) return next();
        const type = match[1]!.endsWith('.css') ? 'text/css' : match[1]!.endsWith('.png') ? 'image/png' : 'text/html';
        res.setHeader('Content-Type', type);
        res.end(file);
      });
    },
  };
}
