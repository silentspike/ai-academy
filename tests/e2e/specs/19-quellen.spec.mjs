import { test, expect, schliesseOverlays, warteAufAnsicht } from '../harness.mjs';

// Rank 8 of the source hierarchy: the model is never itself a legal source
// (plan §4.1 #9, §5.2). The prompts have demanded `claims` with `source_ids`
// from the start — but the coach answered in prose, the bridge returned bare
// text, and the application had nothing to check. A sentence about the law reads
// exactly the same whether it rests on the official journal or on nothing.
//
// The bridge answer is intercepted here rather than driven through the stub CLI:
// what is under test is the application's handling of a claim, and the cheapest
// honest way to produce a specific claim is to hand it one.

const KARTE = '#view .coach-note';

async function antworteMit(page, claims) {
  await page.route('**/api/dialog', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({
      text: 'Prüfe als Nächstes die Zweckbestimmung — davon hängt die Einstufung ab.',
      claims, uncertainties: [],
    }),
  }));
}

/** Answer the first check of a unit; the coach follows asynchronously. */
async function beantworteCheck(page) {
  const opt = page.locator('#view .q-opt:not([disabled])').first();
  await opt.waitFor({ state: 'visible', timeout: 10_000 });
  await opt.click();
  // Complex questions ask for a justification and confidence before feedback.
  const weiter = page.locator('#view .q-selfexplain button').first();
  if (await weiter.count()) { await weiter.click(); }
  const conf = page.locator('#view .q-confidence button').first();
  if (await conf.count()) { await conf.click(); }
  await page.locator(KARTE).first().waitFor({ state: 'visible', timeout: 15_000 });
}

test.describe('source grounding', () => {
  test('an invented provision is marked, not shown as if it were sourced', async ({ page, zustand }) => {
    await zustand('mittenInPhase3');
    await antworteMit(page, [{ text: 'Art. 6 Abs. 7 verlangt eine FRIA.', source_ids: ['Art. 6 Abs. 7'] }]);
    await page.goto('/#/einheit/p1-e01-ki-system-rollen', { waitUntil: 'load' });
    await schliesseOverlays(page);
    await warteAufAnsicht(page);
    await beantworteCheck(page);

    const marke = page.locator('#view .coach-unbelegt').first();
    await marke.waitFor({ state: 'visible', timeout: 10_000 });
    const text = await marke.innerText();
    expect(text, 'the mark does not say what is wrong').toMatch(/Nicht verifiziert/i);
    expect(text, 'the mark does not name the provision it could not find').toContain('Art. 6 Abs. 7');
    await expect(page.locator('#view .coach-belegt')).toHaveCount(0);
  });

  test('a claim without any citation is its own finding', async ({ page, zustand }) => {
    await zustand('mittenInPhase3');
    await antworteMit(page, [{ text: 'Das gilt seit August.' }]);
    await page.goto('/#/einheit/p1-e01-ki-system-rollen', { waitUntil: 'load' });
    await schliesseOverlays(page);
    await warteAufAnsicht(page);
    await beantworteCheck(page);

    const marke = page.locator('#view .coach-unbelegt').first();
    await marke.waitFor({ state: 'visible', timeout: 10_000 });
    expect(await marke.innerText()).toMatch(/ohne Fundstelle/i);
  });

  // Negative control. The mark is worth exactly as much as its absence when the
  // citation is real — otherwise it is a warning that fires on everything, which
  // teaches the reader to ignore it.
  test('a real provision passes and is reported as checked', async ({ page, zustand }) => {
    await zustand('mittenInPhase3');
    await antworteMit(page, [{ text: 'Die Rollen stehen in Art. 3.', source_ids: ['Art. 3 Nr. 1'] }]);
    await page.goto('/#/einheit/p1-e01-ki-system-rollen', { waitUntil: 'load' });
    await schliesseOverlays(page);
    await warteAufAnsicht(page);
    await beantworteCheck(page);

    await page.locator('#view .coach-belegt').first().waitFor({ state: 'visible', timeout: 10_000 });
    await expect(page.locator('#view .coach-unbelegt')).toHaveCount(0);
  });
});
