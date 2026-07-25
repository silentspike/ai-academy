import { test, expect, einheiten, phasen, schliesseOverlays, warteAufAnsicht } from '../harness.mjs';
import { erfasse, klicke, kennung, INTERAKTIV } from '../coverage.mjs';

// The systematic pass: every route, every operable element, actually operated.
//
// The other specs test what a control is supposed to do. This one only asks
// whether it can be operated at all — and that is the question the July
// acceptance run got wrong, because its checklist listed the features somebody
// remembered rather than the buttons that were on screen.
//
// Elements are operated once each, identified across routes: the sidebar is the
// same sidebar everywhere.

const ROUTEN = [
  '#/heute', '#/lernen', '#/karten', '#/drill', '#/dashboard',
  '#/examen', '#/placement', '#/einstellungen', '#/lernnachweis', '#/wrapup',
  '#/boss', '#/onboarding',
  ...phasen().map(p => `#/lernen/${p}`),
  ...einheiten().slice(0, 6).map(u => `#/einheit/${u.id}`),
];

/** Controls that would end the run rather than test it. */
const AUSLASSEN = [
  /alles löschen|zurücksetzen|reset|wipe/i,   // would destroy the fixture mid-sweep
];

test.describe('sweep', () => {
  test.describe.configure({ timeout: 240_000 });

  for (const route of ROUTEN) {
    test(`every control on ${route} can be operated`, async ({ page, zustand }) => {
      await zustand('mittenInPhase3');

      const oeffne = async () => {
        await page.goto('/' + route, { waitUntil: 'load' });
        await schliesseOverlays(page);
        await warteAufAnsicht(page).catch(() => {});
        await page.waitForTimeout(200);
      };
      await oeffne();
      const gefunden = await erfasse(page, route);
      expect(gefunden.length, `${route} offers nothing to operate`).toBeGreaterThan(0);

      const erledigt = new Set();
      const probleme = [];

      // Re-open the route after each click: operating a control may navigate away
      // or re-render the view, and stale handles would silently skip the rest.
      for (let runde = 0; runde < gefunden.length + 5; runde++) {
        const kandidat = await naechster(page, erledigt);
        if (!kandidat) break;
        erledigt.add(kandidat.id);
        if (AUSLASSEN.some(rx => rx.test(kandidat.id))) continue;

        try {
          // Close a tooltip left open by the previous click and move the pointer
          // away: a hovering tooltip legitimately sits in front of its own term,
          // and counting that as an overlay would be a false alarm.
          await page.keyboard.press('Escape').catch(() => {});
          await page.mouse.move(4, 4);
          await page.waitForTimeout(60);
          await klicke(page, page.locator(INTERAKTIV).nth(kandidat.index), route);
        } catch (e) {
          probleme.push(`${kandidat.id} — ${e.message.replace(/^Element is not clickable: /, '')}`);
        }
        await page.waitForTimeout(120);
        await oeffne();
      }

      // Unreachable controls are a defect, always: something covers a control the
      // user can see. Everything else is reported through the coverage file.
      const verdeckt = probleme.filter(p => /covered by|nothing at the click point/.test(p));
      expect(verdeckt, `${route}: controls that cannot be clicked:\n  ${verdeckt.join('\n  ')}`).toEqual([]);
    });
  }
});

/** The next visible control that has not been operated yet, with its index. */
async function naechster(page, erledigt) {
  const alle = await page.locator(INTERAKTIV).all();
  for (let i = 0; i < alle.length; i++) {
    if (!await alle[i].isVisible().catch(() => false)) continue;
    if (await alle[i].isDisabled().catch(() => false)) continue;
    const id = await kennung(alle[i]).catch(() => null);
    if (!id || erledigt.has(id)) continue;
    return { id, index: i };
  }
  return null;
}
