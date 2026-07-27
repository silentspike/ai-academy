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
  // The bridge runs with the substitute CLI on its PATH — not with --no-llm.
  // Without a CLI the product locks every exam, every chapter test and every boss
  // fight ("Gesperrt: kein LLM verbunden"), so those paths would never be tested.
  // The substitute is a versioned file rather than something generated at start-up,
  // so it cannot lose a race with the web server and can be read in review.
  webServer: {
    command: `node bridge/bridge.mjs --port ${PORT} --store .tmp-e2e-store`,
    url: `http://127.0.0.1:${PORT}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
    stdout: 'ignore',
    stderr: 'pipe',
    env: {
      ...process.env,
      PATH: `${new URL('tests/e2e/stub-cli/', import.meta.url).pathname}:${process.env.PATH}`,
    },
  },

  use: {
    baseURL: `http://127.0.0.1:${PORT}/`,
    viewport: VIEWPORT,
    // The product is German and its user is in Vienna. Browser-rendered controls
    // follow the browser locale, not the document language: the date fields in
    // the settings showed 09/01/2026 in every screenshot — a date no German
    // reader parses the way it was meant. The visual record has to show what the
    // user sees.
    locale: 'de-AT',
    timezoneId: 'Europe/Vienna',
    // Note on what this does NOT fix: a native <input type="date"> is rendered in
    // the language of the browser application, not of the document. Measured
    // here — navigator.language de-AT, field still "09/01/2026", and --lang did
    // not change it. The product therefore writes the date out in words below
    // the field (datumLang) instead of relying on the browser.
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
      testIgnore: /99-coverage\.spec\.mjs/,
    },
    // Firefox covers what a second engine can actually differ in: layout,
    // storage, focus and date handling. The domain logic is engine-independent,
    // so running the full sweep here would double the wall clock without finding
    // more. Measured once against the complete suite before narrowing it down —
    // the two differences it found (a blocking print dialog, an aborted oversized
    // request) are both in this selection.
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'], viewport: VIEWPORT },
      testMatch: /(00-smoke|02-navigation|06-widgets|09-haertung)\.spec\.mjs/,
    },
    // Visual comparison runs in one browser only: a second engine renders text
    // differently and would produce diffs that say nothing about the product.
    {
      name: 'visual',
      testMatch: /.*\.visual\.spec\.mjs/,
      use: { ...devices['Desktop Chrome'], viewport: VIEWPORT },
    },
    // The click-coverage evaluation, as its own project with dependencies: it
    // must not be scheduled among the recording specs. In a run across several
    // projects it landed mid-list and judged an inventory that was still being
    // filled — reporting "no coverage recorded" for a suite that was working.
    {
      name: 'coverage',
      testMatch: /99-coverage\.spec\.mjs/,
      dependencies: ['chromium', 'firefox', 'visual', 'breakpoints'],
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

  // Blob format while sharding: four partial runs only mean something merged.
  // The timing reporter runs everywhere — it is what noticed the sweep growing.
  reporter: process.env.CI
    ? [['list'], ['blob'], ['./tests/e2e/reporter.mjs']]
    : [['list'], ['./tests/e2e/reporter.mjs']],

  globalSetup: './tests/e2e/global-setup.mjs',
});
