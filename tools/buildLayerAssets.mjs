// Builds the files a Canvas2D layer can use, from the packages in devDependencies:
//
//   node tools/buildLayerAssets.mjs
//
// - public/libs/<name>.js: each built-in library, bundled with what it needs into one CommonJS
//   script, which the layer's worker wraps in a function (see src/layer/workerSource.ts).
// - public/fonts/<file>.woff2: the bundled font families, to register in the worker.
//
// Keep the lists in step with src/layer/libraries.ts and src/layer/fonts.ts.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { build } from 'vite';

const require = createRequire(import.meta.url);
const root = join(import.meta.dirname, "..");

// [file name, package, the packages bundled into it]
const LIBRARIES = [
  ["planck", "planck", []],
  ["matter-js", "matter-js", []],
  ["simplex-noise", "simplex-noise", []],
  ["d3-delaunay", "d3-delaunay", ["delaunator", "robust-predicates"]],
];

// [package, file in its files/ directory]
const FONTS = [
  ["@fontsource-variable/inter", "inter-latin-wght-normal.woff2"],
  ["@fontsource-variable/inter", "inter-greek-wght-normal.woff2"],
  ["@fontsource-variable/arimo", "arimo-latin-wght-normal.woff2"],
  ["@fontsource-variable/arimo", "arimo-greek-wght-normal.woff2"],
  ["@fontsource-variable/exo-2", "exo-2-latin-wght-normal.woff2"],
  ["@fontsource/tinos", "tinos-latin-400-normal.woff2"],
  ["@fontsource/tinos", "tinos-latin-700-normal.woff2"],
  ["@fontsource/tinos", "tinos-greek-400-normal.woff2"],
  ["@fontsource/courier-prime", "courier-prime-latin-400-normal.woff2"],
  ["@fontsource/courier-prime", "courier-prime-latin-700-normal.woff2"],
];

function packageJSON(name) {
  // Some packages don't export their package.json, so find it from the entry file.
  let dir = dirname(require.resolve(name));
  for (;;) {
    try {
      const json = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
      if (json.name === name) {
        return json;
      }
    } catch {
      // Keep looking further up.
    }
    dir = dirname(dir);
  }
}

mkdirSync(join(root, "public", "libs"), {recursive: true});
for (const [file, name, bundled] of LIBRARIES) {
  const result = await build({
    configFile: false, logLevel: "warn", root,
    build: {write: false, minify: true, lib: {entry: require.resolve(name), formats: ["cjs"]}},
  });
  const bundle = Array.isArray(result) ? result[0] : result;
  const credits = [name, ...bundled].map(n => {
    const p = packageJSON(n);
    return `${p.name} ${p.version} (${p.license} licence)`;
  }).join(", with ");
  const code = `/* ${credits}. See CREDITS.md. */\n` + bundle.output[0].code;
  writeFileSync(join(root, "public", "libs", file + ".js"), code);
  console.log(file + ".js", (code.length / 1024).toFixed(0) + " KB");
}

mkdirSync(join(root, "public", "fonts"), {recursive: true});
for (const [name, file] of FONTS) {
  copyFileSync(join(dirname(require.resolve(name + "/package.json")), "files", file), join(root, "public", "fonts", file));
  console.log(file);
}
