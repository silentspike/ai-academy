import { test, einheiten, phasen, schliesseOverlays, warteAufAnsicht } from '../harness.mjs';

// The visual record: one screenshot per view and state, at the real window size.
//
// Not a pixel comparison — those live in their own spec. This is the material a
// person looks at. Every design approval before this suite was given at 1280×720
// because that is what Playwright hands out by default, so nobody had ever seen
// the product at the size it actually runs at.

const ANSICHTEN = [
  ['leer', '#/onboarding'],
  ['mittenInPhase3', '#/heute'],
  ['mittenInPhase3', '#/lernen'],
  ['mittenInPhase3', '#/karten'],
  ['mittenInPhase3', '#/drill'],
  ['mittenInPhase3', '#/dashboard'],
  ['mittenInPhase3', '#/boss'],
  ['mittenInPhase3', '#/einstellungen'],
  ['mittenInPhase3', '#/wrapup'],
  ['nachPlacement', '#/heute'],
  ['nachPlacement', '#/lernen'],
  ['examensreif', '#/examen'],
  ['examensreif', '#/dashboard'],
  ['examensreif', '#/test/p3'],
  ['abgeschlossen', '#/lernnachweis'],
  ['abgeschlossen', '#/heute'],
  ['abgeschlossen', '#/dashboard'],
  ...phasen().map(p => ['mittenInPhase3', `#/lernen/${p}`]),
  ...einheiten().map(u => ['mittenInPhase3', `#/einheit/${u.id}`]),
];

test.describe('views', () => {
  test.describe.configure({ mode: 'parallel' });

  for (const [fixture, route] of ANSICHTEN) {
    const name = `${fixture}__${route.replace(/[#/]/g, '_').replace(/^_+/, '')}`;
    test(`screenshot ${fixture} ${route}`, async ({ page, zustand }) => {
      await zustand(fixture);
      await page.goto('/' + route, { waitUntil: 'load' });
      await schliesseOverlays(page);
      await warteAufAnsicht(page).catch(() => { /* an empty view is worth seeing too */ });
      await page.waitForTimeout(400);

      // Lossless, full size: the sheet builder derives its own smaller copies.
      await page.screenshot({ path: `test-results/ansichten/${name}.png`, fullPage: false });
    });
  }
});
