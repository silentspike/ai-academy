// Shared fixtures for the interaction suite.
//
// Everything that must hold for every single spec lives here, so no spec can
// forget it: the window-size guard, pinned time, seeded randomness, silenced
// animation, and the overlays that would otherwise sit in front of the interface.

import { test as base, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(new URL('../..', import.meta.url).pathname);

// The size the suite is built around. See playwright.config.mjs for the why.
export const SOLL_BREITE = 1920;
export const SOLL_HOEHE = 1026;

// Pinned point in time. Everything time-dependent — day boundaries, retention
// tiers, the weekly goal, the target curve — is derived from this.
export const JETZT = Date.parse('2026-07-25T09:00:00+02:00');

/**
 * Injected before any application code runs. Pins Date, seeds Math.random and
 * disables animation. Without this an image comparison compares noise.
 */
function determinismusSkript(jetzt) {
  return `(() => {
    const FIXIERT = ${jetzt};
    const EchtesDate = Date;
    class FixedDate extends EchtesDate {
      constructor(...a) { if (a.length === 0) super(FIXIERT); else super(...a); }
      static now() { return FIXIERT; }
    }
    globalThis.Date = FixedDate;

    let s = 42;
    Math.random = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };

    const stil = document.createElement('style');
    stil.textContent = '*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;' +
      'transition-duration:0s!important;transition-delay:0s!important;scroll-behavior:auto!important}';
    if (document.head) document.head.appendChild(stil);
    else document.addEventListener('DOMContentLoaded', () => document.head.appendChild(stil));
  })();`;
}

/** State fixtures. Specs jump straight into a situation instead of clicking their way there. */
export const FIXTURES = {
  leer: () => ({}),

  nachPlacement: () => ({
    profile: basisProfil(),
    heroSeen: JETZT - 3600_000,
    aiNoticeSeen: JETZT - 3600_000,
    placement: { done: true, at: JETZT - 3600_000 },
    xp: 40, level: 1, events: [], cards: [], dayStats: {},
  }),

  mittenInPhase3: () => ({
    profile: basisProfil(),
    heroSeen: JETZT - 7 * 86400_000,
    aiNoticeSeen: JETZT - 7 * 86400_000,
    placement: { done: true, at: JETZT - 7 * 86400_000 },
    xp: 640, level: 2,
    units_done: ['p1-e01-ki-system-rollen', 'p1-e02-digital-omnibus', 'p2-e01-rote-linien', 'p2-e02-zeitschichten'],
    chapterTests: { p1: { passed: true, at: JETZT - 5 * 86400_000, score: 0.86 },
                    p2: { passed: true, at: JETZT - 2 * 86400_000, score: 0.9 } },
    events: [], cards: [], dayStats: {},
  }),

  examensreif: () => {
    const st = {
      profile: basisProfil(),
      heroSeen: JETZT - 40 * 86400_000,
      aiNoticeSeen: JETZT - 40 * 86400_000,
      placement: { done: true, at: JETZT - 40 * 86400_000 },
      xp: 4200, level: 4,
      units_done: [], chapterTests: {}, events: [], cards: [], dayStats: {},
    };
    // All nine chapter tests passed, comfortably in the past so retention holds.
    for (let i = 1; i <= 9; i++) {
      st.chapterTests['p' + i] = { passed: true, at: JETZT - (30 - i) * 86400_000, score: 0.85 };
    }
    // Cards confirmed at the seven-day tier, which the exam gate requires.
    for (let i = 0; i < 24; i++) {
      st.cards.push({
        id: 'c' + i, box: 4, retention: 'behalten',
        due: JETZT + 3 * 86400_000, last_reviewed: JETZT - 8 * 86400_000,
        competency: 'K' + String((i % 18) + 1).padStart(2, '0'), level: 'B',
      });
    }
    return st;
  },

  abgeschlossen: () => {
    const st = FIXTURES.examensreif();
    st.examAttempts = [{ passed: true, at: JETZT - 86400_000, scoreA: 0.88, scoreB: 0.84, regime: 'r1' }];
    st.xp = 6100; st.level = 5;
    return st;
  },
};

function basisProfil() {
  // Fictional throughout — the repository ships no real profile.
  return {
    org: 'Beispielbank AG', orgTyp: 'finanzdienstleister', land: 'AT',
    rollen: ['betreiber'], jobRolle: 'Compliance', vorwissen: 'mittel',
    motiv: 'projekt', minutenProTag: 45, lerntageProWoche: 5,
    meilensteine: [{ label: 'Kern', datum: '2026-09-01' }, { label: 'Alles', datum: '2026-09-30' }],
    levelEndtitel: 'KI-Beauftragte:r',
  };
}

export const test = base.extend({
  /**
   * Window-size guard. Runs before anything else and fails the test outright if
   * the rendering area is not what the suite assumes. Better a red test than a
   * green suite full of screenshots judged at the wrong width.
   */
  /** Specs that need the bridge's own store set this to true. */
  echterStore: [false, { option: true }],

  /** The per-test store contents, shared between the route handler and `zustand`. */
  speicher: async ({}, use) => { await use({ progress: {}, notes: {} }); },

  page: async ({ page, echterStore, speicher }, use, testInfo) => {
    await page.addInitScript(determinismusSkript(JETZT));

    // Block image requests unless this spec compares images: a ceremony cover is
    // several hundred kilobytes and contributes nothing to a functional check.
    const visuell = /visual|breakpoint/.test(testInfo.project.name) || /\.visual\./.test(testInfo.file);
    if (!visuell) {
      // Serve a 1×1 pixel instead of aborting: an aborted request shows up as a
      // console error, and the suite treats console errors as defects. The point
      // is to save bandwidth, not to manufacture failures.
      await page.route('**/assets/**/*.{png,jpg,jpeg,webp,avif}', r => r.fulfill({
        status: 200,
        contentType: 'image/gif',
        body: Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64'),
      }));
    }

    // ---- Per-test store -------------------------------------------------
    // All tests talk to one bridge process, and the bridge keeps exactly one
    // progress document. With two or more workers the state fixtures overwrite
    // each other — a test would silently run against a neighbour's state (that
    // is how "examensreif" ended up seeing the mid-phase-3 fixture).
    //
    // The requests are answered per test instead. Everything real stays real:
    // the adapter, fetch, the JSON round trip, the token header. Only the file
    // behind it is private to this test. The bridge's own store is covered by
    // the persistence spec, which opts out via `echterStore` and runs serially.
    if (!echterStore) {
      const bediene = (name) => async (route) => {
        const req = route.request();
        const json = (obj) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(obj) });
        if (process.env.E2E_STORE_DEBUG) console.log('[store]', req.method(), name, (req.postData()||'').slice(0,80));
        if (req.method() === 'PUT') {
          try { speicher[name] = JSON.parse(req.postData() || '{}'); } catch { /* keep previous */ }
          return json({ ok: true });
        }
        return json(speicher[name]);
      };
      await page.route('**/api/progress', bediene('progress'));
      await page.route('**/api/notes', bediene('notes'));
    }

    await page.goto('/', { waitUntil: 'load' });
    const groesse = await page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }));

    if (testInfo.project.name !== 'breakpoints') {
      if (groesse.w !== SOLL_BREITE || groesse.h !== SOLL_HOEHE) {
        throw new Error(
          `Window size is ${groesse.w}x${groesse.h}, expected ${SOLL_BREITE}x${SOLL_HOEHE}. ` +
          'Screenshots at the wrong size are worthless — aborting before any is taken. ' +
          'Note that --start-maximized alone does not change the viewport; ' +
          'it needs viewport: null or an explicit value.');
      }
    }

    await use(page);
  },

  /** Loads a state fixture and reloads, so the application starts from it. */
  zustand: async ({ page, speicher, echterStore }, use) => {
    await use(async (name) => {
      if (typeof name === 'string' && !FIXTURES[name]) throw new Error(`Unknown fixture: ${name}`);
      const daten = typeof name === 'string' ? FIXTURES[name]() : name;

      if (echterStore) {
        // Bridge-backed spec: go through the application, which is the point there.
        await page.evaluate(async (d) => {
          const { StorageAdapter } = await import('./app/storage-adapter.js');
          await StorageAdapter.bridgeStore({}).set('state', d);
        }, daten);
      } else {
        // Set the precondition directly. Writing it through the running page
        // loses a race: the page persists its own (empty) state right after and
        // wipes the fixture — verified via the store log.
        speicher.progress = { ...speicher.progress, state: daten };
      }
      // 'load', not 'networkidle': the application keeps a connection open, so
      // waiting for the network to fall silent waits forever.
      await page.reload({ waitUntil: 'load' });
      await page.waitForFunction(() => !!document.querySelector('.sidebar, .rail, nav, main'), { timeout: 15_000 });
      await schliesseOverlays(page);
    });
  },
});

