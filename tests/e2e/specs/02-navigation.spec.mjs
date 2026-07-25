import { test, expect, phasen, schliesseOverlays, warteAufAnsicht } from '../harness.mjs';
import { erfasse, klicke } from '../coverage.mjs';

// Every route the application registers. Kept in one place so a new route is a
// one-line addition rather than a scattered edit.
export const ROUTEN = [
  '#/heute', '#/lernen', '#/karten', '#/drill', '#/dashboard',
  '#/examen', '#/placement', '#/einstellungen', '#/lernnachweis', '#/wrapup',
];

test.describe('navigation', () => {
  test.beforeEach(async ({ zustand }) => {
    await zustand('mittenInPhase3');
  });

  for (const route of ROUTEN) {
    test(`${route} renders without console errors`, async ({ page }) => {
      const fehler = [];
      page.on('console', m => { if (m.type() === 'error') fehler.push(m.text().slice(0, 120)); });
      page.on('pageerror', e => fehler.push('pageerror: ' + e.message.slice(0, 120)));

      await page.goto('/' + route, { waitUntil: 'load' });
      await schliesseOverlays(page);
      await warteAufAnsicht(page);

      // Something must actually be on screen — an empty view is a silent failure.
      const inhalt = await page.evaluate(() => (document.getElementById('view')?.innerHTML || '').length);
      expect(inhalt, `${route} renders an empty view`).toBeGreaterThan(60);
      expect(fehler, `${route} produced console errors`).toEqual([]);

      await erfasse(page, route);
    });
  }

  test('every phase is reachable from the learning view', async ({ page }) => {
    for (const p of phasen()) {
      await page.goto(`/#/lernen/${p}`, { waitUntil: 'load' });
      await schliesseOverlays(page);
      await warteAufAnsicht(page);
      const inhalt = await page.evaluate(() => (document.getElementById('view')?.innerHTML || '').length);
      expect(inhalt, `phase ${p} renders an empty view`).toBeGreaterThan(60);
      await erfasse(page, `#/lernen/${p}`);
    }
  });

  test('the sidebar navigates and marks the active entry', async ({ page }) => {
    await page.goto('/#/dashboard', { waitUntil: 'load' });
    await schliesseOverlays(page);
    await warteAufAnsicht(page);

    const links = await page.locator('.sidebar a[href^="#/"], nav a[href^="#/"], .rail a[href^="#/"]').all();
    expect(links.length, 'the sidebar offers no navigation at all').toBeGreaterThan(2);

    for (const l of links.slice(0, 8)) {
      const ziel = await l.getAttribute('href');
      await klicke(page, l, '#/sidebar');
      await page.waitForTimeout(250);
      expect(page.url()).toContain(ziel.replace('#', ''));
    }
  });

  test('reload keeps the current route', async ({ page }) => {
    await page.goto('/#/karten', { waitUntil: 'load' });
    await schliesseOverlays(page);
    await page.reload({ waitUntil: 'load' });
    await warteAufAnsicht(page);
    expect(page.url()).toContain('#/karten');
  });

  test('an unknown route does not leave a blank page', async ({ page }) => {
    await page.goto('/#/gibtesnicht', { waitUntil: 'load' });
    await schliesseOverlays(page);
    await warteAufAnsicht(page);
    const inhalt = await page.evaluate(() => document.body.innerText.trim().length);
    expect(inhalt, 'an unknown route leaves the page blank').toBeGreaterThan(20);
  });
});
