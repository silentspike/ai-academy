import { test, expect, FIXTURES, schliesseOverlays, warteAufAnsicht } from '../harness.mjs';
import { erfasse, klicke } from '../coverage.mjs';

// The dashboard answers three questions: where am I, what is weak, what is due
// (#44). Two of its promises are easy to break and hard to notice, so both are
// checked explicitly: activity and mastery must never be mixed up (#28), and
// score series from different grading regimes must never be merged (#17).

test.describe('dashboard', () => {
  test.beforeEach(async ({ zustand, page }) => {
    await zustand('mittenInPhase3');
    await page.goto('/#/dashboard', { waitUntil: 'load' });
    await schliesseOverlays(page);
    await warteAufAnsicht(page);
  });

  test('the article map covers the whole regulation', async ({ page }) => {
    const kacheln = await page.locator('.hm-wrap i').count();
    expect(kacheln, 'the article map shows no tiles').toBeGreaterThan(50);

    const text = await page.evaluate(() =>
      document.querySelector('.hm-wrap').closest('.card').innerText);
    expect(text, 'the map does not say how many articles are core for this profile')
      .toMatch(/Kern-Artikel/);
    await erfasse(page, '#/dashboard');
  });

  test('the competency radar breaks results down by level', async ({ page }) => {
    // A red "Article 6" says nothing about whether knowledge or application is
    // missing; K3-C red next to K3-A green says exactly that (§3).
    const radar = page.locator('.radar-wrap');
    await expect(radar, 'the competency radar is missing').toBeVisible();
    const text = await radar.innerText();
    expect(text, 'the radar does not name competencies').toMatch(/K0\d/);
  });

  test('activity and mastery are shown apart, never merged', async ({ page }) => {
    // #28: a high XP number must never look like high competence.
    const text = await page.evaluate(() => document.getElementById('view').innerText);
    expect(text, 'nothing separates activity from competence').toMatch(/Aktivität/i);

    // Structural, not textual: the explanatory sentence legitimately mentions both
    // words. What must not happen is XP appearing inside the competence display
    // as if it were a measure of ability.
    const xpImRadar = await page.evaluate(() =>
      /\bXP\b/.test(document.querySelector('.radar-wrap')?.innerText ?? ''));
    expect(xpImRadar, 'the competency radar counts XP as ability').toBe(false);

    const radarVorhanden = await page.locator('.radar-wrap').count();
    expect(radarVorhanden, 'there is no separate competence display at all').toBeGreaterThan(0);
  });

  test('score series stay separated by grading regime', async ({ page, zustand }) => {
    // #17: 85 % under an old legal baseline and a different model is not
    // comparable with 85 % today. Merging them would flatter the record.
    // The series live in state.scoreSeries, keyed by the grading regime.
    await zustand({
      ...FIXTURES.examensreif(),
      scoreSeries: {
        '2026-07-27|c1|1.1.0|modell-alt': { runs: [{ pct: 0.85 }, { pct: 0.82 }] },
        '2026-07-27|c1|1.2.0|modell-neu': { runs: [{ pct: 0.90 }] },
      },
    });
    await page.goto('/#/dashboard', { waitUntil: 'load' });
    await schliesseOverlays(page);
    await warteAufAnsicht(page);

    const zeilen = page.locator('.exam-serie');
    expect(await zeilen.count(), 'two grading regimes are not shown as two series').toBe(2);

    // The decisive part is not the count but the figures: if the series were
    // merged, the older one would inherit the newer best of 90 %.
    const werte = await zeilen.evaluateAll(rs => rs.map(r => r.innerText.replace(/\s+/g, ' ')));
    const alt = werte.find(w => /modell-alt/.test(w));
    const neu = werte.find(w => /modell-neu/.test(w));
    expect(alt, 'the older series is missing').toBeTruthy();
    expect(neu, 'the newer series is missing').toBeTruthy();
    expect(alt, 'the older series shows the newer best — the series were merged').not.toMatch(/90%/);
    expect(alt, 'the older series lost its own best').toMatch(/85%/);
    expect(neu, 'the newer series does not show its best').toMatch(/90%/);
    expect(werte.join(' '), 'the record shows no first/latest/best breakdown')
      .toMatch(/first[\s\S]*latest[\s\S]*best/i);
  });

  test('due cards are split into core and catch-up', async ({ page }) => {
    // #34: after a break the catch-up queue must not stand in front of the core
    // queue as one undifferentiated wall.
    const text = await page.evaluate(() => document.getElementById('view').innerText);
    expect(text, 'core and catch-up are not distinguished').toMatch(/Kern/);
    expect(text).toMatch(/Aufhol|nachhol/i);
  });

  test('the article map leads to the material', async ({ page }) => {
    // #44: the tiles are clickable and lead to the unit. They carry a cursor and
    // a handler, so a tile that does nothing on click would look operable and
    // not be — the failure this suite exists to catch.
    const kacheln = page.locator('.hm-wrap i');
    expect(await kacheln.count(), 'the map offers no tiles').toBeGreaterThan(50);

    const vorher = page.url();
    const vorherText = await page.evaluate(() => document.getElementById('view').innerText.slice(0, 120));
    await klicke(page, kacheln.first(), '#/dashboard');
    await page.waitForTimeout(500);

    const nachher = await page.evaluate(() => ({
      url: location.hash,
      text: document.getElementById('view').innerText.slice(0, 120),
      dialog: !!document.querySelector('.hm-detail, .modal, dialog[open]'),
    }));
    const reagiert = nachher.url !== new URL(vorher).hash || nachher.text !== vorherText || nachher.dialog;
    expect(reagiert, 'a tile shows a pointer cursor but does nothing on click').toBe(true);
  });
});
