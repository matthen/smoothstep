import { defineConfig, devices } from '@playwright/test';

// The built app is served under /sub/ to check it works away from a site root.
const PORT = 4173;

export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  // Each test has its own browser context, so its storage is its own.
  fullyParallel: true,
  workers: process.env.CI ? 4 : undefined,
  reporter: process.env.CI ? [['list'], ['html', {open: 'never'}]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}/sub/`,
    viewport: {width: 1440, height: 900},
    acceptDownloads: true,
    trace: 'retain-on-failure',
    // The app's service worker would answer requests before page.route sees them. Tests of offline
    // use opt in.
    serviceWorkers: 'block',
    // Software WebGL, so tests run on machines without a GPU. E2E_GPU=1 uses the machine's GPU through Vulkan.
    launchOptions: {
      args: process.env.E2E_GPU ?
        ['--use-angle=vulkan', '--enable-features=Vulkan', '--enable-gpu', '--ignore-gpu-blocklist'] :
        ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    },
  },
  projects: [{name: 'chromium', use: {...devices['Desktop Chrome'], viewport: {width: 1440, height: 900}}}],
  webServer: {
    command: `npx vite preview --port ${PORT} --strictPort --base /sub/`,
    url: `http://localhost:${PORT}/sub/`,
    reuseExistingServer: !process.env.CI,
  },
});
