/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset URLs, so the build works from any path on any static host.
  base: './',
  plugins: [react()],
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
      output: {
        // Large libraries in chunks of their own, so they load in parallel and stay cached
        // across app updates.
        codeSplitting: {
          groups: [
            {name: 'react', test: /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/, priority: 3},
            {name: 'codemirror', test: /[\\/]node_modules[\\/](@codemirror|@lezer|crelt|style-mod|w3c-keyname)[\\/]/, priority: 2},
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
