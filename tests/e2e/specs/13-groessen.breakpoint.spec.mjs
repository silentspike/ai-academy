import { test, expect, schliesseOverlays, warteAufAnsicht } from '../harness.mjs';

// The layout across window sizes.
//
// This spec exists because the product was built and reviewed at exactly one
// size. The shell was capped at 768 pixels — the height of the laptop it was
// designed on — so a 1920×1200 display showed 432 pixels of black and a 4K
// display 1392. Meanwhile paragraphs ran to over a hundred characters, and a
// 260-pixel sidebar took a third of the width on a 900-pixel screen.
//
// None of that is exotic. It is what happens when nobody resizes the window.

const GROESSEN = [
  { name: '4K',        w: 3840, h: 2160 },
  { name: 'WQHD',      w: 2560, h: 1440 },
  { name: 'FHD hoch',  w: 1920, h: 1200 },
  { name: 'FHD Fenster', w: 1920, h: 1026 },
  { name: 'Laptop',    w: 1440, h: 900 },
  { name: 'klein',     w: 900,  h: 800 },
  { name: 'Tablet',    w: 768,  h: 1024 },
  { name: 'schmal',    w: 600,  h: 900 },
];

/** Longest line of running text, counted in characters actually rendered. */
async function zeichenProZeile(page) {
  return page.evaluate(() => {
    let laengste = 0;
    for (const el of document.querySelectorAll('#view p, #view li, #view .q-prompt')) {
      const txt = (el.innerText || '').trim();
      if (txt.length < 60) continue;
      const cs = getComputedStyle(el);
      const zh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.4;
      const zeilen = Math.max(1, Math.round(el.getBoundingClientRect().height / zh));
      laengste = Math.max(laengste, Math.round(txt.length / zeilen));
    }
    return laengste;
  });
}

