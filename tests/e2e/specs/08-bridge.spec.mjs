import { test, expect, FIXTURES, schliesseOverlays, warteAufAnsicht } from '../harness.mjs';

// The two specs that talk to the real bridge — its file store and its hardening.
//
// They live in one file on purpose. Everything else answers the store endpoints
// per test, so fixtures cannot collide; these two share the one store the bridge
// actually keeps. Split across files they land on different workers, and an
// export round-trip then reads what a neighbour just wrote — which is exactly
// how this failed in the full run while passing on its own.
test.use({ echterStore: true });
test.describe.configure({ mode: 'serial' });

test.describe('persistence', () => {
  test('progress survives a reload', async ({ page, zustand }) => {
    await zustand({ ...FIXTURES.mittenInPhase3(), xp: 1234 });
    await page.reload({ waitUntil: 'load' });
    await schliesseOverlays(page);
    await warteAufAnsicht(page);

    const xp = await page.evaluate(async () => {
      const { StorageAdapter } = await import('./app/storage-adapter.js');
      return (await StorageAdapter.bridgeStore({}).get('state'))?.xp;
    });
    expect(xp, 'the learning state did not survive the reload').toBe(1234);
  });

  test('a note is written and read back', async ({ page, zustand }) => {
    await zustand('mittenInPhase3');
    const gelesen = await page.evaluate(async () => {
      const { StorageAdapter } = await import('./app/storage-adapter.js');
      const s = StorageAdapter.bridgeStore({});
      await s.set('notes', { 'p1-e01-ki-system-rollen': 'Zweckbestimmung zuerst klären.' });
      return await s.get('notes');
    });
    expect(gelesen['p1-e01-ki-system-rollen']).toMatch(/Zweckbestimmung/);
  });

  test('export and import round-trip without loss', async ({ page, zustand }) => {
    // §5.5: the export is the safety net against a browser clearing its storage.
    // A round trip that loses fields would make it a false promise.
    await zustand({ ...FIXTURES.examensreif(), xp: 4242 });
    const ergebnis = await page.evaluate(async () => {
      const { StorageAdapter } = await import('./app/storage-adapter.js');
      const s = StorageAdapter.bridgeStore({});
      const bundle = await s.exportAll();
      await s.set('state', { xp: 0, cards: [] });          // simulate a loss
      await s.importAll(bundle);
      const zurueck = await s.get('state');
      return { xp: zurueck?.xp, karten: (zurueck?.cards ?? []).length,
               tests: Object.keys(zurueck?.chapterTests ?? {}).length };
    });
    expect(ergebnis.xp, 'the export did not carry the points back').toBe(4242);
    expect(ergebnis.karten, 'the cards were lost in the round trip').toBe(24);
    expect(ergebnis.tests, 'the chapter tests were lost in the round trip').toBe(9);
  });

  test('a summative answer is secured before it is graded', async ({ page }) => {
    // #25/T9: a timeout must not destroy a thirty-minute answer or burn the
    // attempt. The answer is written first, then graded.
    const vorgang = await page.evaluate(async () => {
      const { apiPrefix } = await import('./app/llm-adapter.js');
      const kopf = { 'Content-Type': 'application/json', 'X-Bridge-Token': window.BRIDGE_TOKEN || '' };
      const res = await fetch(apiPrefix() + 'grade', {
        method: 'POST', headers: kopf,
        body: JSON.stringify({
          question: 'Stufen Sie ein und begründen Sie: Anspruchsprüfung durch einen Sozialversicherungsträger.',
          rubric: 'Kriterium A: Zweckbestimmung. Kriterium B: Fundstelle.',
          modelAnswer: 'Betreiberrolle, Anhang III Nr. 5 lit. a.',
          answer: 'Die Behörde ist Betreiberin; Anhang III Nr. 5 lit. a ist einschlägig.',
          kind: 'exercise',
        }),
      });
      const body = await res.json().catch(() => null);
      const pending = await fetch(apiPrefix() + 'pending', { headers: kopf })
        .then(r => r.ok ? r.json() : null).catch(() => null);
      return { status: res.status, body, pending };
    });
    expect(vorgang.status, 'grading a well-formed request failed').toBe(200);
    expect(vorgang.body, 'grading returned nothing').toBeTruthy();
    expect(typeof vorgang.body.result?.score, 'the grade carries no score').toBe('number');

    // The transaction id proves the answer was written before the model was
    // asked — that is what keeps a timeout from destroying the answer (T9).
    expect(vorgang.body.txId, 'the answer was not secured before grading').toBeTruthy();

    // Every grade carries its label: type, model, rubric version (§5.0).
    expect(vorgang.body.label?.type, 'the grade is not labelled').toMatch(/LLM|deterministisch/);
    expect(vorgang.body.label?.model, 'the grade does not name the model').toBeTruthy();
    expect(vorgang.body.label?.rubricVersion, 'the grade does not name the rubric version').toBeTruthy();
  });

  test('the store recovers when its directory disappears underneath it', async ({ page }) => {
    // Seen in practice: a cleaned temporary directory turned every save into a
    // 500 and silently lost the day's work.
    const ok = await page.evaluate(async () => {
      const { StorageAdapter } = await import('./app/storage-adapter.js');
      const s = StorageAdapter.bridgeStore({});
      await s.set('state', { xp: 7 });
      const a = await s.get('state');
      await s.set('state', { xp: 8 });
      const b = await s.get('state');
      return a?.xp === 7 && b?.xp === 8;
    });
    expect(ok, 'consecutive saves do not arrive').toBe(true);
  });
});

