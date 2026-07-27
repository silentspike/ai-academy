import { test, expect, einheiten, phasen, schliesseOverlays, warteAufAnsicht } from '../harness.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';

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
      const konsolenfehler = [];
      page.on('console', m => { if (m.type() === 'error') konsolenfehler.push(m.text().slice(0, 120)); });
      page.on('pageerror', e => konsolenfehler.push('pageerror: ' + e.message.slice(0, 120)));
      await zustand(fixture);
      await page.goto('/' + route, { waitUntil: 'load' });
      await schliesseOverlays(page);
      await warteAufAnsicht(page).catch(() => { /* an empty view is worth seeing too */ });
      await page.waitForTimeout(400);

      // Layout faults, measured where they are visible: in the browser. A picture
      // cannot tell you that a heading is truncated or that a container scrolls
      // sideways — the DOM can.
      const befund = await page.evaluate(() => {
        const doc = document.documentElement;
        const quer = [];
        for (const n of document.querySelectorAll('#view *, .sidebar, .topbar')) {
          if (n.scrollWidth > n.clientWidth + 2 && getComputedStyle(n).overflowX !== 'auto'
              && getComputedStyle(n).overflowX !== 'scroll') {
            quer.push(`${n.tagName.toLowerCase()}.${String(n.className).split(/\s+/)[0]} +${n.scrollWidth - n.clientWidth}px`);
          }
        }
        const gekuerzt = [];
        for (const n of document.querySelectorAll('#view *')) {
          if (!n.children.length && n.scrollWidth > n.clientWidth + 2
              && getComputedStyle(n).textOverflow === 'ellipsis') {
            gekuerzt.push((n.innerText || '').slice(0, 40));
          }
        }
        const leer = [...document.querySelectorAll('#view button, #view a[href]')]
          .filter(n => n.offsetParent !== null && (n.getBoundingClientRect().width === 0 || n.getBoundingClientRect().height === 0))
          .map(n => (n.innerText || n.getAttribute('aria-label') || '?').slice(0, 30));
        // Contrast, per WCAG 1.4.3. A dark theme makes it easy to end up with
        // text that looks fine to the person who chose the colour and is hard
        // work for everyone else — and this is a product people read for hours.
        const relLum = (r, g, b) => {
          const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
          return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
        };
        const parse = (farbe) => {
          const m = /rgba?\(([^)]+)\)/.exec(farbe);
          if (!m) return null;
          const [r, g, b, a] = m[1].split(',').map(Number);
          return { r, g, b, a: a === undefined ? 1 : a };
        };
        // Returns null when the nearest painted background is a gradient: the
        // ratio cannot be determined from a single colour then, and reporting it
        // anyway produced 1.3:1 for the primary buttons — dark text on a green
        // gradient, which reads perfectly well. A measurement that cannot be made
        // is not a finding.
        const hintergrundVon = (n) => {
          for (let e = n; e && e !== document.documentElement; e = e.parentElement) {
            const cs = getComputedStyle(e);
            if (cs.backgroundImage && cs.backgroundImage !== 'none') return null;
            const c = parse(cs.backgroundColor);
            if (c && c.a > 0.5) return c;
          }
          return { r: 10, g: 14, b: 23, a: 1 };            // page background
        };
        const schwach = [];
        for (const n of document.querySelectorAll('#view *')) {
          if (n.children.length) continue;
          const text = (n.innerText || '').trim();
          if (text.length < 4) continue;
          const cs = getComputedStyle(n);
          if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) < 0.1) continue;
          const vg = parse(cs.color);
          if (!vg) continue;
          const hg = hintergrundVon(n);
          if (!hg) continue;                               // gradient — not measurable
          const l1 = relLum(vg.r, vg.g, vg.b), l2 = relLum(hg.r, hg.g, hg.b);
          const verhaeltnis = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
          // 3:1 for large text (18.66px bold or 24px), 4.5:1 otherwise.
          const px = parseFloat(cs.fontSize);
          const gross = px >= 24 || (px >= 18.66 && Number(cs.fontWeight) >= 700);
          const grenze = gross ? 3 : 4.5;
          if (verhaeltnis < grenze) {
            schwach.push(`${text.slice(0, 30)} — ${verhaeltnis.toFixed(1)}:1 (min ${grenze})`);
          }
        }

        // Placeholders that reached the screen. NaN, undefined and [object Object]
        // are what a missing field looks like to a reader, and no amount of
        // looking at colours finds them — this caught "Kapiteltest bestanden
        // (NaN %)" on the learning overview.
        const sichtbar = document.getElementById('view')?.innerText ?? '';
        const platzhalter = [...new Set(sichtbar.match(/\b(NaN|undefined|null)\b|\[object [A-Za-z]+\]/g) ?? [])];

        return {
          platzhalter,
          schwacherKontrast: schwach.slice(0, 10),
          seiteQuerScroll: doc.scrollWidth > doc.clientWidth + 2,
          querlaufende: quer.slice(0, 8),
          gekuerzteTexte: gekuerzt.slice(0, 8),
          nullflaechen: leer.slice(0, 8),
          textLaenge: (document.getElementById('view')?.innerText ?? '').length,
        };
      });
      if (konsolenfehler.length) befund.konsolenfehler = konsolenfehler.slice(0, 5);

      mkdirSync('test-results/ansichten', { recursive: true });
      writeFileSync(`test-results/ansichten/${name}.json`, JSON.stringify({ fixture, route, ...befund }, null, 1));

      // Lossless, full size: the sheet builder derives its own smaller copies.
      await page.screenshot({ path: `test-results/ansichten/${name}.png`, fullPage: false });
    });
  }
});

