import { defineConfig, devices } from '@playwright/test';

// The built app is served under /sub/ to check it works away from a site root.
const PORT = 4173;

export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? [['list'], ['html', {open: 'never'}]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}/sub/`,
    viewport: {width: 1440, height: 900},
    acceptDownloads: true,
    trace: 'retain-on-failure',
    // Software WebGL, so tests run on machines without a GPU.
    launchOptions: {args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']},
  },
  projects: [{name: 'chromium', use: {...devices['Desktop Chrome'], viewport: {width: 1440, height: 900}}}],
  webServer: {
    command: `npx vite preview --port ${PORT} --strictPort --base /sub/`,
    url: `http://localhost:${PORT}/sub/`,
    reuseExistingServer: !process.env.CI,
  },
});
