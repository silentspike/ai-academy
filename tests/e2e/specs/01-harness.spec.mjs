import { test, expect, schliesseOverlays } from '../harness.mjs';
import { erfasse, klicke, INTERAKTIV } from '../coverage.mjs';

test.describe('harness', () => {
  test('state fixtures put the application into the intended situation', async ({ page, zustand }) => {
    await zustand('mittenInPhase3');
    const st = await page.evaluate(async () => {
      const { StorageAdapter } = await import('./app/storage-adapter.js');
      let s = StorageAdapter.bridgeStore({});
      try { await s.get('state'); } catch { s = StorageAdapter.localStorage(); }
      return await s.get('state');
    });
    expect(st.units_done).toContain('p2-e02-zeitschichten');
    expect(st.chapterTests.p2.passed).toBe(true);
    expect(st.profile.org).toBe('Beispielbank AG');
  });

  test('the exam-ready fixture actually opens the exam gate', async ({ page, zustand }) => {
    await zustand('examensreif');
    // The gate needs the competency catalogue and the cards to judge retention —
    // it is not a function of the state alone.
    const gate = await page.evaluate(async () => {
      const { examGate } = await import('./app/exam-core.js');
      const { StorageAdapter } = await import('./app/storage-adapter.js');
      let s = StorageAdapter.bridgeStore({});
      try { await s.get('state'); } catch { s = StorageAdapter.localStorage(); }
      const state = await s.get('state');
      const { kompetenzen } = await fetch('content/competencies.json').then(r => r.json());
      return examGate(state, { kompetenzen, cards: state.cards ?? [], nowMs: Date.now() });
    });
    expect(gate.reasons, 'the exam-ready fixture does not open the gate').toEqual([]);
    expect(gate.allowed).toBe(true);
  });

  test('the bridge answers malformed grading requests with 400, not 500', async ({ page }) => {
    const ruf = (koerper) => page.evaluate(async (b) => {
      const { apiPrefix } = await import('./app/llm-adapter.js');
      const res = await fetch(apiPrefix() + 'grade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Bridge-Token': window.BRIDGE_TOKEN || '' },
        body: JSON.stringify(b),
      });
      return { status: res.status, body: await res.json().catch(() => null) };
    }, koerper);

    // A missing field used to reach the grading path and fail there, surfacing as
    // 500 "internal" with a stack-trace message.
    for (const unvollstaendig of [
      { kind: 'practice', rubric: 'r', answer: 'a' },
      { kind: 'practice', question: 'q', answer: 'a' },
      { kind: 'practice', question: 'q', rubric: 'r' },
    ]) {
      const r = await ruf(unvollstaendig);
      expect(r.status).toBe(400);
      expect(r.body.error).toBe('BAD_FIELD');
    }

    // Complete but no model connected: a defined 503, never a crash.
    const voll = await ruf({ kind: 'practice', question: 'q', rubric: { kriterien: ['a'] }, answer: 'a' });
    expect([200, 503]).toContain(voll.status);
    expect(voll.body).not.toBeNull();
  });

  test('the coverage recorder finds operable elements', async ({ page }) => {
    await schliesseOverlays(page);
    const gefunden = await erfasse(page, '#/');
    expect(gefunden.length).toBeGreaterThan(3);
  });

  test('reachability check rejects a covered element', async ({ page, zustand }) => {
    // A profile is needed, otherwise the application sits on the setup wizard.
    await zustand('nachPlacement');
    // Grab the element BEFORE covering it — afterwards nothing is visible any more.
    // The interface navigates with links, not buttons, so use the generic selector.
    const ziel = page.locator(INTERAKTIV).locator('visible=true').first();
    await ziel.waitFor({ state: 'visible' });

    await page.evaluate(() => {
      const d = document.createElement('div');
      d.id = 'e2e-blocker';
      // Deliberately transparent: the element stays visible to the eye and to
      // Playwright's visibility check, yet cannot be clicked. Exactly the class of
      // defect that only elementFromPoint catches.
      d.style.cssText = 'position:fixed;inset:0;z-index:99999;background:transparent';
      document.body.appendChild(d);
    });

    await expect(klicke(page, ziel, '#/negativtest')).rejects.toThrow(/not clickable|covered by/);
    await page.evaluate(() => document.getElementById('e2e-blocker')?.remove());
  });
});
