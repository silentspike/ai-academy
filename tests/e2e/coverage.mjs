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

// Deliberately NOT under test-results/: Playwright wipes that directory when a
// run starts, so a single-spec run would erase what previous specs recorded and
// the evaluation would report an empty inventory as a pass. globalSetup clears
// this file instead, once per run.
const DATEI = '.tmp-coverage/clicks.json';

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
 * Records every operable element of the current view, and checks each one for
 * reachability on the way.
 *
 * Not everything visible can be clicked in a test run, and that is not a defect:
 * the four options of a question are mutually exclusive, so choosing one
 * disables the rest. Treating those as gaps would be misleading, and counting
 * them as operated would be a lie. They are checked for the thing that actually
 * matters — is something lying on top of them — and reported separately.
 */
export async function erfasse(page, route) {
  const elemente = await page.locator(INTERAKTIV).all();
  const gefunden = [], geprueft = [], unerreichbar = [];
  for (const el of elemente) {
    if (!await el.isVisible().catch(() => false)) continue;
    const id = await kennung(el);
    gefunden.push(id);
    const r = await erreichbarkeit(page, el);
    if (r.ok) geprueft.push(id);
    else if (r.grund !== 'outside the viewport') unerreichbar.push(`${id} — ${r.grund}`);
  }
  merke(route, { gefunden, geprueft, unerreichbar });
  return gefunden;
}

/** Is anything lying on top of this control? Scrolls it into view first. */
async function erreichbarkeit(page, el) {
  await el.evaluate(n => n.scrollIntoView({ block: 'center', inline: 'center' })).catch(() => {});
  return el.evaluate(n => {
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
  }).catch(() => ({ ok: false, grund: 'element vanished' }));
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

  // A real user scrolls to the control before clicking it, and keeps scrolling
  // until it is comfortably in view. Centring matters: with scrollIntoViewIfNeeded
  // a control can sit just under a sticky header and be reported as covered —
  // which says something about the scroll position, not about an overlay. The
  // question here is whether something lies ON TOP of a control the user can see.
  await el.evaluate(n => n.scrollIntoView({ block: 'center', inline: 'center' }));
  await page.waitForTimeout(80);

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
  mkdirSync('.tmp-coverage', { recursive: true });
  let daten = {};
  if (existsSync(DATEI)) {
    try { daten = JSON.parse(readFileSync(DATEI, 'utf8')); } catch { daten = {}; }
  }
  const r = daten[route] ??= { gefunden: [], betaetigt: [], geprueft: [], unerreichbar: [] };
  for (const schluessel of ['gefunden', 'betaetigt', 'geprueft', 'unerreichbar']) {
    if (teil[schluessel]) r[schluessel] = [...new Set([...r[schluessel], ...teil[schluessel]])];
  }
  writeFileSync(DATEI, JSON.stringify(daten, null, 1));
}

/** Routes that exist only to prove the reachability probe works. */
const NICHT_WERTEN = new Set(['#/negativtest']);

/**
 * Evaluation for the final spec.
 *
 * Aggregated by control, not by route: the sidebar is the same sidebar on every
 * view, and counting it once per route would inflate the total forty-fold while
 * saying nothing more. What matters is whether each distinct control was ever
 * operated — and where it lives, for the report.
 */
export function auswertung() {
  const leer = { routen: 0, gefunden: 0, betaetigt: 0, offen: [], unerreichbar: [] };
  if (!existsSync(DATEI)) return leer;
  const daten = JSON.parse(readFileSync(DATEI, 'utf8'));

  const wo = new Map();            // control → first route it was seen on
  const jeBetaetigt = new Set(), jeGeprueft = new Set();
  const unerreichbar = [];
  for (const [route, r] of Object.entries(daten)) {
    if (NICHT_WERTEN.has(route)) continue;
    for (const g of r.gefunden) if (!wo.has(g)) wo.set(g, route);
    for (const b of r.betaetigt) jeBetaetigt.add(b);
    for (const g of r.geprueft ?? []) jeGeprueft.add(g);
    for (const u of r.unerreichbar) unerreichbar.push(`${route}  ${u}`);
  }
  const offen = [...wo.entries()]
    .filter(([g]) => !jeBetaetigt.has(g) && !jeGeprueft.has(g))
    .map(([g, r]) => `${r}  ${g}`);
  const nurGeprueft = [...wo.entries()]
    .filter(([g]) => !jeBetaetigt.has(g) && jeGeprueft.has(g))
    .map(([g, r]) => `${r}  ${g}`);
  return {
    routen: Object.keys(daten).filter(r => !NICHT_WERTEN.has(r)).length,
    gefunden: wo.size,
    betaetigt: [...jeBetaetigt].filter(b => wo.has(b)).length,
    nurGeprueft, offen, unerreichbar,
  };
}
