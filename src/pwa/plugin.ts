/// <reference types="node" />
// Builds the service worker into sw.js, with the cache plan for every file of the build: the bundle's
// chunks and assets (the docs site's pages among them) and the files copied from public/.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { build, type Plugin } from 'vite';

import { cachePlan, WORKER_FILE, type CachePlan } from './cachePlan.ts';

const hash = (data: string | Uint8Array) => createHash('sha256').update(data).digest('hex').slice(0, 16);

function publicFiles(dir: string): Map<string, string> {
  let entries;
  try {
    entries = readdirSync(dir, {withFileTypes: true, recursive: true});
  } catch {
    return new Map();
  }
  return new Map(entries.filter(entry => entry.isFile()).map(entry => {
    const path = join(entry.parentPath, entry.name);
    return [relative(dir, path).split('\\').join('/'), hash(readFileSync(path))];
  }));
}

// The worker's script, which starts with the plan on a line of its own.
async function workerScript(plan: CachePlan): Promise<string> {
  const result = await build({
    configFile: false, logLevel: 'warn',
    build: {
      write: false, minify: true,
      lib: {entry: 'src/pwa/worker.ts', formats: ['iife'], name: 'smoothstepWorker'},
    },
  });
  const bundle = Array.isArray(result) ? result[0]! : result;
  if (!("output" in bundle)) {
    throw new Error("Building the service worker gave a watcher, not a bundle");
  }
  return `const CACHE_PLAN = ${JSON.stringify(plan)};\n` + bundle.output[0].code;
}

export function serviceWorkerPlugin(): Plugin {
  let publicDir = '';
  return {
    name: 'service-worker',
    apply: 'build',
    configResolved(config) {
      publicDir = config.publicDir;
    },
    // Once written, when every file, the docs site's pages among them, is as it will be served.
    async writeBundle(options, bundle) {
      const revisions = publicDir ? publicFiles(publicDir) : new Map<string, string>();
      for (const [fileName, file] of Object.entries(bundle)) {
        revisions.set(fileName, hash(file.type === 'chunk' ? file.code : file.source));
      }
      writeFileSync(join(options.dir!, WORKER_FILE), await workerScript(cachePlan(revisions, hash)));
    },
  };
}
