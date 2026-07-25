import { test, expect } from '../harness.mjs';

// The bridge is a privileged local process: it starts a CLI with the user's
// subscription. docs/THREAT-MODEL.md (T1–T10) states what protects it; this spec
// checks the claims rather than trusting them. A security promise nobody tests
// is a security promise nobody has.
//
// Against the real bridge, deliberately: the per-test store used elsewhere
// answers the store endpoints itself, so a token check would never be reached —
// the test would pass without ever touching the thing it claims to verify.
// These checks only read, so they can run in both engines.
test.use({ echterStore: true });

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
      try {
        const r = await fetch(apiPrefix() + 'grade', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Bridge-Token': window.BRIDGE_TOKEN || '' },
          body: JSON.stringify({ question: 'x'.repeat(6 * 1024 * 1024), rubric: 'r', answer: 'a' }),
        });
        return { status: r.status };
      } catch (e) {
        // The bridge closes the connection once the limit is hit. Chromium still
        // reads the response, Firefox reports a network error — both mean the
        // body was cut off rather than accepted.
        return { abgebrochen: true, meldung: String(e.message).slice(0, 80) };
      }
    });
    if (antwort.abgebrochen) {
      expect(antwort.meldung, 'the request failed for an unrelated reason').toMatch(/NetworkError|network|aborted|failed/i);
    } else {
      expect([413, 400], `oversized body answered with ${antwort.status}`).toContain(antwort.status);
    }
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
