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

    // window.print() opens a modal print dialog that blocks the page. Chromium
    // headless quietly ignores it; Firefox does not, and the run stalled for four
    // minutes on the certificate's print button. What is under test is that the
    // button can be operated, not that a printer dialog appears.
    let gedruckt = 0;
    window.print = () => { gedruckt++; };
    Object.defineProperty(window, '__druckAufrufe', { get: () => gedruckt });

    const stil = document.createElement('style');
    stil.textContent = '*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;' +
      'transition-duration:0s!important;transition-delay:0s!important;scroll-behavior:auto!important}';
    if (document.head) document.head.appendChild(stil);
    else document.addEventListener('DOMContentLoaded', () => document.head.appendChild(stil));
  })();`;
}

/** The eighteen competency ids, as the content defines them. */
const KOMPETENZEN = Array.from({ length: 18 }, (_, i) => 'K' + String(i + 1).padStart(2, '0'));

/** Units in the order the phases present them — the first four count as done. */
const EINHEITEN = [
  'p1-e01-ki-system-rollen', 'p1-e02-digital-omnibus', 'p1-e03-pruefschema',
  'p2-e01-rote-linien', 'p2-e02-zeitschichten', 'p2-e03-graubereiche',
  'p3-e01-anhang3', 'p3-e02-anhang1-und-ausnahmen',
];

/**
 * A learning history that produces something to look at.
 *
 * The fixtures used to set units_done and chapter tests and nothing else, so
 * every visualisation rendered its empty state: a grey article map, a radar
 * collapsed to a dot, a curve flat at zero. Screenshots from that state say
 * nothing about the layout — which is how a review concluded the views were too
 * empty, when in truth the data was.
 *
 * Seeded, so the same fixture always produces the same picture.
 */
function lernhistorie(tage = 30, quote = 0.72) {
  const raus = [];
  let s = 1234567;
  const zufall = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  for (let t = tage; t > 0; t--) {
    const proTag = 4 + Math.floor(zufall() * 6);
    for (let i = 0; i < proTag; i++) {
      const k = KOMPETENZEN[Math.floor(zufall() * KOMPETENZEN.length)];
      const level = ['A', 'B', 'C'][Math.floor(zufall() * 3)];
      // Later days go better — a learning curve, not noise.
      const chance = quote * (0.7 + 0.5 * (1 - t / tage));
      raus.push({
        ts: JETZT - t * 86400_000 + i * 600_000,
        competency: k, level, correct: zufall() < chance,
        confidence: zufall() < 0.6 ? 'sicher' : (zufall() < 0.7 ? 'unsicher' : 'geraten'),
      });
    }
  }
  return raus;
}

/**
 * Completion events for finished units, spread over the period.
 *
 * The learning curve counts events of kind 'unit_completed'; without them it
 * draws today's total as a flat line across every week, which looks like
 * someone who learned everything on day one and nothing since.
 */
function einheitenverlauf(einheiten, tage) {
  return einheiten.map((id, i) => ({
    kind: 'unit_completed',
    ts: JETZT - Math.round(tage * 86400_000 * (1 - (i + 1) / (einheiten.length + 1))),
    competency: 'K' + String((i % 18) + 1).padStart(2, '0'),
    unit_id: id,
  }));
}

/** Cards spread across boxes and due dates, so the review queues are not both zero. */
function karten(anzahl = 40) {
  const raus = [];
  for (let i = 0; i < anzahl; i++) {
    const faellig = i % 5 === 0 ? JETZT - (i % 7) * 86400_000      // overdue: catch-up queue
      : i % 3 === 0 ? JETZT - 3600_000                              // due today: core queue
      : JETZT + (1 + (i % 9)) * 86400_000;                          // later
    const zuletzt = JETZT - (2 + (i % 12)) * 86400_000;
    raus.push({
      id: 'c' + i, box: 1 + (i % 5),
      // Field names taken from newCard() in engine-leitner.js. An invented name
      // here produces a card the engine silently ignores — and a fixture that
      // looks rich in the file and empty on screen.
      retention: ['gelernt', 'vorlaeufig_behalten', 'behalten', 'gefestigt'][i % 4],
      due: faellig, created: zuletzt - 86400_000, last_review: zuletzt,
      competency: KOMPETENZEN[i % KOMPETENZEN.length],
      level: ['A', 'B', 'C'][i % 3],
      unit_id: EINHEITEN[i % EINHEITEN.length],
      history: [{ ts: zuletzt, correct: i % 4 !== 0, confidence: i % 3 ? 'sicher' : 'unsicher' }],
    });
  }
  return raus;
}

/** Minutes and points per day, for the curve and the weekly bars. */
function tagesstatistik(tage = 30) {
  const raus = {};
  for (let t = tage; t >= 0; t--) {
    const d = new Date(JETZT - t * 86400_000);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (t % 7 === 3) continue;                                      // one day off a week
    // reviewDone/questions/units/xp — exactly what dayCounts() reads. "minutes"
    // and "reviewed" were guesses and would have counted as zero learning days.
    raus[key] = { reviewDone: true, questions: 5 + (t % 12), units: t % 3 === 0 ? 1 : 0, xp: 40 + ((t * 13) % 80) };
  }
  return raus;
}

/** State fixtures. Specs jump straight into a situation instead of clicking their way there. */
export const FIXTURES = {
  leer: () => ({}),

  // Fixtures other than `leer` describe someone who has been using the app for a
  // while: hero and the Article 50 notice were acknowledged long ago. Leaving
  // aiNoticeAck unset put a modal in front of every view and turned the sweep's
  // reachability check into a list of false alarms.
  nachPlacement: () => ({
    profile: basisProfil(),
    heroSeen: JETZT - 3600_000,
    aiNoticeAck: JETZT - 3600_000,
    aiNoticeSeen: JETZT - 3600_000,
    placement: { done: true, at: JETZT - 3600_000 },
    xp: 180, level: 1, unit_done: [EINHEITEN[0]],
    events: [...lernhistorie(4, 0.6), ...einheitenverlauf([EINHEITEN[0]], 4)].sort((a, b) => a.ts - b.ts),
    cards: karten(12), dayStats: tagesstatistik(4),
  }),

  mittenInPhase3: () => ({
    profile: basisProfil(),
    heroSeen: JETZT - 7 * 86400_000,
    aiNoticeAck: JETZT - 7 * 86400_000,
    aiNoticeSeen: JETZT - 7 * 86400_000,
    placement: { done: true, at: JETZT - 7 * 86400_000 },
    xp: 1314, level: 3,
    milestones: [{ label: 'Kern (P1–P5)', date: '2026-09-01' }, { label: 'Alles', date: '2026-09-30' }],
    pace: { minutesPerDay: 50, daysPerWeek: 5 },
    unit_done: ['p1-e01-ki-system-rollen', 'p1-e02-digital-omnibus', 'p2-e01-rote-linien', 'p2-e02-zeitschichten'],
    chapterTests: { p1: { passed: true, at: JETZT - 5 * 86400_000, pct: 0.86 },
                    p2: { passed: true, at: JETZT - 2 * 86400_000, pct: 0.9 } },
    events: [...lernhistorie(21),
             ...einheitenverlauf(['p1-e01-ki-system-rollen', 'p1-e02-digital-omnibus',
                                  'p2-e01-rote-linien', 'p2-e02-zeitschichten'], 21)]
             .sort((a, b) => a.ts - b.ts),
    cards: karten(40), dayStats: tagesstatistik(21),
  }),

  examensreif: () => {
    const st = {
      profile: basisProfil(),
      heroSeen: JETZT - 40 * 86400_000,
      aiNoticeAck: JETZT - 40 * 86400_000,
      aiNoticeSeen: JETZT - 40 * 86400_000,
      placement: { done: true, at: JETZT - 40 * 86400_000 },
      xp: 4200, level: 4,
      milestones: [{ label: 'Kern (P1–P5)', date: '2026-09-01' }, { label: 'Alles', date: '2026-09-30' }],
      pace: { minutesPerDay: 50, daysPerWeek: 5 },
      unit_done: [], unit_skipped: [], chapterTests: {},
      events: [...lernhistorie(40, 0.84), ...einheitenverlauf(EINHEITEN, 40)].sort((a, b) => a.ts - b.ts),
      cards: [], dayStats: tagesstatistik(40),
    };
    st.unit_done = [...EINHEITEN];
    // All nine chapter tests passed, comfortably in the past so retention holds.
    for (let i = 1; i <= 9; i++) {
      st.chapterTests['p' + i] = { passed: true, at: JETZT - (30 - i) * 86400_000, pct: 0.85 };
    }
    // Cards confirmed at the seven-day tier, which the exam gate requires.
    for (let i = 0; i < 24; i++) {
      st.cards.push({
        id: 'c' + i, box: 4, retention: 'behalten',
        due: JETZT + 3 * 86400_000, last_review: JETZT - 8 * 86400_000,
        created: JETZT - 30 * 86400_000, history: [],
        competency: 'K' + String((i % 18) + 1).padStart(2, '0'), level: 'B',
      });
    }
    return st;
  },

  abgeschlossen: () => {
    const st = FIXTURES.examensreif();
    const tag = new Date(JETZT - 86400_000);
    const tagKey = `${tag.getFullYear()}-${String(tag.getMonth() + 1).padStart(2, '0')}-${String(tag.getDate()).padStart(2, '0')}`;
    st.examAttempts = [{ passed: true, day: tagKey, at: JETZT - 86400_000, scoreA: 0.88, scoreB: 0.84, regime: 'r1' }];
    // The record reads the score series, not the attempts. Without them the
    // fixture claimed a finished course while the certificate said "no exam
    // passed yet" — a state a real learner can never be in, and every test built
    // on it would have been testing nothing.
    st.scoreSeries = { '2026-07-27|c1|1.2.0|claude-opus-5': { runs: [{ pct: 0.86 }, { pct: 0.88 }] } };
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
      // Export reads the store as a whole through its own endpoint. Left
      // unintercepted it reached the real bridge store, so a test exercising the
      // export was reading the owner's actual learning record — and comparing it
      // against a fixture it did not contain.
      await page.route('**/api/export', async (route) => route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({
          exportedAt: new Date(JETZT).toISOString(),
          warning: 'Enthält persönliche Lerndaten.',
          data: { progress: speicher.progress ?? null, notes: speicher.notes ?? null, journal: null, pool: null },
        }),
      }));
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
        // Write while no application is running. Writing through the live page
        // loses the same race as below: the page persists its own state right
        // after and overwrites the fixture (measured: 1234 came back as 738).
        const token = await page.evaluate(() => window.BRIDGE_TOKEN || '');
        const basis = new URL(page.url()).origin;
        await page.goto('about:blank');
        const antwort = await page.request.put(`${basis}/api/progress`, {
          headers: { 'Content-Type': 'application/json', 'X-Bridge-Token': token },
          data: { state: daten },
        });
        if (!antwort.ok()) throw new Error(`fixture write failed: HTTP ${antwort.status()}`);
        await page.goto('/', { waitUntil: 'load' });
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
  // The opening choreography lies in front of the page while it runs. Measuring
  // through it reported every control as covered by div.intro — a real overlay,
  // but not one a user ever clicks against.
  await page.waitForFunction(() => !document.querySelector('.intro'), { timeout: 8000 })
    .catch(() => { /* no intro on this route */ });

  // Polled here rather than via waitForFunction: that call gets its budget
  // trimmed by the remaining test time and then reports "10000ms exceeded" for a
  // view that simply needed two seconds — which reads like a hanging application
  // and is not one.
  const ende = Date.now() + timeout;
  for (;;) {
    const da = await page.evaluate(
      () => (document.getElementById('view')?.children.length ?? 0) > 0).catch(() => false);
    if (da) return;
    if (Date.now() > ende) {
      throw new Error(`the view stayed empty for ${timeout} ms at ${await page.evaluate(() => location.hash)}`);
    }
    await page.waitForTimeout(150);
  }
}

/**
 * Dismisses everything that legitimately sits in front of the page.
 *
 * Hero and the AI notice appear on a first visit; the full-screen ceremony fires
 * on a level-up or a finished phase and is modal by design (§6.3). All three are
 * closed the way a user closes them — by clicking their button.
 */
export async function schliesseOverlays(page) {
  // Cheap check first: without it this ran sixteen locator calls per navigation
  // even when nothing was on screen, and the sweep navigates hundreds of times.
  // A short grace period, because the overlays are added after the state loads —
  // on a slower machine the check ran before the modal existed, and the next
  // control was then covered by something that should have been dismissed.
  let offen = false;
  for (let i = 0; i < 3 && !offen; i++) {
    offen = await page.evaluate(() =>
      !!document.querySelector('.hero-overlay, .ai-notice-overlay, .intro-skip, .stage-ceremony'))
      .catch(() => true);
    if (!offen) await page.waitForTimeout(70);
  }
  if (!offen) return;

  const SELEKTOREN = ['.hero-overlay button', '.ai-notice-overlay button', '.intro-skip',
                      '.stage-ceremony button'];
  // Several rounds on purpose: the overlays appear one after another and some
  // only after the state has loaded. A single pass left the hero standing, and
  // the reachability probe then reported the page behind it as blocked — which
  // it genuinely was, just not for the reason under test.
  for (let runde = 0; runde < 4; runde++) {
    let geklickt = false;
    for (const sel of SELEKTOREN) {
      const el = page.locator(sel).first();
      if (await el.count() && await el.isVisible().catch(() => false)) {
        await el.click().catch(() => {});
        geklickt = true;
      }
    }
    await page.waitForTimeout(150);
    const offen = await page.locator('.hero-overlay, .ai-notice-overlay, .stage-ceremony').count();
    if (!offen && !geklickt) break;
  }
}

/**
 * Waits until something in the view can be operated again.
 *
 * After an answer the engine shows its explanation for a moment before moving
 * on. A fixed short pause reads that gap as "nothing left to do" and reports a
 * working drill as stuck — which is exactly what happened while writing this.
 */
export async function warteAufKlickbares(page, timeout = 6000) {
  try {
    await page.waitForFunction(() => {
      const v = document.getElementById('view');
      if (!v) return false;
      return [...v.querySelectorAll('button, a[href], input, select')]
        .some(n => !n.disabled && n.offsetParent !== null);
    }, { timeout });
    return true;
  } catch { return false; }
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
