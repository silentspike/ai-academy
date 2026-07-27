import { test, expect, FIXTURES, JETZT, schliesseOverlays, warteAufAnsicht } from '../harness.mjs';

/**
 * Mid-phase-3 with today's review still OPEN.
 *
 * The plain fixture marks `dayStats[heute].reviewDone = true`, so the session
 * starts with the review already behind it and the gate never appears — measured,
 * after both the positive test and its negative control passed for that reason
 * rather than for the one they claimed. A precondition has to be built, not hoped
 * for.
 */
function reviewOffen() {
  const st = FIXTURES.mittenInPhase3();
  const d = new Date(JETZT);
  const heute = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  if (st.dayStats?.[heute]) st.dayStats[heute] = { ...st.dayStats[heute], reviewDone: false };
  delete st.session;
  return st;
}

// The test instance exists to be clicked through. A tool that answers "heute
// schon ein Antritt" while you are trying to look at it is examining you instead
// of showing itself.
//
// Simulation is a property of the BRIDGE PROCESS, never of the learning record:
// a switch in the state could travel into the real record through export and
// import, a start-up parameter cannot, and the systemd unit of the real
// operation does not pass it. The health endpoint is intercepted here because
// that is exactly the seam — the application asks the process, and this proves
// it asks and obeys.

async function alsSimulation(page, an) {
  await page.route('**/api/health', async route => {
    const antwort = await route.fetch();
    const j = await antwort.json();
    await route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ ...j, simulation: an }) });
  });
}

test.describe('simulation', () => {
  test('the exam gate is open, and the banner says why', async ({ page, zustand }) => {
    // A state that is locked on every count: no chapter tests, no retention,
    // and an attempt already used today.
    await alsSimulation(page, true);
    await zustand('nachPlacement');
    await page.goto('/#/examen', { waitUntil: 'load' });
    await schliesseOverlays(page);
    await warteAufAnsicht(page);

    const banner = page.locator('#sim-banner');
    await expect(banner).toBeVisible();
    expect(await banner.innerText()).toMatch(/Simulation/);

    const text = await page.evaluate(() => document.getElementById('view').innerText);
    expect(text, 'the exam is still locked in simulation').not.toMatch(/Examens-Gate \(Schloss aktiv\)/);
    await expect(page.locator('#view button:has-text("Examen starten")')).toBeVisible();
  });

  test('a chapter test does not demand the boss fight first', async ({ page, zustand }) => {
    await alsSimulation(page, true);
    await zustand('nachPlacement');
    await page.goto('/#/test/p3', { waitUntil: 'load' });
    await schliesseOverlays(page);
    await warteAufAnsicht(page);
    const text = await page.evaluate(() => document.getElementById('view').innerText);
    expect(text, 'the chapter test still waits for the boss fight').not.toMatch(/Noch gesperrt — erst das Fachgespräch/);
  });

  test('units open without the mandatory review', async ({ page, zustand }) => {
    await alsSimulation(page, true);
    await zustand(reviewOffen());          // fällige Karten, Review heute noch offen
    await page.goto('/#/einheit/p1-e01-ki-system-rollen', { waitUntil: 'load' });
    await schliesseOverlays(page);
    await warteAufAnsicht(page);
    const text = await page.evaluate(() => document.getElementById('view').innerText);
    expect(text, 'the unit still insists on the review').not.toMatch(/Erst wiederholen, dann Neues/);
  });

  // Negative control, and the one that matters most: without the flag every one
  // of those gates has to hold. Otherwise "open in simulation" would not be a
  // property of the mode but a broken gate.
  test('without the flag every gate holds and no banner shows', async ({ page, zustand }) => {
    await alsSimulation(page, false);
    await zustand('nachPlacement');
    await page.goto('/#/examen', { waitUntil: 'load' });
    await schliesseOverlays(page);
    await warteAufAnsicht(page);

    await expect(page.locator('#sim-banner')).toBeHidden();
    const examen = await page.evaluate(() => document.getElementById('view').innerText);
    expect(examen, 'the exam gate does not hold without simulation').toMatch(/Examens-Gate \(Schloss aktiv\)/);

    await page.goto('/#/test/p3', { waitUntil: 'load' });
    await warteAufAnsicht(page);
    const test3 = await page.evaluate(() => document.getElementById('view').innerText);
    expect(test3, 'the boss-fight precondition does not hold without simulation')
      .toMatch(/Noch gesperrt — erst das Fachgespräch/);

    await zustand(reviewOffen());
    await page.goto('/#/einheit/p1-e01-ki-system-rollen', { waitUntil: 'load' });
    await warteAufAnsicht(page);
    const einheit = await page.evaluate(() => document.getElementById('view').innerText);
    expect(einheit, 'the mandatory review does not hold without simulation')
      .toMatch(/Erst wiederholen, dann Neues/);
  });
});
