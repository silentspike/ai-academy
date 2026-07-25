import { test, expect, FIXTURES, JETZT, schliesseOverlays, warteAufAnsicht, warteAufKlickbares } from '../harness.mjs';
import { erfasse, klicke } from '../coverage.mjs';

// The path a real person takes, start to finish: first launch, the Article 50
// notice, onboarding, placement, a learning day, and the maintenance mode that
// follows passing. Every route on its own can look fine while the sequence is
// broken — that is what this spec covers.

test.describe('lifecycle', () => {
  test('a first launch leads into onboarding, not into an empty view', async ({ page, zustand }) => {
    await zustand(FIXTURES.leer());
    await page.goto('/', { waitUntil: 'load' });

    // Before the first tutor interaction the product has to say that an AI system
    // answers and grades (§5.0, Article 50 applied to itself). It appears after
    // the state has loaded, so it is waited for rather than sampled.
    await page.waitForSelector('.ai-notice-overlay, .hero-overlay', { timeout: 15_000 });
    await page.waitForFunction(
      () => /KI-System|Art\.?\s*50/i.test(document.body.innerText), { timeout: 15_000 })
      .catch(() => { throw new Error('the first launch never shows the AI notice'); });

    await schliesseOverlays(page);
    await page.waitForTimeout(400);
    const wo = await page.evaluate(() => location.hash);
    expect(wo, 'a first launch without a profile does not open onboarding').toMatch(/onboarding/);
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
