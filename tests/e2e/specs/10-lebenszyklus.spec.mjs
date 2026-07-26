import { test, expect, FIXTURES, JETZT, schliesseOverlays, warteAufAnsicht, warteAufKlickbares } from '../harness.mjs';
import { erfasse, klicke } from '../coverage.mjs';

// The path a real person takes, start to finish: first launch, the Article 50
// notice, onboarding, placement, a learning day, and the maintenance mode that
// follows passing. Every route on its own can look fine while the sequence is
// broken — that is what this spec covers.

test.describe('lifecycle', () => {
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

    let schritte = 0;
    for (let i = 0; i < 10; i++) {
      const weiter = page.locator('#view button:has-text("Weiter"):not([disabled])').first();
      if (!await weiter.count()) break;
      await klicke(page, weiter, '#/onboarding');
      await warteAufKlickbares(page, 5000);
      schritte++;
    }
    expect(schritte, 'onboarding cannot be advanced at all').toBeGreaterThan(0);
    await erfasse(page, '#/onboarding');
  });

  test('a learning day follows the ritual: review, units, drill, wrap-up', async ({ page, zustand }) => {
    // #32: the fixed order removes the daily "where do I start" decision. If the
    // route shows the steps in a different order, the ritual is not a ritual.
    await zustand('mittenInPhase3');
    await page.goto('/#/heute', { waitUntil: 'load' });
    await schliesseOverlays(page);
    await warteAufAnsicht(page);

    const schritte = await page.locator('.ritual-step').allInnerTexts();
    expect(schritte.length, 'the day shows no ritual').toBeGreaterThan(2);
    const text = schritte.join(' | ');
    expect(text, 'review does not come first').toMatch(/^[^|]*(Wiederhol|Review|Karten)/i);
    expect(text, 'the drill is missing from the ritual').toMatch(/Drill/i);
    await erfasse(page, '#/heute');
  });

  test('the ritual links actually lead where they say', async ({ page, zustand }) => {
    await zustand('mittenInPhase3');
    await page.goto('/#/heute', { waitUntil: 'load' });
    await schliesseOverlays(page);
    await warteAufAnsicht(page);

    const links = await page.locator('.ritual-step[href], .ritual-step a[href]').all();
    expect(links.length, 'no ritual step is clickable').toBeGreaterThan(1);
    for (const l of links.slice(0, 4)) {
      const ziel = await l.getAttribute('href');
      await klicke(page, l, '#/heute');
      await page.waitForTimeout(300);
      expect(page.url(), `ritual step does not lead to ${ziel}`).toContain(ziel.replace('#', ''));
      await page.goto('/#/heute', { waitUntil: 'load' });
      await schliesseOverlays(page);
      await warteAufAnsicht(page);
    }
  });

  test('after passing, maintenance mode keeps the material alive', async ({ page, zustand }) => {
    // #36: knowledge decays without use. The minimum dose has to be visible, or
    // the tool stops being a companion the day the exam is over.
    await zustand('abgeschlossen');
    await page.goto('/#/heute', { waitUntil: 'load' });
    await schliesseOverlays(page);
    await warteAufAnsicht(page);

    const text = await page.evaluate(() => document.getElementById('view').innerText);
    expect(text, 'nothing points to maintenance after passing').toMatch(/Erhaltung|Wiederhol|täglich/i);
  });

  test('the wrap-up offers the export as a safety net', async ({ page, zustand }) => {
    // §5.5: browsers clear their storage. The export is the answer, and it has to
    // be offered where a long session ends.
    // The hint is tied to a long session (45 minutes or a large amount of work) —
    // that condition is created here rather than hoped for.
    const heute = new Date(JETZT);
    const tag = `${heute.getFullYear()}-${String(heute.getMonth() + 1).padStart(2, '0')}-${String(heute.getDate()).padStart(2, '0')}`;
    await zustand({
      ...FIXTURES.mittenInPhase3(),
      // The session duration is derived from when it started, so a ninety-minute
      // session is created by starting it ninety minutes ago.
      session: {
        day: tag, started: JETZT - 90 * 60_000, unitsDone: 3,
        review: { kern: [], aufhol: [], retentionChecks: [] },
        drill: { done: true, fragen: [] },
      },
    });
    await page.goto('/#/wrapup', { waitUntil: 'load' });
    await schliesseOverlays(page);
    await warteAufAnsicht(page);

    const text = await page.evaluate(() => document.getElementById('view').innerText);
    expect(text, 'a long session gets no export hint').toMatch(/export/i);
    const knopf = page.locator('#view button').first();
    await expect(knopf, 'the wrap-up offers no button').toBeVisible();
    await erfasse(page, '#/wrapup');
  });

  test('the record is reachable from an empty start, and looks right', async ({ page, zustand }) => {

    // One pass through the whole arc: empty state → onboarding → learning →
    // passed → record. Time travel replaces the weeks in between; what is being
    // checked is that the sequence connects at all and that the finished
    // document is presentable.
    await zustand(FIXTURES.leer());
    await page.goto('/', { waitUntil: 'load' });
    await schliesseOverlays(page);
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => location.hash), 'an empty start does not begin at onboarding')
      .toMatch(/onboarding/);

    // Jump forward: the same states a learner reaches over weeks.
    await zustand('mittenInPhase3');
    await page.goto('/#/lernen', { waitUntil: 'load' });
    await schliesseOverlays(page);
    await warteAufAnsicht(page, 30_000);

    await zustand('examensreif');
    await page.goto('/#/examen', { waitUntil: 'load' });
    await schliesseOverlays(page);
    await warteAufAnsicht(page, 30_000);
    await expect(page.locator('#view button:has-text("Examen starten")').first(),
      'the exam does not open even when everything is in place').toBeVisible();

    await zustand('abgeschlossen');
    await page.goto('/#/lernnachweis', { waitUntil: 'load' });
    await schliesseOverlays(page);
    await warteAufAnsicht(page);

    const text = await page.evaluate(() => document.getElementById('view').innerText);
    expect(text, 'the record does not name the legal baseline').toMatch(/2026-07-27/);
    expect(text, 'the record carries no disclaimer').toMatch(/unbeaufsichtigt/i);
    // A finished course must show a result. "No exam passed yet" next to 9/9
    // chapter tests is a state no learner can actually reach.
    expect(text, 'the finished record shows no exam result')
      .not.toMatch(/noch kein bestandenes Examen/i);
    expect(text, 'the record shows no score').toMatch(/8[0-9]\s*%|0\.8[0-9]/);

    // The record is a document people print and show. It is captured so the
    // result can be looked at, not only asserted about.
    await page.screenshot({ path: 'test-results/lernnachweis.png', fullPage: true });
  });

  test('settings can be changed and the change sticks', async ({ page, zustand }) => {
    // §5.1: a learning profile is a snapshot, not a vow.
    await zustand('mittenInPhase3');
    await page.goto('/#/einstellungen', { waitUntil: 'load' });
    await schliesseOverlays(page);
    await warteAufAnsicht(page);

    const feld = page.locator('#view input[type="number"], #view input[type="range"]').first();
    test.skip(!await feld.count(), 'settings offer no numeric field');
    await feld.scrollIntoViewIfNeeded();
    await feld.fill('42').catch(async () => { await feld.evaluate(n => { n.value = 42; n.dispatchEvent(new Event('input', { bubbles: true })); }); });

    const speichern = page.locator('#view button.btn-primary').first();
    if (await speichern.count()) await klicke(page, speichern, '#/einstellungen');
    await page.waitForTimeout(400);

    await page.reload({ waitUntil: 'load' });
    await schliesseOverlays(page);
    await warteAufAnsicht(page);
    const wert = await page.locator('#view input[type="number"], #view input[type="range"]').first().inputValue();
    expect(wert, 'the changed setting did not survive a reload').toBe('42');
    await erfasse(page, '#/einstellungen');
  });
});
