import { test, expect, einheiten, schliesseOverlays, warteAufAnsicht } from '../harness.mjs';
import { erfasse, klicke } from '../coverage.mjs';

// Content-driven: iterates the real inventory. A new unit is covered the moment
// it lands in content/units/index.json — no test change needed.

test.describe('learning path', () => {
  test.beforeEach(async ({ zustand }) => {
    await zustand('mittenInPhase3');
  });

  for (const u of einheiten()) {
    test(`unit ${u.id} opens and renders its blocks`, async ({ page }) => {
      const fehler = [];
      page.on('pageerror', e => fehler.push(e.message.slice(0, 120)));

      await page.goto(`/#/einheit/${u.id}`, { waitUntil: 'load' });
      await schliesseOverlays(page);
      await warteAufAnsicht(page);

      // The title must actually appear — a unit that renders an empty shell is
      // the failure mode that unit tests cannot see.
      const text = await page.evaluate(() => document.getElementById('view').innerText);
      expect(text.length, `unit ${u.id} renders no text`).toBeGreaterThan(80);
      expect(fehler, `unit ${u.id} threw`).toEqual([]);

      await erfasse(page, `#/einheit/${u.id}`);
    });
  }

  test('a unit can be worked through: answering advances it', async ({ page }) => {
    const u = einheiten()[0];
    await page.goto(`/#/einheit/${u.id}`, { waitUntil: 'load' });
    await schliesseOverlays(page);
    await warteAufAnsicht(page);

    // The unit advances by answering, not by a "next" button: each check offers
    // its options as buttons, and the confidence rating follows.
    // Answered options stay visible but disabled, so always take the first
    // element that can still be operated — otherwise the loop stalls on step one.
    let schritte = 0;
    for (let i = 0; i < 40; i++) {
      const knopf = page.locator('#view button:visible:not([disabled])').first();
      if (!await knopf.count()) break;
      await klicke(page, knopf, `#/einheit/${u.id}`);
      await page.waitForTimeout(250);
      await schliesseOverlays(page);   // a milestone may fire a full-screen ceremony
      schritte++;
    }
    // A unit consists of several checks, each followed by a confidence rating —
    // a handful of steps means it really progressed, not that one button existed.
    expect(schritte, 'the unit could not be worked through').toBeGreaterThan(5);

    // Something must have changed as a result — either feedback or a new block.
    const text = await page.evaluate(() => document.getElementById('view').innerText);
    expect(text.length).toBeGreaterThan(80);
  });

  test('the glossary explains a term on click', async ({ page }) => {
    const u = einheiten()[0];
    await page.goto(`/#/einheit/${u.id}`, { waitUntil: 'load' });
    await schliesseOverlays(page);
    await warteAufAnsicht(page);

    const begriff = page.locator('.gloss').first();
    if (!await begriff.count()) {
      test.skip(true, 'this unit contains no glossary term');
      return;
    }
    // The module promises both paths: "the explanation opens on hover AND click".
    // Both are asserted — a term that only reacts to hover is unusable by keyboard.
    const zustand = async () => page.evaluate(() => {
      const t = document.querySelector('.gloss-tip');
      if (!t) return { offen: false, text: '' };
      return { offen: !t.hidden && getComputedStyle(t).display !== 'none',
               text: (t.innerText || '').trim() };
    });

    await begriff.hover();
    await page.waitForTimeout(250);
    const nachHover = await zustand();
    expect(nachHover.offen, 'the glossary tooltip does not open on hover').toBe(true);
    expect(nachHover.text.length, 'the glossary tooltip opens but stays empty').toBeGreaterThan(20);

    await page.mouse.move(0, 0);
    await page.waitForTimeout(200);
    await begriff.click();
    await page.waitForTimeout(250);
    const nachKlick = await zustand();
    expect(nachKlick.offen, 'the glossary tooltip does not open on click').toBe(true);
    expect(nachKlick.text.length, 'the click path shows an empty tooltip').toBeGreaterThan(20);
  });

  test('the source box carries a citation, not a paraphrase', async ({ page }) => {
    // Verbatim boxes must be marked as such. A structural comment presented as a
    // quotation is a correctness problem, not a cosmetic one.
    for (const u of einheiten().slice(0, 6)) {
      await page.goto(`/#/einheit/${u.id}`, { waitUntil: 'load' });
      await schliesseOverlays(page);
      await warteAufAnsicht(page);
      const boxen = await page.locator('details:has-text("Originaltext")').all();
      for (const b of boxen) {
        // Collapsed by design — open it, otherwise only the summary is measured.
        await b.evaluate(d => { d.open = true; });
        const txt = (await b.innerText()).trim();
        expect(txt.length, `source box in ${u.id} carries no text`).toBeGreaterThan(60);
      }
    }
  });
});
