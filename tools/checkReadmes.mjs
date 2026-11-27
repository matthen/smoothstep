// Fails when a folder with tracked files has no README.md. Run by `npm run lint`. Folders whose files are published
// on the site are left out, since a README there would be served too.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

const PUBLISHED = ['public', 'docs/images', '.github/pages'];
const SKIPPED = new Set(['.', '.github']);

const files = execFileSync('git', ['ls-files'], { encoding: 'utf8' }).split('\n').filter(Boolean);
const folders = new Set(files.map(file => dirname(file)));
const missing = [...folders].filter(folder => !SKIPPED.has(folder) &&
  !PUBLISHED.some(root => folder === root || folder.startsWith(root + '/')) && !existsSync(join(folder, 'README.md')));

if (missing.length > 0) {
  console.error(`These folders need a README.md saying what they hold:\n${missing.sort().map(f => `  ${f}`).join('\n')}`);
  process.exit(1);
}
