import { test, expect, FIXTURES, schliesseOverlays, warteAufAnsicht, warteAufKlickbares } from '../harness.mjs';
import { erfasse, klicke } from '../coverage.mjs';

// First launch and setup — split out of 10-lebenszyklus.
//
// Not for tidiness: the timing reporter fails a shard when one FILE takes more
// than three quarters of it, because a file that dominates its shard makes the
// twelve-way split pointless. Together these ten tests did exactly that (84 % of
// a 90 s shard). They also cover two different things — arriving for the first
// time, and a learning day once you are set up — so the split follows the
// subject as much as the clock.

test.describe('first launch', () => {
  // Several of these walk through multiple states, each with a reload. The
  // default budget runs out mid-wait and reports it as a hanging view.
  test.describe.configure({ timeout: 120_000 });

  test('a first launch leads into onboarding, not into an empty view', async ({ page, zustand }) => {
    // The overlays stay: this test is about them, and the setup would otherwise
    // click them away — which now persists, so they would not return.
    await zustand(FIXTURES.leer(), { overlaysStehenLassen: true });

    // Before the first tutor interaction the product has to say that an AI system
    // answers and grades (§5.0, Article 50 applied to itself). The staged first
    // contact comes first (§6.3) and the notice follows it.
    await page.waitForSelector('.hero-overlay', { timeout: 15_000 });
    await page.click('.hero-overlay button');
    await page.waitForSelector('.ai-notice-overlay, .hero-overlay', { timeout: 15_000 });
    await page.waitForFunction(
      () => /KI-System|Art\.?\s*50/i.test(document.body.innerText), { timeout: 15_000 })
      .catch(() => { throw new Error('the first launch never shows the AI notice'); });

    await schliesseOverlays(page);
    await page.waitForTimeout(400);
    const wo = await page.evaluate(() => location.hash);
    expect(wo, 'a first launch without a profile does not open onboarding').toMatch(/onboarding/);
  });

  test('during setup there is no navigation, and every route leads back into it', async ({ page, zustand }) => {
    // The redirect into the wizard used to run once at startup. One click on
    // "Dashboard" therefore stranded the user in a view with no relevance
    // ranking, no radar data, no target date and no way back — while the
    // half-filled draft sat in the record, saved and unreachable.
    await zustand('leer');
    await page.goto('/#/onboarding', { waitUntil: 'load' });
    await schliesseOverlays(page);
    await warteAufAnsicht(page);

    const sichtbar = await page.evaluate(() => ({
      lernnav: !!document.querySelector('#lernnav')?.offsetParent,
      phasen: [...document.querySelectorAll('#phase-tree .ph')].filter(e => e.offsetParent).length,
      suche: !!document.getElementById('tb-suche-feld')?.offsetParent,
      railPunkte: [...document.querySelectorAll('.rail-item')].filter(e => e.offsetParent).length,
      setupSchritte: document.querySelectorAll('.setup-schritt').length,
      jetzt: document.querySelector('.setup-schritt.jetzt')?.textContent?.trim(),
    }));
    expect(sichtbar.lernnav, 'the learning navigation is visible during setup').toBe(false);
    expect(sichtbar.phasen, 'phases are listed during setup').toBe(0);
    expect(sichtbar.suche, 'search is offered during setup').toBe(false);
    expect(sichtbar.railPunkte, 'the rail still offers destinations').toBeLessThanOrEqual(1);
    // Something has to take its place, or the sidebar is simply empty.
    expect(sichtbar.setupSchritte, 'the wizard steps are not shown').toBe(7);
    expect(sichtbar.jetzt, 'no step is marked as the current one').toContain('Verbinden');

    // Every route leads back — by hash, as a stray click or a bookmark would.
    for (const route of ['#/dashboard', '#/lernen', '#/examen', '#/karten', '#/heute']) {
      await page.evaluate(r => { location.hash = r; }, route);
      await page.waitForTimeout(220);
      expect(page.url(), `${route} did not lead back into the wizard`).toContain('#/onboarding');
    }
  });

  test('the navigation appears once a profile exists', async ({ page, zustand }) => {
    // The counterpart: with the redirect in place, a wizard that cannot end
    // would be worse than the problem it solves.
    await zustand('nachPlacement');
    await page.goto('/#/dashboard', { waitUntil: 'load' });
    await schliesseOverlays(page);
    await warteAufAnsicht(page);

    const m = await page.evaluate(() => ({
      imSetup: document.querySelector('.app-shell')?.classList.contains('im-setup'),
      lernnav: !!document.querySelector('#lernnav')?.offsetParent,
      phasen: [...document.querySelectorAll('#phase-tree .ph')].filter(e => e.offsetParent).length,
      setupSichtbar: !document.getElementById('setup-fortschritt')?.hidden,
    }));
    expect(m.imSetup, 'still in setup mode although a profile exists').toBe(false);
    expect(m.lernnav).toBe(true);
    expect(m.phasen).toBe(10);
    expect(m.setupSichtbar, 'the setup steps are still shown').toBe(false);
    expect(page.url()).toContain('#/dashboard');
  });

  test('onboarding walks through its steps and refuses to skip the model check', async ({ page, zustand }) => {
    await zustand(FIXTURES.leer());
    await page.goto('/#/onboarding', { waitUntil: 'load' });
    await schliesseOverlays(page);
    await warteAufAnsicht(page);

    const kopf = await page.evaluate(() => document.getElementById('view').innerText);
    expect(kopf, 'onboarding does not show its steps').toMatch(/Schritt 1\/\d/);
    expect(kopf, 'onboarding does not report the connection state').toMatch(/Bridge|CLI|Modell/i);

    // Three steps, not ten. What this test asserts is that the wizard advances at
    // all and that the model check cannot be skipped; steps four to seven add
    // seconds and no assertion. The full walk lives in the onboarding unit tests,
    // which need no browser.
    let schritte = 0;
    for (let i = 0; i < 3; i++) {
      const weiter = page.locator('#view button:has-text("Weiter"):not([disabled])').first();
      // Step 1 asks the bridge which model answers before it offers anything to
      // click. Without waiting, the loop broke on the first pass and reported
      // "onboarding cannot be advanced at all" for a wizard that was merely
      // still checking the connection.
      await weiter.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {});
      if (!await weiter.count()) break;
      await klicke(page, weiter, '#/onboarding');
      await warteAufKlickbares(page, 5000);
      schritte++;
    }
    expect(schritte, 'onboarding cannot be advanced at all').toBeGreaterThan(0);
    await erfasse(page, '#/onboarding');
  });

  // Der Machbarkeits-Schritt hatte drei Fehler übereinander, jeder allein
  // ausreichend: `feasibilityCheck` liefert ein ARRAY, gelesen wurde
  // `res.feasible` (auf einem Array immer undefined → IMMER die Warnung); das
  // Feld heißt `neededMinutesPerDay`, gelesen wurde `neededPerDay` → die Seite
  // sagte „~undefined min/Tag"; und der Stoff kam als `{ totalMinutes }`, gelesen
  // werden `totalUnits`/`minutesPerUnit` → die Rechnung lief auf NaN.
  test('the feasibility step computes instead of always warning', async ({ page, zustand }) => {
    await zustand('nachPlacement');
    await page.evaluate(() => localStorage.clear());
    await page.goto('/#/onboarding', { waitUntil: 'load' });
    await schliesseOverlays(page);
    await warteAufAnsicht(page);

    const schritt = async (werte = {}) => {
      await page.evaluate((w) => {
        for (const [id, v] of Object.entries(w)) {
          const el = document.getElementById(id);
          if (el) { el.value = v; el.dispatchEvent(new Event('change', { bubbles: true })); }
        }
        const b = [...document.querySelectorAll('#view button')].find(x => /weiter|los geht/i.test(x.textContent));
        b?.click();
      }, werte);
      await page.waitForTimeout(700);
    };
    // Bis zum Lernprofil durch: Verbinden → Fachprofil → Lernprofil
    for (let i = 0; i < 6; i++) {
      const titel = await page.evaluate(() => document.querySelector('#view h3')?.innerText ?? '');
      if (/Lernprofil/.test(titel)) break;
      await schritt({ 'ob-org': 'Regionalbank' });
    }

    // Großzügiges Pensum: muss MACHBAR sein und darf keine Warnung zeigen.
    await schritt({ 'ob-ziel': '2026-12-31', 'ob-min': '120', 'ob-tage': '6' });
    let text = await page.evaluate(() => document.getElementById('view').innerText);
    expect(text, 'the feasibility step never says a generous plan works').toMatch(/Machbar/);
    expect(text, 'the calculation shows undefined instead of a number').not.toMatch(/undefined|NaN/);

    // Der Rückweg führt ins Lernprofil UND behält die Eingaben.
    await page.evaluate(() => [...document.querySelectorAll('#view button')]
      .find(b => /Pensum anpassen/i.test(b.textContent))?.click());
    await page.waitForTimeout(700);
    expect(await page.evaluate(() => document.querySelector('#view h3')?.innerText))
      .toMatch(/Lernprofil/);
    expect(await page.evaluate(() => document.getElementById('ob-min')?.value),
      'the way back resets what was typed').toBe('120');

    // Knappes Pensum: muss durchfallen und sagen, WAS fehlt.
    await schritt({ 'ob-ziel': '2026-08-15', 'ob-min': '20', 'ob-tage': '2' });
    text = await page.evaluate(() => document.getElementById('view').innerText);
    expect(text, 'an impossible plan is waved through').toMatch(/geht sich nicht aus/);
    expect(text, 'it does not say what is missing').toMatch(/Es fehlen rund [\d,]+ Stunden/);
    expect(text).not.toMatch(/undefined|NaN/);
  });
});
