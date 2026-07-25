import { test, expect, einheiten, phasen, schliesseOverlays, warteAufAnsicht } from '../harness.mjs';
import { erfasse, klicke, INTERAKTIV } from '../coverage.mjs';

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
  // All units, not a sample: the passive capture flags controls inside units it
  // cannot judge, and only an attempted click settles whether they are usable.
  ...einheiten().map(u => `#/einheit/${u.id}`),
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
      const zustandJetzt = () => page.evaluate(() => ({
        hash: location.hash,
        groesse: document.getElementById('view')?.innerHTML.length ?? 0,
      })).catch(() => ({ hash: '', groesse: 0 }));

      await oeffne();
      let ausgang = await zustandJetzt();
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
          // And once more for the overlays: on a slower machine the AI notice
          // appears after the check in oeffne() has already run, and the next
          // control is then genuinely covered — by a modal that should have been
          // dismissed, not by a layout defect.
          await schliesseOverlays(page);
          await klicke(page, page.locator(INTERAKTIV).nth(kandidat.index), route);
        } catch (e) {
          probleme.push(`${kandidat.id} — ${e.message.replace(/^Element is not clickable: /, '')}`);
        }
        await page.waitForTimeout(120);

        // Reload only when the click actually changed something. Many controls
        // just toggle a state; reopening the route for each of them tripled the
        // runtime without testing anything more.
        const jetzt = await page.evaluate(() => ({
          hash: location.hash,
          groesse: document.getElementById('view')?.innerHTML.length ?? 0,
        })).catch(() => null);
        if (!jetzt || jetzt.hash !== ausgang.hash || Math.abs(jetzt.groesse - ausgang.groesse) > 40) {
          await oeffne();
          ausgang = await zustandJetzt();
        }
      }

      // Unreachable controls are a defect, always: something covers a control the
      // user can see. Everything else is reported through the coverage file.
      const verdeckt = probleme.filter(p => /covered by|nothing at the click point/.test(p));
      expect(verdeckt, `${route}: controls that cannot be clicked:\n  ${verdeckt.join('\n  ')}`).toEqual([]);
    });
  }
});

/**
 * The next visible, enabled control that has not been operated yet.
 *
 * Determined in a single round trip. Walking the list from Node — visible?
 * disabled? identity? — meant three calls per element on every iteration, and
 * the iteration runs once per control: quadratic in the size of the view.
 */
async function naechster(page, erledigt) {
  return page.evaluate(({ sel, fertig }) => {
    const kennungVon = (n) => {
      const teil = [n.tagName.toLowerCase()];
      if (n.id) teil.push('#' + n.id);
      if (n.dataset && Object.keys(n.dataset).length) {
        teil.push('[' + Object.entries(n.dataset).slice(0, 2).map(([k, v]) => `${k}=${v}`).join(',') + ']');
      }
      const klasse = (n.className && typeof n.className === 'string')
        ? n.className.split(/\s+/).filter(Boolean).slice(0, 2).join('.') : '';
      if (klasse) teil.push('.' + klasse);
      const text = (n.innerText || n.value || n.getAttribute('aria-label') || '').trim().slice(0, 28);
      if (text) teil.push(`"${text}"`);
      return teil.join(' ');
    };
    const erledigtSet = new Set(fertig);
    const alle = [...document.querySelectorAll(sel)];
    for (let i = 0; i < alle.length; i++) {
      const n = alle[i];
      if (n.offsetParent === null && getComputedStyle(n).position !== 'fixed') continue;
      if (n.disabled) continue;
      const id = kennungVon(n);
      if (erledigtSet.has(id)) continue;
      return { id, index: i };
    }
    return null;
  }, { sel: INTERAKTIV, fertig: [...erledigt] });
}
