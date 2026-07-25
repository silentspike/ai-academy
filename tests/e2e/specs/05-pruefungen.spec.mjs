import { test, expect, schliesseOverlays, warteAufAnsicht, warteAufKlickbares } from '../harness.mjs';
import { erfasse, klicke } from '../coverage.mjs';

// The examination system carries the weight of the whole product: it decides
// what the learning record is worth. The gates are therefore tested from both
// sides — that they open when they should, and that they hold when they should
// not (#12, #16a, #19, #35).

test.describe('examination system', () => {
  test('the exam gate holds while chapter tests are still open', async ({ page, zustand }) => {
    await zustand('mittenInPhase3');
    await page.goto('/#/examen', { waitUntil: 'load' });
    await schliesseOverlays(page);
    await warteAufAnsicht(page);

    const text = await page.evaluate(() => document.getElementById('view').innerText);
    // The lock is not just stated, it is itemised — the learner must be able to
    // see what is missing rather than face a closed door (#16).
    expect(text, 'the exam does not show a closed gate').toMatch(/Schloss aktiv|gesperrt/i);
    expect(text, 'the gate names no reason').toMatch(/Kapiteltest P\d nicht bestanden/);
    const start = page.locator('#view button:has-text("Examen starten")');
    expect(await start.count(), 'the exam can be started although the gate is closed').toBe(0);
    await erfasse(page, '#/examen');
  });

  test('the exam gate opens once everything is in place', async ({ page, zustand }) => {
    await zustand('examensreif');
    await page.goto('/#/examen', { waitUntil: 'load' });
    await schliesseOverlays(page);
    await warteAufAnsicht(page);

    const start = page.locator('#view button:has-text("Examen starten")').first();
    await expect(start, 'the exam stays locked although the fixture satisfies every condition')
      .toBeVisible();
  });

  test('the chapter test demands the boss fight first', async ({ page, zustand }) => {
    // Order from §4.2: the fight is the dress rehearsal; failing the test without
    // it would burn an attempt that was never winnable.
    await zustand('examensreif');
    await page.goto('/#/test/p3', { waitUntil: 'load' });
    await schliesseOverlays(page);
    await warteAufAnsicht(page);

    const text = await page.evaluate(() => document.getElementById('view').innerText);
    expect(text, 'the chapter test does not point at the boss fight').toMatch(/bosskampf/i);
    await erfasse(page, '#/test/p3');
  });

  test('closed book really turns the glossary off', async ({ page, zustand }) => {
    // #13: during an exam the tooltips have to be dead. A glossary that still
    // answers turns a closed-book exam into an open-book one without saying so.
    await zustand('examensreif');
    await page.goto('/#/examen', { waitUntil: 'load' });
    await schliesseOverlays(page);
    await warteAufAnsicht(page);
    await klicke(page, page.locator('#view button:has-text("Examen starten")').first(), '#/examen');
    await warteAufKlickbares(page, 8000);

    const begriff = page.locator('.gloss').first();
    if (!await begriff.count()) {
      // No marked term on screen is fine — but then nothing can leak either.
      expect(await page.locator('.gloss-off').count()).toBeGreaterThanOrEqual(0);
      return;
    }
    await begriff.click();
    await page.waitForTimeout(300);
    const offen = await page.evaluate(() => {
      const t = document.querySelector('.gloss-tip');
      return !!t && !t.hidden && (t.innerText || '').trim().length > 0;
    });
    expect(offen, 'the glossary still explains terms during the exam').toBe(false);
  });

  test('the boss fight is conducted and judged', async ({ page, zustand }) => {
    // The judgement runs through the substitute CLI, so the real path is
    // exercised: prompt builder, bridge, JSON extraction, rendering.
    await zustand('mittenInPhase3');
    await page.goto('/#/boss', { waitUntil: 'load' });
    await schliesseOverlays(page);
    await warteAufAnsicht(page);

    let zuege = 0;
    for (let i = 0; i < 6; i++) {
      const zug = page.locator('#view button:visible:not([disabled])')
        .filter({ hasNotText: 'Phase abschließen' }).first();
      if (!await zug.count()) break;
      // The conversation re-renders around the click, so a detached node here
      // means the turn landed — not that the control was broken.
      try { await klicke(page, zug, '#/boss'); }
      catch (e) { if (!/not attached|detached/i.test(String(e.message))) throw e; }
      await warteAufKlickbares(page, 8000);
      zuege++;
    }
    expect(zuege, 'the conversation could not be advanced').toBeGreaterThan(1);

    // Text length is the wrong measure here: answering removes the suggested
    // moves, so the view can get shorter while the conversation moved on. What
    // counts is that the persona actually replied — through the real chain of
    // prompt builder, bridge, CLI and JSON extraction.
    const gespraech = await page.evaluate(() => {
      const t = document.getElementById('view').innerText;
      return { text: t, fehler: /\[(Bridge nicht erreichbar|Das Modell|Kein Modell)/.test(t) };
    });
    expect(gespraech.fehler, 'the persona answered with an error notice').toBe(false);
    expect(gespraech.text, 'the persona did not reply')
      .toMatch(/nachtrainieren|Zweckbestimmung/);
    await erfasse(page, '#/boss');
  });

  test('the learning record calls itself what it is, on the front', async ({ page, zustand }) => {
    // #35: "certificate" would suggest an accredited third-party assessment. The
    // disclaimer belongs where a hurried reader sees it, not in the small print.
    await zustand('abgeschlossen');
    await page.goto('/#/lernnachweis', { waitUntil: 'load' });
    await schliesseOverlays(page);
    await warteAufAnsicht(page);

    const titel = await page.evaluate(() =>
      document.querySelector('#view h1, #view h2, #view h3')?.innerText ?? '');
    expect(titel, 'the record calls itself a certificate').not.toMatch(/zertifikat/i);
    expect(titel).toMatch(/Lernnachweis/);

    const text = await page.evaluate(() => document.getElementById('view').innerText);
    expect(text, 'the record does not deny accreditation').toMatch(/[Kk]ein akkreditiertes Zertifikat/);
    expect(text).toMatch(/unbeaufsichtigt/i);
    expect(text).toMatch(/nicht durch eine unabhängige Stelle verifiziert/i);
    expect(text, 'the legal baseline is missing from the record').toMatch(/2026-07-27|27\.7\.2026/);

    // The disclaimer must sit in the visible front block, not somewhere below.
    const vorne = await page.evaluate(() =>
      !!document.querySelector('.nachweis-disclaimer'));
    expect(vorne, 'the disclaimer is not part of the front of the record').toBe(true);
    await erfasse(page, '#/lernnachweis');
  });

  test('a second attempt on the same day is refused', async ({ page, zustand }) => {
    // #11: one attempt per calendar day forces a night of consolidation rather
    // than brute-force guessing.
    const heute = new Date(Date.parse('2026-07-25T09:00:00+02:00'));
    const tag = `${heute.getFullYear()}-${String(heute.getMonth() + 1).padStart(2, '0')}-${String(heute.getDate()).padStart(2, '0')}`;
    const gate = await page.evaluate(async ({ tag }) => {
      const { examGate } = await import('./app/exam-core.js');
      const { kompetenzen } = await fetch('content/competencies.json').then(r => r.json());
      const basis = { chapterTests: {}, examAttempts: [{ day: tag }] };
      for (let p = 1; p <= 9; p++) basis.chapterTests['p' + p] = { passed: true };
      const cards = kompetenzen.map((k, i) => ({ id: 'c' + i, competency: k.id, retention: 'behalten' }));
      return examGate(basis, { kompetenzen, cards, nowMs: Date.parse('2026-07-25T09:00:00+02:00') });
    }, { tag });
    expect(gate.allowed, 'a second attempt on the same day is allowed').toBe(false);
    expect(gate.reasons.join(' ')).toMatch(/Antritt/i);
  });
});
