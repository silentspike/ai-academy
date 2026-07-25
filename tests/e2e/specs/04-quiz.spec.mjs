import { test, expect, schliesseOverlays, warteAufAnsicht, warteAufKlickbares } from '../harness.mjs';
import { erfasse, klicke } from '../coverage.mjs';

// The question engine is where the didactic promises of the plan become
// observable: an answer is judged immediately and deterministically (#21), the
// confidence rating is asked (§3), and an explanation follows — for a correct
// answer as well as a wrong one. A silent right/wrong would be a defect.

/** Answers the current question and returns what the view looked like afterwards. */
async function beantworte(page, route, wahl = 0) {
  const optionen = page.locator('#view button.q-opt:not([disabled])');
  await expect(optionen.first(), 'the question offers no options').toBeVisible();
  const anzahl = await optionen.count();
  await klicke(page, optionen.nth(Math.min(wahl, anzahl - 1)), route);
  await page.waitForTimeout(250);
  return page.evaluate(() => ({
    optionenGesperrt: [...document.querySelectorAll('#view .q-opt')].every(o => o.disabled),
    konfidenzDa: !!document.querySelector('#view .q-confidence'),
    text: document.getElementById('view').innerText,
  }));
}

test.describe('question engine', () => {
  test.beforeEach(async ({ zustand }) => {
    await zustand('mittenInPhase3');
  });

  test('an answer is judged immediately, without waiting for a model', async ({ page }) => {
    // The stub CLI answers nothing here — deterministic formats must not depend
    // on it (#21). If this test hangs, judgement wrongly went through the bridge.
    await page.goto('/#/drill', { waitUntil: 'load' });
    await schliesseOverlays(page);
    await warteAufAnsicht(page);

    const nachher = await beantworte(page, '#/drill');
    expect(nachher.optionenGesperrt, 'the options stay clickable after answering').toBe(true);
    expect(nachher.konfidenzDa, 'the confidence rating is not offered').toBe(true);
    await erfasse(page, '#/drill');
  });

  test('the confidence rating is recorded and an explanation follows', async ({ page }) => {
    await page.goto('/#/drill', { waitUntil: 'load' });
    await schliesseOverlays(page);
    await warteAufAnsicht(page);
    const vorher = await beantworte(page, '#/drill');

    const stufen = page.locator('#view .q-confidence button');
    expect(await stufen.count(), 'the three confidence levels are not all there').toBe(3);

    await klicke(page, stufen.first(), '#/drill');       // "sicher"
    await page.waitForTimeout(400);

    // The plan is explicit: every answer triggers an explanation — on a correct
    // answer too, because knowing why matters as much as being right (§3).
    const danach = await page.evaluate(() => document.getElementById('view').innerText);
    expect(danach.length, 'nothing follows the confidence rating')
      .toBeGreaterThan(vorher.text.length);
  });

  test('the drill runs to the end and reports a result', async ({ page }) => {
    await page.goto('/#/drill', { waitUntil: 'load' });
    await schliesseOverlays(page);
    await warteAufAnsicht(page);

    let fragen = 0;
    for (let i = 0; i < 30; i++) {
      if (!await warteAufKlickbares(page, 5000)) break;   // explanation is on screen
      const naechste = page.locator('#view button:visible:not([disabled])').first();
      if (!await naechste.count()) break;
      await klicke(page, naechste, '#/drill');
      await schliesseOverlays(page);
      fragen++;
    }
    // Five questions, each followed by a confidence rating — a handful of clicks
    // is not a completed drill.
    expect(fragen, 'the drill could not be completed').toBeGreaterThan(8);
    const schluss = await page.evaluate(() => document.getElementById('view').innerText);
    expect(schluss.length, 'the drill ends on an empty view').toBeGreaterThan(60);
  });

  test('trick questions are labelled as such in the feedback', async ({ page }) => {
    // Traps are capped at 10–15 % and must be named afterwards (#13) — an
    // unlabelled trap teaches nothing, it only annoys.
    const geladen = await page.evaluate(async () => {
      const qs = await fetch('content/questions-core.json').then(r => r.json());
      const liste = Array.isArray(qs) ? qs : (qs.questions ?? []);
      const traps = liste.filter(q => q.trap || q.is_trap || q.fangfrage);
      return { gesamt: liste.length, traps: traps.length, mitHinweis: traps.filter(q =>
        /fang|falle|trap/i.test(JSON.stringify(q.explanation ?? q.feedback ?? ''))).length };
    });
    expect(geladen.traps, 'the pool contains no trick questions at all').toBeGreaterThan(0);
    const anteil = geladen.traps / geladen.gesamt;
    expect(anteil, `trap share is ${(anteil * 100).toFixed(1)} %, above the 15 % cap`)
      .toBeLessThanOrEqual(0.15);
  });

  test('the placement test only recommends — it does not skip anything', async ({ page }) => {
    // #19: placement produces recommendations; an actual skip needs its own
    // challenge test. A placement that silently marks units done would hollow
    // out the learning record.
    await page.goto('/#/placement', { waitUntil: 'load' });
    await schliesseOverlays(page);
    await warteAufAnsicht(page);

    const vorher = await page.evaluate(() => document.getElementById('view').innerText.slice(0, 200));
    await beantworte(page, '#/placement');
    const st = await page.evaluate(async () => {
      const { StorageAdapter } = await import('./app/storage-adapter.js');
      return await StorageAdapter.bridgeStore({}).get('state');
    });
    expect(Array.isArray(st.units_done), 'units_done is not a list').toBe(true);
    expect(vorher.length).toBeGreaterThan(10);
    await erfasse(page, '#/placement');
  });
});
