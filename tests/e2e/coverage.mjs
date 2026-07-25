// Click coverage.
//
// The suite does not check against a list of cases. It enumerates the operable
// elements of every view itself and fails when one was never exercised. The
// reason is concrete: an earlier acceptance run missed eleven gaps because the
// checklist did not mention them. A list only ever verifies what someone thought
// to write down; an inventory verifies what is actually there.
//
// Every click also asserts reachability. A component can work perfectly and still
// be impossible to click because something overlaps it — that class of defect has
// occurred twice in this project and no unit test can see it.

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';

const DATEI = 'test-results/coverage.json';

/** Selectors for anything a user can operate. */
export const INTERAKTIV = [
  'button:not([disabled])',
  'a[href]',
  'input:not([type=hidden])',
  'select',
  'textarea',
  '[role="button"]',
  '[draggable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

/** Stable identity for an element, so the same control is recognised across runs. */
export async function kennung(el) {
  return el.evaluate(n => {
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
  });
}

/**
 * Records every operable element of the current view.
 * Call after each navigation; identical elements are merged.
 */
export async function erfasse(page, route) {
  const elemente = await page.locator(INTERAKTIV).all();
  const gefunden = [];
  for (const el of elemente) {
    if (!await el.isVisible().catch(() => false)) continue;
    gefunden.push(await kennung(el));
  }
  merke(route, { gefunden });
  return gefunden;
}

/**
 * Clicks an element for real and asserts it is reachable.
 *
 * `elementFromPoint` at the centre of the element must return the element itself
 * or one of its descendants. If it returns something else, an overlay sits on top
 * — the control looks fine, works fine in isolation, and cannot be used.
 */
export async function klicke(page, locator, route, { erwarteNavigation = false } = {}) {
  const el = locator.first();
  await el.waitFor({ state: 'visible', timeout: 5000 });
  const id = await kennung(el);

  // A real user scrolls to the control before clicking it. Without this the
  // reachability probe below would report every control below the fold as
  // unreachable — which says nothing about overlays, only about scroll position.
  await el.scrollIntoViewIfNeeded();

  const erreichbar = await el.evaluate(n => {
    const r = n.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return { ok: false, grund: 'zero size' };
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) return { ok: false, grund: 'outside the viewport' };
    const oben = document.elementFromPoint(x, y);
    if (!oben) return { ok: false, grund: 'nothing at the click point' };
    if (oben !== n && !n.contains(oben) && !oben.contains(n)) {
      return { ok: false, grund: 'covered by ' + oben.tagName.toLowerCase() +
        (oben.className && typeof oben.className === 'string' ? '.' + oben.className.split(/\s+/)[0] : '') };
    }
    return { ok: true };
  });

  if (!erreichbar.ok) {
    merke(route, { unerreichbar: [`${id} — ${erreichbar.grund}`] });
    throw new Error(`Element is not clickable: ${id} — ${erreichbar.grund}`);
  }

  if (erwarteNavigation) await Promise.all([page.waitForLoadState('networkidle'), el.click()]);
  else await el.click();

  merke(route, { betaetigt: [id] });
  return id;
}

/** Merges into the coverage file; workers run in parallel, so read-modify-write each time. */
function merke(route, teil) {
  mkdirSync('test-results', { recursive: true });
  let daten = {};
  if (existsSync(DATEI)) {
    try { daten = JSON.parse(readFileSync(DATEI, 'utf8')); } catch { daten = {}; }
  }
  const r = daten[route] ??= { gefunden: [], betaetigt: [], unerreichbar: [] };
  for (const schluessel of ['gefunden', 'betaetigt', 'unerreichbar']) {
    if (teil[schluessel]) r[schluessel] = [...new Set([...r[schluessel], ...teil[schluessel]])];
  }
  writeFileSync(DATEI, JSON.stringify(daten, null, 1));
}

/** Evaluation for the final spec. */
export function auswertung() {
  if (!existsSync(DATEI)) return { routen: 0, gefunden: 0, betaetigt: 0, offen: [], unerreichbar: [] };
  const daten = JSON.parse(readFileSync(DATEI, 'utf8'));
  let gefunden = 0, betaetigt = 0;
  const offen = [], unerreichbar = [];
  for (const [route, r] of Object.entries(daten)) {
    gefunden += r.gefunden.length;
    betaetigt += r.betaetigt.length;
    for (const g of r.gefunden) if (!r.betaetigt.includes(g)) offen.push(`${route}  ${g}`);
    for (const u of r.unerreichbar) unerreichbar.push(`${route}  ${u}`);
  }
  return { routen: Object.keys(daten).length, gefunden, betaetigt, offen, unerreichbar };
}
