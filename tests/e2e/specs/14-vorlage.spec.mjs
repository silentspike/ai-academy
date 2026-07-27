import { test, expect, schliesseOverlays, warteAufAnsicht } from '../harness.mjs';
import { erfasse } from '../coverage.mjs';

// The elements the design reference shows and the build did not have. Each one
// is checked against the learning state rather than against its own presence:
// an element that renders a fixed number looks identical to one that works.

test.describe('reference alignment', () => {
  test('the level title, the week dots and the goal come from the state', async ({ page, zustand }) => {
    await zustand('mittenInPhase3');
    await page.goto('/#/dashboard', { waitUntil: 'load' });
    await schliesseOverlays(page);
    await warteAufAnsicht(page);

    const m = await page.evaluate(async () => {
      const { levelFor, weekProgress, wochenpunkte } = await import('./app/gamification.js');
      const { StorageAdapter } = await import('./app/storage-adapter.js');
      let sp = StorageAdapter.bridgeStore({});
      try { await sp.get('state'); } catch { sp = StorageAdapter.localStorage(); }
      const st = await sp.get('state');
      const txt = (id) => document.getElementById(id)?.textContent?.trim() ?? '';
      return {
        titelAngezeigt: txt('tb-level-titel'),
        titelErwartet: levelFor(st.xp, st.levelEndtitel).title,
        wocheAngezeigt: txt('tb-week'),
        wocheErwartet: (() => { const w = weekProgress(st, Date.now()); return `${w.done}/${w.goal} Tagen`; })(),
        punkte: document.querySelectorAll('#tb-wochenpunkte .wp').length,
        punkteAn: document.querySelectorAll('#tb-wochenpunkte .wp.an').length,
        punkteErwartetAn: wochenpunkte(st, Date.now()).filter(p => p.gelernt).length,
      };
    });

    expect(m.titelAngezeigt, 'no level title next to the number').not.toBe('');
    expect(m.titelAngezeigt).toContain(m.titelErwartet);
    expect(m.wocheAngezeigt).toBe(m.wocheErwartet);
    expect(m.punkte, 'week dots are not seven').toBe(7);
    expect(m.punkteAn, 'lit dots do not match the days that count').toBe(m.punkteErwartetAn);
    // A fixture with learning days must light at least one dot, otherwise this
    // test would also pass on a row of seven dead dots.
    expect(m.punkteAn).toBeGreaterThan(0);
  });

  test('the sidebar shows phase names, progress and exactly one active phase', async ({ page, zustand }) => {
    await zustand('mittenInPhase3');
    await page.goto('/#/dashboard', { waitUntil: 'load' });
    await schliesseOverlays(page);
    await warteAufAnsicht(page);

    const m = await page.evaluate(() => {
      const reihen = [...document.querySelectorAll('#phase-tree .ph')];
      return {
        anzahl: reihen.length,
        mitName: reihen.filter(r => /Phase \d+ · \S/.test(r.querySelector('.ph-name')?.textContent ?? '')).length,
        aktiv: reihen.filter(r => r.classList.contains('phase-aktiv'))
                     .map(r => r.querySelector('.ph-name')?.textContent?.trim()),
        balken: reihen.map(r => r.querySelector('.ph-bar i')?.style.width ?? ''),
        aktivHatHaken: reihen.filter(r => r.classList.contains('phase-aktiv') && r.querySelector('.pcheck')?.textContent === '✓').length,
      };
    });

    expect(m.anzahl).toBe(10);
    expect(m.mitName, 'phase rows without "Phase N · Name"').toBe(10);
    expect(m.aktiv.length, `active phases: ${m.aktiv.join(', ') || 'none'}`).toBe(1);
    expect(m.aktiv[0]).toContain('Phase 3');            // p1 and p2 passed in this fixture
    expect(m.aktivHatHaken, 'a phase is marked active and passed at the same time').toBe(0);
    // Bars must differ — all at 0 % or all at 100 % would mean they are not fed.
    expect(new Set(m.balken).size, `all bars read ${m.balken[0]}`).toBeGreaterThan(1);
  });

  test('the learning view says the material is complete, not tailored down', async ({ page, zustand }) => {
    // Plan #2 promises every article and annex, with the profile ordering rather
    // than reducing. The product said "priorisiert" and the onboarding said the
    // answers "schneiden das Training zu" — which reads as leaving things out.
    await zustand('mittenInPhase3');
    await page.goto('/#/lernen', { waitUntil: 'load' });
    await schliesseOverlays(page);
    await warteAufAnsicht(page);

    const m = await page.evaluate(() => ({
      unter: document.querySelector('.chead .sub')?.textContent ?? '',
      phasen: [...document.querySelectorAll('.lern-sect')].length,
      klickbar: [...document.querySelectorAll('.lern-row a[href^="#/einheit/"]')].length,
      notiz: document.querySelector('.lern-sect-notiz')?.textContent ?? '',
    }));
    expect(m.unter, 'the view does not say the material is complete').toMatch(/vollständig/i);
    expect(m.unter, 'order is not described as a recommendation').toMatch(/Empfehlung|jederzeit zugänglich/i);
    // The claim has to hold: every phase listed, every unit reachable.
    expect(m.phasen, 'not all ten phases are listed').toBe(10);
    expect(m.klickbar, 'units are not reachable').toBeGreaterThan(10);
    expect(m.notiz, 'the peripheral phase does not explain why it is there').toMatch(/Diskussionen|Überblick/i);
  });

  test('the article map carries a summary line with the real count', async ({ page, zustand }) => {
    await zustand('mittenInPhase3');
    await page.goto('/#/dashboard', { waitUntil: 'load' });
    await schliesseOverlays(page);
    await warteAufAnsicht(page);

    const m = await page.evaluate(() => ({
      zeile: document.querySelector('.hm-summe')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
      kacheln: document.querySelectorAll('.hm-groups i').length,
      stand: document.getElementById('tb-legal')?.textContent ?? '',
    }));
    const zahl = Number(m.zeile.match(/Σ\s*(\d+)/)?.[1] ?? 0);
    expect(zahl, `summary line reads "${m.zeile}"`).toBeGreaterThan(100);
    expect(zahl, 'summary count does not match the tiles drawn').toBe(m.kacheln);
    expect(m.zeile).toContain('27.7.2026');
    expect(m.stand).toContain('27.7.2026');
  });

  test('both charts carry a legend', async ({ page, zustand }) => {
    await zustand('mittenInPhase3');
    await page.goto('/#/dashboard', { waitUntil: 'load' });
    await schliesseOverlays(page);
    await warteAufAnsicht(page);
    const texte = await page.locator('.viz-legende').allInnerTexts();
    expect(texte.length, 'no legends on the dashboard').toBe(2);
    expect(texte.join(' ')).toContain('Soll-Profil');
    expect(texte.join(' ')).toContain('Soll-Verlauf');
  });

  test('the time range actually changes the curve', async ({ page, zustand }) => {
    await zustand('examensreif');                        // 40 days of history
    await page.goto('/#/dashboard', { waitUntil: 'load' });
    await schliesseOverlays(page);
    await warteAufAnsicht(page);

    // The renderer draws one circle per point except the last, plus two for the
    // highlighted end point: circles = points + 1.
    const punkte = async () => (await page.evaluate(
      () => document.querySelectorAll('#d-curve svg circle').length)) - 1;
    const alle = await (async () => {
      await page.selectOption('#d-curve-range', '0');
      await page.waitForTimeout(150);
      return punkte();
    })();
    await page.selectOption('#d-curve-range', '4');
    await page.waitForTimeout(150);
    const vier = await punkte();

    expect(alle, 'the curve has no data points at all').toBeGreaterThan(4);
    expect(vier, `full history ${alle} points, four weeks ${vier} — the selection does nothing`)
      .toBeLessThan(alle);
    expect(vier, 'the four-week view shows more than four weeks').toBe(4);
  });

  test('the coach speaks from the state, not from a stock phrase', async ({ page, zustand }) => {
    await zustand('mittenInPhase3');
    await page.goto('/#/dashboard', { waitUntil: 'load' });
    await schliesseOverlays(page);
    await warteAufAnsicht(page);

    const m = await page.evaluate(async () => {
      const { StorageAdapter } = await import('./app/storage-adapter.js');
      const { aggregateCompetencies } = await import('./app/competency.js');
      const { splitQueues } = await import('./app/engine-leitner.js');
      let sp = StorageAdapter.bridgeStore({});
      try { await sp.get('state'); } catch { sp = StorageAdapter.localStorage(); }
      const st = await sp.get('state');
      const agg = aggregateCompetencies(st.events ?? []);
      return {
        text: document.getElementById('d-coach')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
        bild: !!document.querySelector('.coach-karte img'),
        kern: splitQueues(st.cards ?? [], Date.now()).kern.length,
        sicherFalsch: [...agg.values()].reduce((a, c) => a + c.sureButWrong, 0),
      };
    });

    expect(m.bild, 'no coach portrait').toBe(true);
    expect(m.text.length, 'coach has nothing to say').toBeGreaterThan(60);
    // The numbers in the text must be the ones from the state.
    expect(m.text, 'due cards missing from the coach text').toContain(String(m.kern));
    if (m.sicherFalsch >= 5) expect(m.text).toContain(String(m.sicherFalsch));
    expect(m.text, 'singular/plural not handled').not.toContain('1 Karten');

    // A different state must produce a different text — otherwise it is a fixed string.
    const ersterText = m.text;
    await page.goto('/#/', { waitUntil: 'load' });
    await zustand('nachPlacement');
    await page.goto('/#/dashboard', { waitUntil: 'load' });
    await schliesseOverlays(page);
    await warteAufAnsicht(page);
    const zweiter = await page.locator('#d-coach').innerText();
    expect(zweiter.replace(/\s+/g, ' ').trim(), 'the coach says the same thing in every situation')
      .not.toBe(ersterText);
  });

  test('the new controls are reachable', async ({ page, zustand }) => {
    await zustand('mittenInPhase3');
    await page.goto('/#/dashboard', { waitUntil: 'load' });
    await schliesseOverlays(page);
    await warteAufAnsicht(page);
    const gefunden = await erfasse(page, '#/dashboard');
    expect(gefunden.length).toBeGreaterThan(10);
  });
});
