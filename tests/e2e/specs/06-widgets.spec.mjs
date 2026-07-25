import { test, expect, einheiten, schliesseOverlays, warteAufAnsicht } from '../harness.mjs';
import { erfasse, klicke } from '../coverage.mjs';

// The widgets are not decoration (§4.7 #45): drag and drop forces structural
// knowledge, the timeline is the mental model of the transition rules, the annex
// explorer and the role switch are the two hardest classification questions in
// the material. Each is checked for what it teaches, not just for being present.

/** Opens the first unit that actually contains the given widget. */
async function findeEinheitMit(page, selektor) {
  for (const u of einheiten()) {
    await page.goto(`/#/einheit/${u.id}`, { waitUntil: 'load' });
    await schliesseOverlays(page);
    await warteAufAnsicht(page);
    await page.waitForTimeout(300);
    if (await page.locator(selektor).count()) return u.id;
  }
  return null;
}

test.describe('interactive widgets', () => {
  test.beforeEach(async ({ zustand }) => {
    await zustand('mittenInPhase3');
  });

  test('drag and drop can be completed and judges the result', async ({ page }) => {
    const wo = await findeEinheitMit(page, '.dnd');
    test.skip(!wo, 'no unit contains a drag-and-drop exercise');

    const chips = page.locator('.dnd-pool .dnd-chip');
    const zonen = page.locator('.dnd-zone');
    expect(await chips.count(), 'the exercise offers nothing to drag').toBeGreaterThan(1);
    expect(await zonen.count(), 'the exercise offers no drop zones').toBeGreaterThan(1);

    // HTML5 drag and drop does not react to synthetic mouse movement — the
    // handlers read from a DataTransfer object, so the events carry one. This
    // drives dragstart/dragover/drop exactly as the browser does.
    const n = await chips.count();
    const zonenIds = await zonen.evaluateAll(zs => zs.map(z => z.dataset.zid));
    for (let i = 0; i < n; i++) {
      const iid = await page.locator('.dnd-pool .dnd-chip').first().getAttribute('data-iid');
      if (!iid) break;
      await page.evaluate(({ iid, zid }) => {
        const chip = document.querySelector(`.dnd-chip[data-iid="${iid}"]`);
        const zone = document.querySelector(`.dnd-zone[data-zid="${zid}"]`);
        const dt = new DataTransfer();
        chip.dispatchEvent(new DragEvent('dragstart', { dataTransfer: dt, bubbles: true }));
        zone.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }));
        zone.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
      }, { iid, zid: zonenIds[i % zonenIds.length] });
      await page.waitForTimeout(80);
    }
    const uebrig = await page.locator('.dnd-pool .dnd-chip').count();
    expect(uebrig, 'no chip could be dropped').toBe(0);

    // Everything placed means the exercise must judge — a silent drag and drop
    // teaches nothing.
    await expect(page.locator('.dnd-feedback'), 'the exercise gives no verdict')
      .toContainText(/richtig|falsch|%/);

    await erfasse(page, `#/einheit/${wo}`);
  });

  test('the timeline carries the post-omnibus dates and does not overlap', async ({ page }) => {
    const wo = await findeEinheitMit(page, 'svg.tl');
    test.skip(!wo, 'no unit contains the timeline');

    // §2.6: teaching the old dates is the one mistake that would discredit the
    // learner on day one. Checked against the data the timeline draws from, not
    // against a text pattern — some 2.8.2026 dates are still correct (the
    // amendment powers in Art. 6(6)(7) and Art. 7 were not deferred).
    const fristen = await page.evaluate(() => fetch('content/fristen.json').then(r => r.json()));
    // By id, not by wording: matching on text is brittle here — "ANHANG-I" is a
    // substring of "ANHANG-III" and silently excluded the very entry to check.
    const stufen = Object.fromEntries(fristen.geltungsstufen.map(g => [g.id, g]));
    expect(stufen.g4, 'the schedule has no entry for the Annex III high-risk duties').toBeTruthy();
    expect(stufen.g4.applies_from, 'the Annex III high-risk duties still carry the pre-omnibus date')
      .toBe('2027-12-02');
    expect(stufen.g5.applies_from, 'the Annex I date was not deferred either').toBe('2028-08-02');
    expect(stufen.g2.applies_from, 'the new Article 5 offences carry the wrong start date').toBe('2026-12-02');

    const text = await page.evaluate(() => document.getElementById('view').innerText);
    expect(text, 'the deferred date does not appear on screen').toMatch(/2\.12\.2027|2027-12-02|12\.2027/);

    // Labels must stay readable — overlapping text was a real defect here.
    const ueberlappungen = await page.evaluate(() => {
      const marken = [...document.querySelectorAll('svg.tl text')];
      let treffer = 0;
      for (let i = 0; i < marken.length; i++) {
        for (let j = i + 1; j < marken.length; j++) {
          const a = marken[i].getBoundingClientRect(), b = marken[j].getBoundingClientRect();
          if (a.width === 0 || b.width === 0) continue;
          if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) treffer++;
        }
      }
      return treffer;
    });
    expect(ueberlappungen, 'timeline labels overlap and become unreadable').toBe(0);
    await erfasse(page, `#/einheit/${wo}`);
  });

  test('the annex III explorer opens its entries', async ({ page }) => {
    const wo = await findeEinheitMit(page, '.annex');
    test.skip(!wo, 'no unit contains the annex explorer');

    const eintraege = page.locator('.annex-item');
    expect(await eintraege.count(), 'the explorer lists no annex entries').toBeGreaterThan(3);

    const vorher = await page.evaluate(() => document.querySelector('.annex-detail')?.innerText ?? '');
    await klicke(page, eintraege.first(), `#/einheit/${wo}`);
    await page.waitForTimeout(300);
    const nachher = await page.evaluate(() => document.querySelector('.annex-detail')?.innerText ?? '');
    expect(nachher, 'an annex entry does not open on click').not.toBe(vorher);
    expect(nachher, 'the detail names no legal basis').toMatch(/Anhang III Nr\.? ?\d/);
  });

  test('the role switch walks through Article 25 and reaches a verdict', async ({ page }) => {
    const wo = await findeEinheitMit(page, '.rolesw');
    test.skip(!wo, 'no unit contains the role switch');

    // Article 25(1)(a)–(c): brand, substantial modification, changed purpose.
    // Each answer has to lead somewhere; a decision tree that stops halfway is
    // worse than none, because it suggests an answer that never comes.
    let schritte = 0;
    for (let i = 0; i < 8; i++) {
      const knopf = page.locator('.rolesw button:visible:not([disabled])').first();
      if (!await knopf.count()) break;
      await klicke(page, knopf, `#/einheit/${wo}`);
      await page.waitForTimeout(250);
      schritte++;
    }
    expect(schritte, 'the role switch cannot be operated').toBeGreaterThan(0);

    const ergebnis = await page.evaluate(() => document.querySelector('.rolesw').innerText);
    expect(ergebnis, 'the role switch names no legal basis')
      .toMatch(/Art\.?\s*25/);
    expect(ergebnis, 'the role switch reaches no verdict')
      .toMatch(/Anbieter|Betreiber/i);
  });

  test('the source box quotes the wording, marked as a quotation', async ({ page }) => {
    // #7: what matters professionally is "it says so in Article 26(7)", not a
    // paraphrase that sounds close enough.
    await page.goto(`/#/einheit/${einheiten()[0].id}`, { waitUntil: 'load' });
    await schliesseOverlays(page);
    await warteAufAnsicht(page);

    const box = page.locator('details:has-text("Originaltext")').first();
    test.skip(!await box.count(), 'this unit ships no source box');
    await box.evaluate(d => { d.open = true; });
    const inhalt = (await box.innerText()).trim();
    expect(inhalt, 'the source box names no article').toMatch(/Art\.?\s*\d+/);
    expect(inhalt.length, 'the source box holds no wording').toBeGreaterThan(60);
  });
});