// The self-check is a page of its own, outside the router — and therefore
// outside the view record until now. It carried its own set of colour tokens and
// a different typeface for months because nobody ever looked at it.
test('screenshot selfcheck.html', async ({ page, zustand }) => {
  await zustand('mittenInPhase3');
  await page.goto('/selfcheck.html', { waitUntil: 'load' });
  await page.waitForTimeout(700);                       // Self-Check läuft asynchron
  const tokens = await page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    return {
      bg: cs.getPropertyValue('--bg').trim(),
      emerald: cs.getPropertyValue('--emerald').trim(),
      schrift: getComputedStyle(document.body).fontFamily,
    };
  });
  // Same product, same tokens: a second design system on a second page is the
  // fault this assertion exists to prevent coming back.
  expect(tokens.bg).toBe('#070a10');
  expect(tokens.emerald).toBe('#65d8b2');
  expect(tokens.schrift).toContain('Inter');

  // The page has to reach the bridge. Token injection used to happen for
  // index.html only, so every check here answered 403 and the traffic light —
  // the one that clears the first learning session — was permanently red with
  // the single word "token" as its explanation.
  const befund = await page.evaluate(() => ({
    text: document.body.innerText,
    ampel: document.getElementById('ampel')?.className ?? '',
  }));
  expect(befund.text, 'the self-check reports a raw error code instead of a sentence').not.toMatch(/^\s*token\s*$/m);
  expect(befund.text, 'the self-check cannot authenticate against the bridge').not.toMatch(/Pairing-Token/);
  expect(befund.ampel, 'the self-check goes red on a bridge that answers').not.toMatch(/fail|blocked/);
  mkdirSync('test-results/ansichten', { recursive: true });
  await page.screenshot({ path: 'test-results/ansichten/selfcheck.png', fullPage: false });
});

// Negative control for the layout heuristics: an artificial overflow has to be
// reported. A check nobody has seen fail is a check nobody can trust.
test.describe('layout heuristics', () => {
  test('an artificial overflow is detected', async ({ page, zustand }) => {
    await zustand('mittenInPhase3');
    await page.goto('/#/dashboard', { waitUntil: 'load' });
    await schliesseOverlays(page);
    await warteAufAnsicht(page);

    const messen = () => page.evaluate(() => {
      const quer = [];
      for (const n of document.querySelectorAll('#view *')) {
        const cs = getComputedStyle(n);
        if (n.scrollWidth > n.clientWidth + 2 && cs.overflowX !== 'auto' && cs.overflowX !== 'scroll') {
          quer.push(`${n.tagName.toLowerCase()}.${String(n.className).split(/\s+/)[0]}`);
        }
      }
      return quer;
    });

    const vorher = await messen();
    await page.evaluate(() => {
      const wirt = document.querySelector('#view .card');
      const d = document.createElement('div');
      d.id = 'e2e-overflow';
      d.style.cssText = 'width:4000px;height:20px;background:transparent';
      wirt.appendChild(d);
    });
    const nachher = await messen();

    expect(nachher.length, 'the injected overflow was not detected')
      .toBeGreaterThan(vorher.length);
    await page.evaluate(() => document.getElementById('e2e-overflow')?.remove());
  });
});
