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
  },
  // ffmpeg.wasm creates its worker with `new URL(..., import.meta.url)`; pre-bundling breaks that.
  optimizeDeps: {
    exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    setupFiles: ['src/test/setup.ts'],
  },
});