test.describe('window sizes', () => {
  // Screenshots at 3840×2160 are slow to encode, and there are two per size.
  test.describe.configure({ timeout: 90_000 });

  for (const g of GROESSEN) {
    test(`${g.name} (${g.w}×${g.h}) — layout holds`, async ({ page, zustand }) => {
      await page.setViewportSize({ width: g.w, height: g.h });
      await zustand('mittenInPhase3');
      await page.goto('/#/einheit/p1-e01-ki-system-rollen', { waitUntil: 'load' });
      await schliesseOverlays(page);
      await warteAufAnsicht(page);
      await page.waitForTimeout(300);

      const m = await page.evaluate(() => {
        const shell = document.querySelector('.app-shell');
        const rail = document.querySelector('.rail');
        const doc = document.documentElement;
        return {
          shellHoehe: Math.round(shell?.getBoundingClientRect().height ?? 0),
          fensterHoehe: window.innerHeight,
          querlauf: doc.scrollWidth - doc.clientWidth,
          railBreite: Math.round(rail?.getBoundingClientRect().width ?? 0),
          railSichtbar: rail ? getComputedStyle(rail).display !== 'none' : false,
          inhaltBreite: Math.round(document.getElementById('view')?.getBoundingClientRect().width ?? 0),
        };
      });

      // The shell uses the window. A fixed cap wastes the screen; 40 pixels of
      // slack covers the deliberate margin around the rounded frame.
      expect(m.fensterHoehe, `${g.name}: viewport height is ${m.fensterHoehe}`).toBe(g.h);
      expect(m.shellHoehe, `${g.name}: shell is ${m.shellHoehe} of ${g.h} px`)
        .toBeGreaterThan(g.h - 40);

      // Nothing sticks out sideways. A horizontal scrollbar on a layout that was
      // meant to fit is always a defect.
      expect(m.querlauf, `${g.name}: page scrolls sideways by ${m.querlauf} px`).toBeLessThanOrEqual(2);

      // Navigation survives every size. Losing it strands the user.
      expect(m.railSichtbar, `${g.name}: navigation rail is gone`).toBe(true);
      expect(m.railBreite).toBeGreaterThan(40);

      // Reading measure. 45–75 is comfortable; 80 is the line where it stops
      // being a matter of taste.
      // Keep the frame: numbers say the layout holds, a picture says whether it
      // also looks right. The sheet builder assembles these for review.
      await page.screenshot({ path: `test-results/groessen/${g.w}x${g.h}-einheit.png` });
      await page.goto('/#/dashboard', { waitUntil: 'load' });
      await schliesseOverlays(page);
      await warteAufAnsicht(page);
      await page.waitForTimeout(300);
      await page.screenshot({ path: `test-results/groessen/${g.w}x${g.h}-dashboard.png` });
      await page.goto('/#/einheit/p1-e01-ki-system-rollen', { waitUntil: 'load' });
      await schliesseOverlays(page);
      await warteAufAnsicht(page);

      const zeichen = await zeichenProZeile(page);
      // A measurement of zero means nothing was measured — which would make the
      // assertion below pass without checking anything.
      expect(zeichen, `${g.name}: no running text found to measure`).toBeGreaterThan(20);
      expect(zeichen, `${g.name}: ${zeichen} characters per line`).toBeLessThanOrEqual(80);
      console.log(`  ${g.name}: ${zeichen} Zeichen/Zeile, Hülle ${m.shellHoehe}/${g.h} px, Rail ${m.railBreite} px`);
    });
  }

  test('no card is shorter than what it contains', async ({ page, zustand }) => {
    // The failure this missed twice: a card 34 pixels tall around 107 pixels of
    // content, clipped, with its heading spilling outside its own frame. Visible
    // at a glance in a screenshot, invisible to every other check here.
    for (const g of [{ width: 900, height: 800 }, { width: 768, height: 1024 }, { width: 600, height: 900 }, { width: 1920, height: 1026 }]) {
      await page.setViewportSize(g);
      await zustand('mittenInPhase3');
      await page.goto('/#/dashboard', { waitUntil: 'load' });
      await schliesseOverlays(page);
      await warteAufAnsicht(page);
      await page.waitForTimeout(250);

      const beschnitten = await page.evaluate(() => {
        const raus = [];
        for (const k of document.querySelectorAll('.card')) {
          const cs = getComputedStyle(k);
          if (cs.overflowY === 'auto' || cs.overflowY === 'scroll') continue;   // scrolling is a choice
          const sichtbar = k.getBoundingClientRect().height;
          if (k.scrollHeight > sichtbar + 8) {
            raus.push(`${(k.innerText || '').split('\n')[0].slice(0, 24)}: ${Math.round(sichtbar)} px for ${k.scrollHeight} px`);
          }
        }
        return raus;
      });
      expect(beschnitten, `${g.width}×${g.height}: cards cut off — ${beschnitten.join(' · ')}`).toEqual([]);
    }
  });

  test('the reading-measure check can actually fail', async ({ page, zustand }) => {
    // Negative control. A green check that has never been seen to fail proves
    // nothing — and this one nearly slipped through: an earlier version measured
    // a single stray paragraph and would have passed on any layout.
    await page.setViewportSize({ width: 3840, height: 2160 });
    await zustand('mittenInPhase3');
    await page.goto('/#/einheit/p1-e01-ki-system-rollen', { waitUntil: 'load' });
    await schliesseOverlays(page);
    await warteAufAnsicht(page);

    const vorher = await zeichenProZeile(page);
    expect(vorher, 'nothing measurable on screen').toBeGreaterThan(20);
    expect(vorher).toBeLessThanOrEqual(80);

    // Remove every width limit and let the text run the full width.
    await page.addStyleTag({ content: `
      #view, #view * { max-width: none !important; }
      .dashboard.single .card { margin: 0 !important; }
    ` });
    await page.waitForTimeout(200);
    const nachher = await zeichenProZeile(page);

    expect(nachher, `without limits the line is ${nachher} characters — the check would not notice`)
      .toBeGreaterThan(80);
  });

  test('the dashboard stacks instead of shrinking into slivers', async ({ page, zustand }) => {
    await page.setViewportSize({ width: 900, height: 800 });
    await zustand('mittenInPhase3');
    await page.goto('/#/dashboard', { waitUntil: 'load' });
    await schliesseOverlays(page);
    await warteAufAnsicht(page);

    const spalten = await page.evaluate(() =>
      getComputedStyle(document.querySelector('.dash-grid')).gridTemplateColumns.split(' ').length);
    expect(spalten, 'the dashboard keeps two columns on a 900 px screen').toBe(1);

    // Everything still reachable, just below one another.
    const karten = await page.locator('.dash-grid .card').count();
    expect(karten, 'cards disappeared when stacking').toBeGreaterThan(3);
  });

  test('a short window scrolls rather than hiding content', async ({ page, zustand }) => {
    await page.setViewportSize({ width: 1280, height: 480 });
    await zustand('mittenInPhase3');
    await page.goto('/#/einheit/p1-e01-ki-system-rollen', { waitUntil: 'load' });
    await schliesseOverlays(page);
    await warteAufAnsicht(page);

    const m = await page.evaluate(() => ({
      scrollbar: document.documentElement.scrollHeight > document.documentElement.clientHeight,
      innererScroll: (() => {
        const el = document.querySelector('main');
        return el ? el.scrollHeight > el.clientHeight : false;
      })(),
    }));
    expect(m.scrollbar || m.innererScroll, 'content is cut off with no way to scroll to it').toBe(true);
  });
});