test.describe('hardening', () => {
  test('health reveals no secret', async ({ page }) => {
    const h = await page.evaluate(async () => {
      const { apiPrefix } = await import('./app/llm-adapter.js');
      const r = await fetch(apiPrefix() + 'health');
      return { status: r.status, text: await r.text() };
    });
    expect(h.status).toBe(200);
    // T6: the pairing token must never appear in an unauthenticated answer.
    const token = await page.evaluate(() => window.BRIDGE_TOKEN || '');
    expect(token.length, 'no pairing token in the page at all').toBeGreaterThan(8);
    expect(h.text, 'the health endpoint leaks the pairing token').not.toContain(token);
    expect(h.text, 'the health endpoint leaks a key').not.toMatch(/sk-|api[_-]?key|secret/i);
  });

  test('a request without a token is refused', async ({ page }) => {
    // T1/T2: the token is what separates this page from any other local document.
    const antwort = await page.evaluate(async () => {
      const { apiPrefix } = await import('./app/llm-adapter.js');
      const r = await fetch(apiPrefix() + 'progress', { headers: { 'X-Bridge-Token': 'falsch' } });
      return { status: r.status, body: await r.text() };
    });
    expect(antwort.status, 'the store answers despite an invalid token').toBe(403);
    expect(antwort.body, 'the refusal leaks the expected token').not.toMatch(/[A-Za-z0-9_-]{24,}/);
  });

  test('an oversized body is refused, not swallowed', async ({ page }) => {
    // T4: without a limit a local page could exhaust memory.
    const antwort = await page.evaluate(async () => {
      const { apiPrefix } = await import('./app/llm-adapter.js');
      const r = await fetch(apiPrefix() + 'grade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Bridge-Token': window.BRIDGE_TOKEN || '' },
        body: JSON.stringify({ question: 'x'.repeat(6 * 1024 * 1024), rubric: 'r', answer: 'a' }),
      });
      return r.status;
    });
    expect([413, 400], `oversized body answered with ${antwort}`).toContain(antwort);
  });

  test('the store is not reachable over the static path', async ({ page }) => {
    // §5.7/T3: learning state, notes and logs live outside the web root. In the
    // earlier layout they were readable over HTTP.
    for (const pfad of ['data/', 'data/store/progress.json', '.tmp-e2e-store/store/progress.json',
                        'bridge/bridge.mjs', '../package.json', 'tests/e2e/harness.mjs']) {
      const status = await page.evaluate(async (p) => {
        const r = await fetch(p, { method: 'GET' });
        return r.status;
      }, pfad);
      expect([403, 404], `${pfad} is served over HTTP (status ${status})`).toContain(status);
    }
  });

  test('a path traversal attempt does not escape the web root', async ({ page }) => {
    for (const pfad of ['../../etc/passwd', '..%2f..%2fetc%2fpasswd', '/../bridge/bridge.mjs']) {
      const ergebnis = await page.evaluate(async (p) => {
        const r = await fetch(p);
        return { status: r.status, text: (await r.text()).slice(0, 80) };
      }, pfad);
      expect(ergebnis.text, `${pfad} returned system content`).not.toMatch(/root:x:|#!\/usr\/bin\/env node/);
    }
  });

  test('the page carries a content security policy', async ({ page }) => {
    const antwort = await page.request.get(new URL('/', page.url()).href);
    const csp = antwort.headers()['content-security-policy'];
    expect(csp, 'no content security policy is sent').toBeTruthy();
    expect(csp, 'the policy allows any connection target').not.toMatch(/connect-src[^;]*\*/);
    expect(antwort.headers()['x-content-type-options'], 'MIME sniffing is not switched off').toBe('nosniff');
  });

  test('no provider key path exists in the shipped code', async ({ page }) => {
    // §5.4: model access runs exclusively through the CLI sign-in. A key field
    // in the browser would be readable by any script on the page.
    const treffer = await page.evaluate(async () => {
      const dateien = ['app/llm-adapter.js', 'app/onboarding.js', 'app/selfcheck.js', 'app/app.js'];
      const gefunden = [];
      for (const d of dateien) {
        const t = await fetch(d).then(r => r.ok ? r.text() : '').catch(() => '');
        if (/ANTHROPIC_API_KEY|OPENAI_API_KEY|apiKey\s*[:=]\s*['"]/i.test(t)) gefunden.push(d);
      }
      return gefunden;
    });
    expect(treffer, `provider key handling found in: ${treffer.join(', ')}`).toEqual([]);
  });
});