/**
 * Waits until the router has actually rendered something into the view.
 *
 * The application plays a staged opening before the first render. Measuring on a
 * fixed timer either flakes or, worse, reports an empty view as a defect — which
 * is exactly what happened while building this suite.
 */
export async function warteAufAnsicht(page, timeout = 20_000) {
  await page.waitForFunction(
    () => (document.getElementById('view')?.children.length ?? 0) > 0,
    { timeout });
}

/**
 * Dismisses everything that legitimately sits in front of the page.
 *
 * Hero and the AI notice appear on a first visit; the full-screen ceremony fires
 * on a level-up or a finished phase and is modal by design (§6.3). All three are
 * closed the way a user closes them — by clicking their button.
 */
export async function schliesseOverlays(page) {
  for (const sel of ['.hero-overlay button', '.ai-notice-overlay button', '.intro-skip',
                     '.stage-ceremony button']) {
    const el = page.locator(sel).first();
    if (await el.count() && await el.isVisible().catch(() => false)) {
      await el.click().catch(() => {});
    }
  }
  await page.waitForTimeout(120);
}

/** Content-driven: specs iterate over the real inventory rather than a hard-coded list. */
export function einheiten() {
  return JSON.parse(readFileSync(join(ROOT, 'content/units/index.json'), 'utf8')).units ?? [];
}

/** Phase identifiers, derived from the unit inventory — there is no separate phase file. */
export function phasen() {
  return [...new Set(einheiten().map(u => u.phase))].sort(
    (a, b) => Number(a.slice(1)) - Number(b.slice(1)));
}

export { expect };
