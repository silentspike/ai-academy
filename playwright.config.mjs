import { defineConfig, devices } from '@playwright/test';

// Interaction suite for AI-Academy.
//
// Two properties drive nearly every choice here:
//
// 1. WINDOW SIZE. Screenshots and image comparisons run at 1920 × 1026 — a
//    maximised browser window on a 1920 × 1200 display, minus system bars and
//    browser chrome. Setting only --start-maximized keeps the default viewport of
//    1280 × 720, which is how every earlier design review in this project ended up
//    judging the interface at two-thirds of its real width. A fixture guard aborts
//    the run before a single screenshot is taken at the wrong size.
//
// 2. DETERMINISM. Time is pinned, randomness is seeded and animation is switched
//    off, otherwise an image comparison compares noise.

const VIEWPORT = { width: 1920, height: 1026 };
const PORT = Number(process.env.E2E_PORT || 8799);

export default defineConfig({
  testDir: 'tests/e2e/specs',
  outputDir: 'test-results',
  snapshotPathTemplate: 'tests/e2e/__screenshots__/{projectName}/{arg}{ext}',

  fullyParallel: true,
  // Locally the constraint is memory, not cores: a Chromium worker needs roughly
  // 250 MB, and this machine has little to spare. CI runners are sized for more.
  workers: process.env.CI ? 4 : 2,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: {
    timeout: 10_000,
    toHaveScreenshot: { maxDiffPixelRatio: 0.001, animations: 'disabled', scale: 'css' },
  },

  // The bridge serves the application; Playwright starts and stops it.
  webServer: {
    command: `node bridge/bridge.mjs --no-llm --port ${PORT} --store .tmp-e2e-store`,
    url: `http://127.0.0.1:${PORT}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },

  use: {
    baseURL: `http://127.0.0.1:${PORT}/`,
    viewport: VIEWPORT,
    colorScheme: 'dark',
    reducedMotion: 'reduce',
    trace: 'on-first-retry',
    video: 'off',
    screenshot: 'off',
    actionTimeout: 10_000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: VIEWPORT },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'], viewport: VIEWPORT },
    },
    // Visual comparison runs in one browser only: a second engine renders text
    // differently and would produce diffs that say nothing about the product.
    {
      name: 'visual',
      testMatch: /.*\.visual\.spec\.mjs/,
      use: { ...devices['Desktop Chrome'], viewport: VIEWPORT },
    },
    // Other window sizes. The share version runs on machines we do not control,
    // and a layout that only holds at one width is a product risk.
    {
      name: 'breakpoints',
      testMatch: /.*\.breakpoint\.spec\.mjs/,
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  reporter: process.env.CI
    ? [['list'], ['json', { outputFile: 'test-results/report.json' }], ['./tests/e2e/reporter.mjs']]
    : [['list'], ['./tests/e2e/reporter.mjs']],

  globalSetup: './tests/e2e/global-setup.mjs',
});
