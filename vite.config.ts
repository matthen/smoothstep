/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { build, defineConfig, type Plugin } from 'vite';

// `import script from 'virtual:player-script'` gives the standalone player (src/player/standalone.ts)
// bundled into one script, for the player files the app makes.
function playerScript(): Plugin {
  const id = '\0virtual:player-script';
  return {
    name: 'player-script',
    resolveId: source => source === 'virtual:player-script' ? id : undefined,
    async load(source) {
      if (source !== id) {
        return undefined;
      }
      const result = await build({
        configFile: false, logLevel: 'warn',
        build: {
          write: false, minify: true,
          lib: {entry: 'src/player/standalone.ts', formats: ['iife'], name: 'smoothstepPlayer'},
        },
      });
      const bundle = Array.isArray(result) ? result[0]! : result;
      if (!("output" in bundle)) {
        throw new Error("Building the standalone player gave a watcher, not a bundle");
      }
      const output = bundle.output[0];
      return 'export default ' + JSON.stringify(output.code);
    },
  };
}

export default defineConfig({
  // Relative asset URLs, so the build works from any path on any static host.
  base: './',
  plugins: [react(), playerScript()],
  css: {
    preprocessorOptions: {
      // Bootstrap 5.3's Sass still uses @import and global functions.
      scss: {quietDeps: true, silenceDeprecations: ['import', 'global-builtin', 'color-functions', 'if-function']},
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rolldownOptions: {
      // embed.html is the player for showing an animation on another website.
      input: {main: 'index.html', embed: 'embed.html'},
      output: {
        // Large libraries in chunks of their own, so they load in parallel and stay cached
        // across app updates.
        codeSplitting: {
          groups: [
            {name: 'react', test: /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/, priority: 3},
            // JavaScript support stays out, to load with the first Canvas2D tab.
            {name: 'codemirror', test: /[\\/]node_modules[\\/](@codemirror[\\/](?!lang-javascript)|@lezer[\\/](?!javascript)|crelt[\\/]|style-mod[\\/]|w3c-keyname[\\/])/, priority: 2},
            {name: 'mantine', test: /[\\/]node_modules[\\/](@mantine|@floating-ui|react-remove-scroll[^\\/]*|react-style-singleton|use-callback-ref|use-sidecar|tslib|get-nonce|aria-hidden|detect-node-es|clsx)[\\/]/, priority: 1},
          ],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    setupFiles: ['src/test/setup.ts'],
  },
});
