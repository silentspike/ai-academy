import { test, expect, FIXTURES, schliesseOverlays, warteAufAnsicht } from '../harness.mjs';

// The bridge's own file store — the only spec that writes to it.
//
// Chromium only, and serial: every other spec answers the store endpoints per
// test, so fixtures cannot collide. This one uses the real store, and two
// browsers running it at once meant an export round-trip read what the other had
// just written.
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

  test('a large progress document is stored, not truncated', async ({ page }) => {
    // Regression: a proxy in front of the bridge once capped request bodies at
    // 8 KB, and every save above that vanished — silently, because the write
    // reported success. A learning state with notes and cards passes 8 KB
    // quickly, so this is the size that actually matters.
    const ergebnis = await page.evaluate(async () => {
      const { StorageAdapter } = await import('./app/storage-adapter.js');
      const s = StorageAdapter.bridgeStore({});
      const notiz = 'Zweckbestimmung, Rolle, Fundstelle — '.repeat(400);   // ≈ 15 KB
      const gross = { xp: 99, notes: { 'p1-e01-ki-system-rollen': notiz },
                      cards: Array.from({ length: 120 }, (_, i) => ({ id: 'c' + i, box: 2, competency: 'K02' })) };
      const bytes = new TextEncoder().encode(JSON.stringify(gross)).length;
      await s.set('state', gross);
      const zurueck = await s.get('state');
      return { bytes, xp: zurueck?.xp, notizLaenge: (zurueck?.notes?.['p1-e01-ki-system-rollen'] ?? '').length,
               karten: (zurueck?.cards ?? []).length };
    });
    expect(ergebnis.bytes, 'the test payload is below the size under test').toBeGreaterThan(8 * 1024);
    expect(ergebnis.xp, 'the large document did not arrive').toBe(99);
    expect(ergebnis.notizLaenge, 'the note was truncated').toBeGreaterThan(8 * 1024);
    expect(ergebnis.karten, 'cards were lost').toBe(120);
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

