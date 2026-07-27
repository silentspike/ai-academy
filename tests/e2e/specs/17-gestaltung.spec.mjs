import { test, expect, schliesseOverlays, warteAufAnsicht, phasen } from '../harness.mjs';
import { readFileSync } from 'node:fs';

/** The token table out of DESIGN-SYSTEM.md §1, as the document itself writes it. */
function tokenAusReferenz() {
  const doc = readFileSync(new URL('../../../DESIGN-SYSTEM.md', import.meta.url), 'utf-8');
  return [...doc.matchAll(/^\| `(--[a-z0-9-]+)` \| `([^`]+)` \|/gm)]
    .map(([, name, wert]) => ({ name, wert: wert.trim() }))
    .filter(t => !t.wert.includes('var('));   // abgeleitete Werte prüft der Browser selbst
}

// The design reference, checked instead of looked at.
//
// Every claim in DESIGN-SYSTEM.md §5/§6 and plan §6.3 describes something a
// browser can measure: whether a layer moves, whether a view carries an icon,
// whether the type levels actually differ, whether a route builds up in steps.
// Screenshots said "looks about right" for months while the row cascade read
// `calc(40ms * var(--i))` with nobody setting `--i` — built, in the markup, and
// doing nothing.

const ANSICHTEN = ['#/heute', '#/lernen', '#/karten', '#/drill', '#/dashboard',
  '#/einstellungen', '#/wrapup', '#/examen', ...phasen().map(p => `#/lernen/${p}`)];

test.describe('design system', () => {
  // The suite runs with reduced motion so screenshots are stable. Motion has to
  // be measured with motion allowed — otherwise the check confirms the setting,
  // not the product.
  test.describe('with motion', () => {
    // `mitBewegung` lifts the determinism stylesheet the harness injects for
    // screenshots — it forces every duration and delay to 0s, which would make
    // this suite measure itself instead of the product. The media state itself
    // is set per test with emulateMedia: the `reducedMotion` fixture option does
    // not reach the page through this harness (measured — matchMedia stayed
    // false either way), and an emulation that silently does nothing would turn
    // both tests below into decoration.
    test.use({ mitBewegung: true });

    test('the background is alive, and only transform and opacity move', async ({ page, zustand }) => {
      await zustand('mittenInPhase3');
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await page.goto('/#/dashboard', { waitUntil: 'load' });
      await schliesseOverlays(page);
      await warteAufAnsicht(page);

      const schichten = await page.evaluate(() => [...document.querySelectorAll('.bg-aurora')].map(el => {
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return {
          name: cs.animationName, dauer: parseFloat(cs.animationDuration),
          opacity: parseFloat(cs.opacity), flaeche: Math.round(r.width * r.height),
          sichtbar: cs.display !== 'none' && cs.visibility !== 'hidden',
        };
      }));
      expect(schichten.length, 'no background layers at all').toBeGreaterThanOrEqual(3);
      for (const s of schichten) {
        expect(s.name, 'a background layer is not animated').not.toBe('none');
        // "kaum merklich" (§5): between one and a half and four minutes per loop.
        expect(s.dauer, `loop of ${s.dauer}s is not "barely perceptible"`).toBeGreaterThanOrEqual(90);
        expect(s.opacity, 'a layer is dimmed below the threshold of visibility').toBeGreaterThan(0.1);
        expect(s.sichtbar, 'a background layer is not rendered').toBe(true);
        expect(s.flaeche, 'a background layer has no area').toBeGreaterThan(10_000);
      }

      // Only transform and opacity are animated — everything else forces layout.
      const keyframes = await page.evaluate(() => {
        const eigenschaften = new Set();
        for (const sheet of document.styleSheets) {
          let regeln; try { regeln = sheet.cssRules; } catch { continue; }
          for (const r of regeln) {
            if (r.type !== CSSRule.KEYFRAMES_RULE) continue;
            for (const kf of r.cssRules) {
              for (const p of kf.style) eigenschaften.add(p);
            }
          }
        }
        return [...eigenschaften];
      });
      const erlaubt = new Set(['transform', 'opacity', 'filter', 'background', 'background-position',
        'box-shadow', 'color', 'border-color', 'width', 'stroke-dashoffset', 'visibility']);
      const layoutTreiber = keyframes.filter(p => ['top', 'left', 'right', 'bottom', 'height',
        'margin', 'margin-top', 'padding'].includes(p));
      expect(layoutTreiber, `keyframes animate layout properties: ${layoutTreiber.join(', ')}`).toEqual([]);
      expect(keyframes.every(p => erlaubt.has(p) || !p.startsWith('-')),
        `unexpected animated property: ${keyframes.filter(p => !erlaubt.has(p)).join(', ')}`).toBe(true);
    });

    test('a route builds up in steps instead of appearing at once', async ({ page, zustand }) => {
      await zustand('mittenInPhase3');
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await page.goto('/#/dashboard', { waitUntil: 'load' });
      await schliesseOverlays(page);
      await warteAufAnsicht(page);

      // Cards on a single-column view
      await page.goto('/#/heute', { waitUntil: 'load' });
      await warteAufAnsicht(page);
      await page.goto('/#/lernen', { waitUntil: 'load' });
      await warteAufAnsicht(page);

      const reihen = await page.evaluate(() => [...document.querySelectorAll('#view .lern-row')]
        .slice(0, 8).map(el => ({
          name: getComputedStyle(el).animationName,
          delay: Math.round(parseFloat(getComputedStyle(el).animationDelay) * 1000),
        })));
      expect(reihen.length, 'no rows to stagger').toBeGreaterThan(3);
      for (const r of reihen) expect(r.name, 'a row is not revealed at all').not.toBe('none');
      const verzoegerungen = reihen.map(r => r.delay);
      // The point of the cascade: the delays differ. All-zero is what a `--i`
      // nobody sets produces, and it looks identical in a screenshot.
      expect(new Set(verzoegerungen).size,
        `every row starts at the same moment (${verzoegerungen.join(', ')} ms) — the cascade does nothing`)
        .toBeGreaterThan(1);
      // 60 ms per element, at most eight (§5).
      expect(Math.max(...verzoegerungen), 'the cascade runs longer than eight elements').toBeLessThanOrEqual(420);
    });

    // Negative control. The state this check exists to catch is the one the
    // product was in until today: the rule was there, `--i` was not, and every
    // row started at zero. Put that back and the measurement has to notice.
    test('the cascade check notices when every row starts at once', async ({ page, zustand }) => {
      await zustand('mittenInPhase3');
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await page.goto('/#/lernen', { waitUntil: 'load' });
      await schliesseOverlays(page);
      await warteAufAnsicht(page);
      await page.addStyleTag({ content: '#view .lern-row { animation-delay:0ms !important; }' });
      await page.waitForTimeout(120);

      const verzoegerungen = await page.evaluate(() => [...document.querySelectorAll('#view .lern-row')]
        .slice(0, 8).map(el => Math.round(parseFloat(getComputedStyle(el).animationDelay) * 1000)));
      expect(new Set(verzoegerungen).size,
        'a cascade with identical delays is not detected — the check proves nothing').toBe(1);
    });
  });

  test.describe('with reduced motion', () => {
  test.use({ mitBewegung: true });
  test('reduced motion switches the build-up off', async ({ page, zustand }) => {
    // Motion allowed at the harness level, reduction requested at the OS level:
    // only then does this measure the media query rather than the stylesheet the
    // suite injects for stable screenshots.
    await zustand('mittenInPhase3');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/#/lernen', { waitUntil: 'load' });
    await schliesseOverlays(page);
    await warteAufAnsicht(page);

    const bewegt = await page.evaluate(() => {
      // Proof that the emulation arrived — otherwise "everything is none" would
      // also be true of a page that simply never animated.
      const reduziert = matchMedia('(prefers-reduced-motion: reduce)').matches;
      const namen = [...document.querySelectorAll('#view .lern-row, #view > .card')]
        .map(el => getComputedStyle(el).animationName);
      const aurora = [...document.querySelectorAll('.bg-aurora')]
        .map(el => getComputedStyle(el).animationName);
      return { reduziert, namen, aurora };
    });
    expect(bewegt.reduziert, 'the reduced-motion emulation did not reach the page').toBe(true);
    expect(bewegt.namen.every(n => n === 'none'),
      `rows and cards still animate under reduced motion: ${bewegt.namen.join(', ')}`).toBe(true);
    expect(bewegt.aurora.every(n => n === 'none'),
      'the background still moves under reduced motion').toBe(true);
  });
  });

  test('no view arrives without an icon or an image', async ({ page, zustand }) => {
    await zustand('mittenInPhase3');
    const ohne = [];
    for (const route of ANSICHTEN) {
      await page.goto('/' + route, { waitUntil: 'load' });
      await schliesseOverlays(page);
      await warteAufAnsicht(page).catch(() => {});
      const m = await page.evaluate(() => {
        const view = document.getElementById('view');
        const symbole = view.querySelectorAll('.csym svg, svg use, img');
        const csym = view.querySelector('.csym');
        const cs = csym ? getComputedStyle(csym) : null;
        return {
          anzahl: symbole.length,
          // Duotone-Glow (§6): the symbol sits on a tinted surface, not on nothing.
          // Duotone surfaces are gradients, so the colour alone reads as
          // transparent — the tint sits in background-image.
          flaeche: cs ? `${cs.backgroundColor} ${cs.backgroundImage}` : null,
          radius: cs ? cs.borderRadius : null,
        };
      });
      if (!m.anzahl) ohne.push(route);
      else if (m.flaeche && /^rgba\(0, 0, 0, 0\) none$/.test(m.flaeche)) ohne.push(route + ' (Symbol ohne Fläche)');
    }
    expect(ohne, `views without an icon or image: ${ohne.join(', ')}`).toEqual([]);
  });

  test('every token in the design reference is the one the product uses', async ({ page, zustand }) => {
    // DESIGN-SYSTEM.md calls itself binding — and fifteen of its twenty colour
    // values had not matched the build since v2.0. A document that describes
    // something else than the product is worse than none: it gets quoted in
    // reviews. This makes the two provable against each other.
    const soll = tokenAusReferenz();
    expect(soll.length, 'no token table found in DESIGN-SYSTEM.md').toBeGreaterThan(10);

    await zustand('mittenInPhase3');
    await page.goto('/#/dashboard', { waitUntil: 'load' });
    await schliesseOverlays(page);
    await warteAufAnsicht(page);

    const ist = await page.evaluate((namen) => {
      const cs = getComputedStyle(document.documentElement);
      return Object.fromEntries(namen.map(n => [n, cs.getPropertyValue(n).trim()]));
    }, soll.map(t => t.name));

    const norm = (v) => v.replace(/\s+/g, '').toLowerCase();
    const abweichung = soll.filter(t => norm(ist[t.name] ?? '') !== norm(t.wert))
      .map(t => `${t.name}: Referenz ${t.wert} · Produkt ${ist[t.name] || '(fehlt)'}`);
    expect(abweichung, `DESIGN-SYSTEM.md and the product disagree:\n  ${abweichung.join('\n  ')}`).toEqual([]);
  });

  test('the token check would notice a table that drifted', async ({ page, zustand }) => {
    // Negative control: the comparison above is worth exactly as much as its
    // ability to fail. A value the product does not use has to be caught.
    await zustand('mittenInPhase3');
    await page.goto('/#/dashboard', { waitUntil: 'load' });
    await schliesseOverlays(page);
    await warteAufAnsicht(page);
    const ist = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--emerald').trim());
    expect(ist).not.toBe('#3ddc97');   // der Wert, der bis heute in der Tabelle stand
    expect(ist.length, 'the token does not exist at all').toBeGreaterThan(3);
  });

  test('the type levels differ in size, weight and colour', async ({ page, zustand }) => {
    await zustand('mittenInPhase3');
    await page.goto('/#/heute', { waitUntil: 'load' });
    await schliesseOverlays(page);
    await warteAufAnsicht(page);

    const stufen = await page.evaluate(() => {
      const lies = (sel) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const cs = getComputedStyle(el);
        return { sel, size: parseFloat(cs.fontSize), weight: +cs.fontWeight,
                 color: cs.color, family: cs.fontFamily.split(',')[0].replace(/["']/g, '') };
      };
      return [lies('#view .chead h3'), lies('#view .chead .sub'), lies('#view .ritual-txt b')].filter(Boolean);
    });
    expect(stufen.length, 'the type levels are not all present').toBe(3);
    const [titel, unter] = stufen;
    expect(titel.size, 'heading is not larger than its subtitle').toBeGreaterThan(unter.size);
    expect(titel.weight, 'heading is not heavier than its subtitle').toBeGreaterThan(unter.weight);
    expect(titel.color, 'heading and subtitle share one colour').not.toBe(unter.color);
    // Display face for headings, text face for running text (§2).
    expect(titel.family, 'the heading does not use the display face').toMatch(/Space Grotesk/);
    expect(unter.family, 'the subtitle does not use the text face').toMatch(/Inter/);
  });
});
