// app/app.js — SPA-Kern (Plan §6.2, #42, §6.3 Erstkontakt):
// Hash router, central state via the storage adapter, the opening choreography (about 1.5 s, skippable),
// the status bar (points, level, weekly goal, target date, legal baseline) and the phase tree.

import { StorageAdapter } from './storage-adapter.js';
import { loadGlossary, decorate, beobachte, attachTooltip } from './glossary.js';

export const LEGAL_STATE = 'Rechtsstand 27.7.2026';

import { routes, route } from './router.js';
export { route };   // Bestands-Kompatibilität

export function navigate(hash) { location.hash = hash; }

export async function startApp({ mountId = 'view' } = {}) {
  // Backend-Wahl wie Self-Check: Bridge-Store wenn erreichbar, sonst localStorage (Share-Fallback)
  let storage = StorageAdapter.bridgeStore({});
  try { await storage.get('state'); } catch { storage = StorageAdapter.localStorage(); }
  const state = await loadState(storage);
  // Serialised saving: saveState is called from many places (routes, ritual, rewards),
  // sometimes concurrently. Parallel writes could overtake or abort each other, and a
  // save was then lost silently.
  let saveChain = Promise.resolve();
  let savePending = false;
  const ctx = { storage, state, saveState: () => {
    paintTopbar(state);
    paintSidebar(state);
    if (savePending) return saveChain;                 // laufender Save deckt den neuen Stand mit ab
    savePending = true;
    saveChain = saveChain
      .catch(() => {})
      .then(() => { savePending = false; return storage.set('state', state); })
      .catch(async e => {                              // ein Retry, dann sichtbar scheitern
        console.warn('saveState-Retry nach Fehler:', e?.message);
        return storage.set('state', state);
      });
    return saveChain;
  } };

  attachTooltip(document);
  try {
    const gl = await fetch('content/glossary.json').then(r => r.ok ? r.json() : []);
    if (gl.length) loadGlossary(gl);
  } catch { /* Glossar kommt mit dem Content (Task 8) */ }

  // Profile resolution: 1. a curated local profile via the bridge (data/profiles/,
  // gitignored) · 2. a profile created by the wizard and held in state · 3. the wizard.
  if (!ctx.profile) {
    try {
      const { apiPrefix } = await import('./llm-adapter.js');
      const r = await fetch(apiPrefix() + 'profile', { headers: { 'X-Bridge-Token': window.BRIDGE_TOKEN } });
      if (r.ok) ctx.profile = await r.json();
    } catch { /* Share-Betrieb ohne Kurator-Profil */ }
    if (!ctx.profile && state.profile) ctx.profile = state.profile;
    if (!ctx.profile && !location.hash.startsWith('#/onboarding')) location.hash = '#/onboarding';
    // Roll the profile out into the learning state; otherwise curve, status bar and
    // final title stayed empty even though the curated profile had loaded.
    if (ctx.profile) {
      const lp = ctx.profile.lernprofil ?? {};
      const ziele = lp.zieltermine ?? lp.milestones ?? [];
      if (!state.milestones?.length && ziele.length) {
        state.milestones = ziele.map((z, i) => ({ label: z.label ?? (i === 0 ? 'Kernphasen' : 'Alles'), date: z.date ?? z }));
      }
      if (ctx.profile.level_endtitel) state.levelEndtitel = ctx.profile.level_endtitel;
      if (lp.minutesPerDay) state.pace = { minutesPerDay: lp.minutesPerDay, daysPerWeek: lp.daysPerWeek ?? 5 };
      ctx.saveState();
    }
  }

  // Erstkontakt-Hero (§6.3): allererster Start → Artwork + Produktversprechen
  const { heroOnce } = await import('./rewards.js');
  if (heroOnce(state, document)) { await ctx.saveState(); }

  await zeigeKiHinweis(state, ctx);

  await introSequence(state);

  const render = () => {
    // Without a profile every route is the wizard. The startup-only check let a
    // single click strand the user in an empty dashboard.
    if (setzeSetupModus(ctx) && !location.hash.startsWith('#/onboarding')) {
      location.hash = '#/onboarding';
      return;
    }
    const [path, ...args] = (location.hash.replace(/^#\/?/, '') || 'dashboard').split('/');
    const view = document.getElementById(mountId);
    // Explicit check: the route comes from the address bar, and the value out of
    // the map is called straight away. The map only ever holds what we register,
    // but relying on that is exactly the assumption an analyser cannot verify —
    // and neither can a reader.
    const kandidat = routes.get(path) ?? routes.get('dashboard');
    const fn = typeof kandidat === 'function' ? kandidat : null;
    view.classList.remove('dash-grid');      // Routen setzen ihr Layout selbst
    view.innerHTML = '';
    view.classList.remove('reveal');
    void view.offsetWidth;                 // Reveal-Animation neu triggern
    view.classList.add('reveal');
    fn?.(view, ctx, args);
    decorate(view);       // synchronous routes are marked up immediately …
    markActiveNav(path);
  };
  // … everything a route adds later is picked up by the observer.
  beobachte(document.getElementById(mountId));
  window.addEventListener('hashchange', render);
  render();
  paintTopbar(state);
  paintSidebar(state);
  // Search, due list and profile menu. Wired once — the menus read live data
  // when they open, so they cannot show a value captured at startup.
  import('./topbar-tools.js').then(({ verdrahteTopbar }) => verdrahteTopbar(ctx))
    .catch(e => console.warn('Topbar-Werkzeuge nicht geladen:', e.message));
  return ctx;
}

/**
 * Version of the transparency notice. Raise it whenever what the notice SAYS
 * stops being true — a different model class, another grading procedure, a
 * changed data flow. Not for wording touch-ups.
 */
export const KI_HINWEIS_VERSION = 2;

/**
 * Article 50 transparency, applied to our own product: shown once, BEFORE the
 * first tutor interaction (§5.0).
 *
 * Acknowledgement is stored with the version it was given for. It used to store
 * only a timestamp, so a notice whose content had since changed counted as
 * acknowledged forever — the one case where showing it again is the entire
 * point.
 */
export async function zeigeKiHinweis(state, ctx, doc = document) {
  const bestaetigt = typeof state.aiNoticeAck === 'object' ? (state.aiNoticeAck?.version ?? 0)
    : (state.aiNoticeAck ? 1 : 0);          // Altstände: Zeitstempel = Fassung 1
  if (bestaetigt >= KI_HINWEIS_VERSION) return false;
  const erneut = bestaetigt > 0;

  const ov = doc.createElement('div');
  ov.className = 'ai-notice-overlay';
  ov.innerHTML = `<div class="card ai-notice">
    <div class="ain-kopf">
      <span class="ain-marke">Art. 50 · Transparenz</span>
      <h2>Hier antwortet eine Maschine</h2>
      <p class="ain-unter">Was das heißt, bevor du loslegst${erneut ? ' — und was sich seither geändert hat' : ''}.</p>
    </div>
    ${erneut ? '<p class="ain-neu">Dieser Hinweis hat sich geändert, seit du ihn zuletzt bestätigt hast.</p>' : ''}
    <dl class="ain-liste">
      <dt>Wer antwortet</dt>
      <dd>Ein <b>KI-System</b>, verbunden über deine lokale Bridge. Welches Modell gerade
          bewertet, steht in der Selbstprüfung und an jeder einzelnen Bewertung.</dd>
      <dt>Was übertragen wird</dt>
      <dd>Deine Freitexte gehen an den Anbieter des Modells. Gib dort <b>keine echten
          Personendaten und keine Organisations-Interna</b> ein.</dd>
      <dt>Wie verlässlich Noten sind</dt>
      <dd>Maschinelle Bewertungen streuen. Jede trägt deshalb ihr Label —
          <i>deterministisch</i> oder <i>KI-unterstützt</i> — und gegen jede kannst du
          Einspruch erheben; darüber entscheidet eine frische Zweitprüfung, die die
          erste Bewertung nicht kennt.</dd>
      <dt>Wofür das hier gedacht ist</dt>
      <dd>Persönliche, freiwillige Weiterbildung — <b>nicht für den Einsatz durch
          Bildungseinrichtungen oder Arbeitgeber</b>, um Personen zu bewerten. Kein
          akkreditierter Abschluss.</dd>
    </dl>
    <div class="ain-fuss">
      <button class="btn-primary">Verstanden</button>
    </div>
  </div>`;
  doc.body.appendChild(ov);
  return new Promise(res => {
    ov.querySelector('button').onclick = async () => {
      state.aiNoticeAck = { version: KI_HINWEIS_VERSION, at: Date.now() };
      await ctx.saveState();
      ov.remove();
      res(true);
    };
  });
}

/** Every field the application relies on, with a safe starting value. */
function leererZustand() {
  return {
    xp: 0, level: 1, week: { goalDays: 5 },
    milestones: [], cards: [], events: [], phase_progress: {},
    unit_done: [], unit_skipped: [], chapterTests: {}, examAttempts: [], dayStats: {}, notes: {},
    created: Date.now(),
  };
}

/**
 * Loads the learning state and fills in whatever is missing.
 *
 * Defaults used to apply only when no state existed at all. Any incomplete state
 * — an import from an older version, a partially written record — then reached
 * the views with fields missing, and the first access to one of them took the
 * whole route down with it. A learning tool must not lose a day's work to a
 * missing key.
 */
async function loadState(storage) {
  const gespeichert = await storage.get('state');
  const basis = leererZustand();
  if (!gespeichert || typeof gespeichert !== 'object') return basis;

  const s = { ...basis, ...gespeichert };
  // The weekly goal is a nested object; a shallow merge would keep an incomplete one.
  s.week = { ...basis.week, ...(gespeichert.week ?? {}) };
  // Older states carried a units_done key that nothing ever wrote to. The list
  // the application actually keeps is unit_done — so the normalisation below was
  // guarding a field no view reads, while a damaged unit_done went through
  // untouched and took the sidebar down on the next paint.
  if (Array.isArray(gespeichert.units_done) && !Array.isArray(gespeichert.unit_done)) {
    s.unit_done = gespeichert.units_done;
  }
  delete s.units_done;
  for (const feld of ['milestones', 'cards', 'events', 'unit_done', 'unit_skipped', 'examAttempts']) {
    if (!Array.isArray(s[feld])) s[feld] = [];
  }
  for (const feld of ['phase_progress', 'chapterTests', 'dayStats', 'notes']) {
    if (!s[feld] || typeof s[feld] !== 'object') s[feld] = {};
  }
  // Award what the record already earned — once, here, before anything renders.
  // Six of the badges are derived from data rather than counted as they happen,
  // so a restored record, an import, or work done before the derivation existed
  // would otherwise show grey tiles for work that was done. Doing it while
  // drawing the gallery instead put a write inside a render.
  const { newBadges } = await import('./gamification.js');
  s.badges = s.badges ?? [];
  if (newBadges(s).length) await storage.set('state', s);
  return s;
}

/**
 * Sidebar: phase tree with progress rings, a review badge counting core and catch-up,
 * and an exam lock bound to the gate rather than hard-coded.
 */
const PHASEN = [
  ['p1', 'Fundament'], ['p2', 'Verbote'], ['p3', 'Einstufung'], ['p4', 'Pflichten'], ['p5', 'Transparenz'],
  ['p6', 'GPAI'], ['p7', 'Aufsicht'], ['p8', 'Randwissen'], ['p9', 'Ländermodul AT'], ['p10', 'Auslegung'],
];
let UNIT_INDEX = null;                       // phase → [unitId] (einmalig geladen)


export async function paintSidebar(state) {
  const tree = document.getElementById('phase-tree');
  if (!tree) return;
  if (!UNIT_INDEX) {
    UNIT_INDEX = {};
    const idx = await fetch('content/units/index.json').then(r => r.ok ? r.json() : null).catch(() => null);
    for (const u of idx?.units ?? []) (UNIT_INDEX[u.phase] ??= []).push(u);
  }
  const done = new Set(state.unit_done ?? []);
  const skipped = new Set(state.unit_skipped ?? []);
  // The phase currently being worked on: the first that is not finished. Without
  // it the tree is ten equal rows and says nothing about where the user stands.
  // The chapter test is what closes a phase (#12). Marking a phase active because
  // a single unit inside it is still open would put the arrow next to a phase
  // that already carries a tick — two contradictory signals on one row.
  const aktivePhase = PHASEN.find(([pid]) => !state.chapterTests?.[pid]?.passed)?.[0] ?? null;

  tree.innerHTML = PHASEN.map(([pid, label], i) => {
    const units = UNIT_INDEX[pid] ?? [];
    const fertig = units.filter(u => done.has(u.id) || skipped.has(u.id)).length;
    const pct = units.length ? fertig / units.length : 0;
    const test = state.chapterTests?.[pid];
    const deg = Math.round(pct * 360);
    const aktiv = pid === aktivePhase;
    return `<a class="ph phase${test?.passed ? ' phase-passed' : ''}${aktiv ? ' phase-aktiv' : ''}" href="#/lernen/${pid}" title="${units.length} Einheiten · ${fertig} erledigt${test?.passed ? ' · Kapiteltest bestanden' : ''}">
      <span class="pring" style="background:conic-gradient(var(--emerald,#34d399) ${deg}deg, rgba(255,255,255,.08) 0)"><i>${pid.slice(1)}</i></span>
      <span class="lbl"><span class="ph-name">Phase ${i + 1} · ${label}</span>
        <span class="ph-bar"><i style="width:${Math.round(pct * 100)}%"></i></span></span>
      ${test?.passed ? '<span class="pcheck">✓</span>' : aktiv ? '<span class="pcheck ph-pfeil">›</span>' : ''}</a>`;
  }).join('');

  const q = splitQueues(state.cards ?? [], Date.now());
  const aufholToday = planAufhol(q.aufholMeta, { perDay: 15 }).today;
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = String(v); };
  set('due-count', q.kern.length);
  set('aufhol-count', aufholToday.length);

  // Exam lock: open as soon as the gate is open
  const nav = document.getElementById('nav-examen');
  if (nav) {
    try {
      const [{ examGate }, comp] = await Promise.all([
        import('./exam-core.js'),
        fetch('content/competencies.json').then(r => r.json()),
      ]);
      const gate = examGate(state, { kompetenzen: comp.kompetenzen, cards: state.cards ?? [], nowMs: Date.now() });
      nav.classList.toggle('state-locked', !gate.allowed);
      nav.title = gate.allowed ? 'Examen freigeschaltet' : gate.reasons.slice(0, 3).join(' · ');
      const use = nav.querySelector('use');
      if (use) use.setAttribute('href', `assets/icons/sprite.svg#icon-${gate.allowed ? 'fach-trophy' : 'st-lock'}`);
    } catch { nav.classList.add('state-locked'); }
  }

  // Ritual progress in the sidebar
  try {
    const { todaySession } = await import('./ritual.js');
    const { STEPS } = await import('./session.js');
    const s = todaySession(state);
    set('ritual-step', `${STEPS.indexOf(s.step) + 1}/4`);
  } catch { /* Ritual optional */ }
}

/** Staged opening: wordmark, aurora, cascade. Skippable; with reduced motion it appears at once. */
function introSequence(state) {
  const el = document.getElementById('intro');
  if (!el) return Promise.resolve();
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { el.remove(); return Promise.resolve(); }
  const greet = el.querySelector('.intro-greet');
  if (greet) {
    const h = new Date().getHours();
    const wg = h < 11 ? 'Guten Morgen' : h < 18 ? 'Guten Tag' : 'Guten Abend';
    const due = state.cards.filter(c => c.due <= Date.now()).length;
    greet.textContent = `${wg} — ${due} Karten fällig.`;
  }
  return new Promise(res => {
    const done = () => { el.classList.add('out'); setTimeout(() => { el.remove(); res(); }, 250); };
    el.addEventListener('click', done, { once: true });
    setTimeout(done, 1500);               // harte Grenze ~1,5 s (§6.3)
  });
}

/** The seven steps of the wizard, as the sidebar shows them. */
export const SETUP_SCHRITTE = ['Verbinden', 'Fachprofil', 'Lernprofil', 'Machbarkeit',
  'Personalisierung', 'Placement', 'Los'];

/**
 * Setup mode: no profile yet, so no navigation.
 *
 * Called on every render, not only at startup — the redirect into the wizard
 * used to run once, and a single click on "Dashboard" then left the wizard with
 * no way back while the half-filled draft sat saved and unreachable.
 */
export function setzeSetupModus(ctx, doc = document) {
  const shell = doc.querySelector('.app-shell');
  // Both places: the wizard writes the record, and ctx is filled from it only at
  // startup. Reading just one of them left the wizard unable to end.
  const imSetup = !(ctx.profile ?? ctx.state?.profile);
  shell?.classList.toggle('im-setup', imSetup);

  const box = doc.getElementById('setup-fortschritt');
  if (!box) return imSetup;
  box.hidden = !imSetup;
  if (!imSetup) return false;

  const schritt = ctx.state?.onboardingDraft?.step ?? 0;
  box.innerHTML = `<div class="sf-titel">Einrichtung</div>` + SETUP_SCHRITTE.map((name, i) => {
    const zustand = i < schritt ? 'fertig' : i === schritt ? 'jetzt' : '';
    return `<div class="setup-schritt ${zustand}"><span class="sf-nr">${i < schritt ? '✓' : i + 1}</span>${name}</div>`;
  }).join('');
  return true;
}

export function paintTopbar(state) {
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('tb-xp', `${state.xp.toLocaleString('de-AT')} XP`);
  set('tb-level', String(state.level));
  // The level title is the reward the ladder is built around (#28); showing the
  // bare number withholds it.
  set('tb-level-titel', levelFor(state.xp ?? 0, state.levelEndtitel).title);
  // Derived from dayStats, not from a parallel list — see weekProgress().
  const woche = weekProgress(state, Date.now());
  set('tb-week', `${woche.done}/${woche.goal} Tagen`);
  const punkte = document.getElementById('tb-wochenpunkte');
  if (punkte) {
    punkte.replaceChildren(...wochenpunkte(state, Date.now()).map(p => {
      const i = document.createElement('i');
      i.className = 'wp' + (p.gelernt ? ' an' : '') + (p.zukunft ? ' spaeter' : '');
      i.title = `${p.kurz}: ${p.gelernt ? 'gelernt' : p.zukunft ? 'noch offen' : 'kein Lerntag'}`;
      return i;
    }));
  }
  const ms = state.milestones[0];
  if (ms) {
    const days = Math.ceil((Date.parse(ms.date) - Date.now()) / 86_400_000);
    set('tb-goal', `${ms.label} in ${days} Tagen`);
  }
  set('tb-legal', LEGAL_STATE);
}

function markActiveNav(path) {
  document.querySelectorAll('[data-nav]').forEach(el =>
    el.classList.toggle('active', el.dataset.nav === path));
}

// ---------- Routen ----------

import { renderHeatmap, renderRadar, renderCurve, renderXpBars, renderExamHistory } from './dashboard.js';
import { aggregateCompetencies, radarData } from './competency.js';
import { splitQueues } from './engine-leitner.js';
import { ceremony, CEREMONY, levelFor, weekProgress, wochenpunkte } from './gamification.js';
import { einheitenGesamt } from './content-index.js';

route('dashboard', async (view, ctx) => {
  // Erhaltungsmodus (#36): nach bestandenem Examen Tagesdosis + Wochen-Szenario anzeigen
  try {
    const { maintenancePlan } = await import('./erhaltung.js');
    const sc = await fetch('content/scenarios.json').then(r => r.json());
    const mp = maintenancePlan(ctx.state, sc.scenarios, Date.now());
    if (mp.active) {
      const m = document.createElement('div');
      m.className = 'card maintenance-note';
      m.innerHTML = `<b>Erhaltungsmodus aktiv</b> — heute ${mp.cards.length} Karten` +
        (mp.szenarioDue ? ` · <a href="#/boss/${mp.szenarioId}">Wochen-Szenario fällig</a>` : ' · Wochen-Szenario erledigt') +
        ` <span class="dim">(Wissen ohne Nutzung zerfällt — die Minimal-Dosis dagegen.)</span>`;
      view.appendChild(m);
    }
  } catch { /* Erhaltung ist Zusatz — Dashboard rendert auch ohne */ }
  view.classList.add('dash-grid');
  const s = ctx.state;
  // Feasibility and drift hints also for curated profiles, not only during onboarding
  if (s.milestones?.length && s.pace) {
    try {
      const { feasibilityCheck } = await import('./pacing.js');
      const UNITS = await einheitenGesamt();
      const feas = feasibilityCheck({ ...s.pace, milestones: s.milestones },
        { totalUnits: UNITS, minutesPerUnit: 25, doneUnits: (s.unit_done?.length ?? 0) + (s.unit_skipped?.length ?? 0) }, Date.now());
      const eng = (Array.isArray(feas) ? feas : [feas]).filter(f => f && f.feasible === false);
      if (eng.length) {
        const w = document.createElement('div');
        w.className = 'card feas-note';
        w.innerHTML = `<b>Ehrliche Rechnung:</b> Für „${eng[0].label ?? 'dein Ziel'}" bräuchtest du ~${eng[0].neededMinutesPerDay ?? '?'} min/Tag (geplant: ${s.pace.minutesPerDay}). <a href="#/einstellungen">Ziel oder Pensum anpassen</a> — ein Plan, der rechnerisch nicht aufgeht, erzeugt nur Schuldgefühle (§5.1).`;
        view.appendChild(w);
      }
    } catch { /* Pacing ist Zusatz */ }
  }
  // ECHTE Daten (Task-12-Finding: Demo-Bindung war Task-8-Restschuld).
  const [factsDb, compDef] = await Promise.all([
    fetch('content/facts-db.json').then(r => r.json()),
    fetch('content/competencies.json').then(r => r.json()),
  ]);
  const agg = aggregateCompetencies(s.events ?? []);
  // Kategorien → Kompetenzen: Artikel-Score = Kompetenz-Score seiner Kategorie-Kompetenzen
  const KAT2K = { fundament: ['K01', 'K02'], verbote: ['K04'], einstufung: ['K03'], fristen: ['K06'],
    rollen: ['K05'], pflichten: ['K08', 'K09', 'K10'], daten: ['K11'], transparenz: ['K12'],
    gpai: ['K13'], aufsicht: ['K15', 'K14'], sanktionen: ['K15'], innovation: ['K15'],
    verfahren: ['K10', 'K16'], anhang: ['K03', 'K16'], rand: ['K16'] };
  // Profile overrides: the profile shifts relevance tiers, which steer prioritisation
  // and emphasis in the article map.
  const overrides = new Map((ctx.profile?.personalisierung?.relevanz_overrides ?? []).map(o => [o.ref, o.stufe]));
  // Article → unit, from the unit index. Without this the tiles carried a pointer
  // cursor and a click handler that could never fire: the handler tests unit_id,
  // and nothing ever set it.
  const unitIdx = await fetch('content/units/index.json').then(r => r.ok ? r.json() : null).catch(() => null);
  const artikelZuEinheit = new Map();
  for (const u of unitIdx?.units ?? []) {
    for (const ref of u.legal_refs ?? []) if (!artikelZuEinheit.has(ref)) artikelZuEinheit.set(ref, u.id);
  }

  const articles = factsDb.relevanz_matrix.artikel.map(a => {
    const ks = [...new Set((a.kategorien ?? []).flatMap(k => KAT2K[k] ?? []))];
    const scores = ks.map(k => agg.get(k)?.score).filter(v => v != null);
    const stufe = overrides.get(a.ref) ?? a.relevanz?.betreiber_behoerde ?? 'kompakt';
    return { id: a.ref, label: a.ref, relevanz: stufe, overridden: overrides.has(a.ref),
      unit_id: artikelZuEinheit.get(a.ref) ?? null,
      score: scores.length ? scores.reduce((x, y) => x + y, 0) / scores.length : null };
  });
  const kernN = articles.filter(a => a.relevanz === 'kern').length;
  const axes = radarData(compDef.kompetenzen, agg);
  // Actual curve: cumulative unit progress per week from events; target: linear to the milestones
  // 16 here, 17 in the feasibility check, 16 again in the ritual — three numbers
  // for one quantity, and the index has 17. The curve therefore overstated
  // progress while the pacing warning was computed against a different base.
  const UNITS_TOTAL = await einheitenGesamt();
  const unitEvents = (s.events ?? []).filter(e => e.kind === 'unit_completed');
  // Count legacy progress without recorded events as a baseline
  const unitBaseline = Math.max(0, (s.unit_done?.length ?? 0) - unitEvents.length);
  const start = s.events?.[0]?.ts ?? Date.now();
  const weeks = Math.max(2, Math.ceil((Date.now() - start) / (7 * 864e5)) + 1);
  const ist = Array.from({ length: weeks }, (_, w) => ({
    label: 'W' + (w + 1),
    value: (unitBaseline + unitEvents.filter(e => e.ts <= start + (w + 1) * 7 * 864e5).length) / UNITS_TOTAL,
  }));
  const msEnd = s.milestones?.length ? Date.parse(s.milestones[s.milestones.length - 1].date) : start + 60 * 864e5;
  const soll = ist.map((p, w) => ({ label: '', value: Math.min(1, ((start + (w + 1) * 7 * 864e5) - start) / Math.max(1, msEnd - start)) }));
  const curve = { ist, soll };
  const q = splitQueues(s.cards ?? [], Date.now());
  view.innerHTML = `
    <div class="card"><div class="chead"><span class="csym"><svg aria-hidden="true"><use href="assets/icons/sprite.svg#icon-fach-heatmap"/></svg></span><span class="t"><h3>Artikel-Landkarte</h3><span class="sub">Gesamter AI Act · ${kernN} Kern-Artikel für dein Profil${overrides.size ? ` (${overrides.size} profil-angepasst)` : ''}</span></span></div>
      <div class="hm-wrap" id="d-hm"></div>
      <div class="dim" id="d-hm-hinweis">Kachel anklicken: führt zur Einheit, die den Artikel behandelt.</div>
      <div class="legend"><span><i style="background:#65d8b2"></i>Sehr sicher</span><span><i style="background:#9dcc9b"></i>Sicher</span><span><i style="background:#e1ad58"></i>Unsicher</span><span><i style="background:#d97568"></i>Kritisch</span><span><i style="background:#414956"></i>Ungelernt</span></div>
      <div class="hm-summe"><span>&Sigma; <b>${articles.length}</b> Artikel · davon <b>${kernN}</b> im Kernbereich deines Profils</span>
        <span>Stand: <b>${LEGAL_STATE.replace('Rechtsstand ', '')}</b></span></div></div>
    <div class="card"><div class="chead violett"><span class="csym"><svg aria-hidden="true"><use href="assets/icons/sprite.svg#icon-nav-dashboard-radar"/></svg></span><span class="t"><h3>Kompetenzen</h3><span class="sub">Dein Kompetenzprofil</span></span></div>
      <div class="radar-wrap" id="d-radar"></div>
      <div class="viz-legende"><span style="color:var(--emerald)"><i></i>Dein Profil</span><span><i class="gestrichelt"></i>Soll-Profil</span></div></div>
    <div class="card"><div class="chead"><span class="csym"><svg aria-hidden="true"><use href="assets/icons/sprite.svg#icon-fach-timeline"/></svg></span><span class="t"><h3>Lernkurve vs. Soll</h3></span>
        <span class="zeitraum"><select id="d-curve-range" aria-label="Zeitraum der Lernkurve">
          <option value="4">Letzte 4 Wochen</option><option value="12" selected>Letzte 12 Wochen</option><option value="0">Gesamter Verlauf</option>
        </select></span></div>
      <div class="curve-wrap" id="d-curve"></div>
      <div class="viz-legende"><span style="color:var(--emerald)"><i></i>Dein Lernfortschritt</span><span><i class="gestrichelt"></i>Soll-Verlauf</span></div></div>
    <div class="right-col">
      <div class="card due-mini"><div class="chead" style="margin-bottom:4px"><span class="t"><h3>Fällige Karten</h3></span></div>
        <div class="due-mini-nums"><div><span>Kern</span><b style="color:#b6a5ff">${q.kern.length}</b></div><div><span>Aufholen</span><b style="color:var(--gold)">${q.aufhol.length}</b></div></div></div>
      <div class="card coach-block"><div class="chead" style="margin-bottom:8px"><span class="t"><h3>Coach</h3><span class="sub">Tagesfokus aus deinem Stand</span></span></div>
        <div class="coach-karte">
          <img src="assets/characters/crew/01-coach-zufrieden.webp" alt="" loading="lazy" onerror="this.style.display='none'">
          <div class="coach-text" id="d-coach"></div>
        </div></div>
      <div class="card"><div class="chead" style="margin-bottom:4px"><span class="t"><h3>Badges</h3><span class="sub">Aktivität — nicht Kompetenz (#28)</span></span></div><div id="d-badges"></div></div>
      <div class="card duo-card"><div class="duo">
        <div><div class="chead" style="margin-bottom:4px"><span class="t"><h3>XP · Wochen</h3></span></div><div id="d-xp"></div></div>
        <div><div class="chead" style="margin-bottom:4px"><span class="t"><h3>Examen</h3></span></div><div id="d-exam"></div></div>
      </div></div>
    </div>`;
  renderHeatmap(view.querySelector('#d-hm'), articles, {
    onSelect: a => {
      if (a.unit_id) return navigate(`#/einheit/${a.unit_id}`);
      // Not every article has its own unit — say so instead of doing nothing.
      // A tile that looks operable and stays silent is the worse outcome.
      const hinweis = view.querySelector('#d-hm-hinweis');
      if (hinweis) hinweis.textContent =
        `${a.label}: keine eigene Einheit — im Überblick „Randwissen" behandelt (${a.relevanz}).`;
    },
  });
  renderRadar(view.querySelector('#d-radar'), axes);

  // Time range for the curve. Over months a full history compresses the recent
  // weeks — the part the user is actually steering by — into a few pixels.
  const zeichneKurve = (wochen) => {
    const n = Number(wochen) || 0;
    const ist = n > 0 ? curve.ist.slice(-n) : curve.ist;
    const soll = n > 0 ? curve.soll.slice(-n) : curve.soll;
    renderCurve(view.querySelector('#d-curve'), ist, soll);
  };
  const bereich = view.querySelector('#d-curve-range');
  zeichneKurve(bereich?.value ?? 12);
  bereich?.addEventListener('change', () => zeichneKurve(bereich.value));

  // Coach: speaks from the state, not from a stock phrase. Weakest competency,
  // what is due, and whether the target curve still works out.
  const coach = view.querySelector('#d-coach');
  if (coach) {
    const schwach = [...agg.entries()]
      .filter(([, c]) => c.score != null && c.n >= 3)
      .sort((a, b) => a[1].score - b[1].score)[0];
    const nameVon = (id) => compDef.kompetenzen.find(k => k.id === id)?.name ?? id;
    const letzterIst = curve.ist.at(-1)?.value ?? 0;
    const letzterSoll = curve.soll.at(-1)?.value ?? 0;
    const teile = [];
    teile.push(letzterIst >= letzterSoll
      ? `Du liegst mit <b>${Math.round(letzterIst * 100)} %</b> auf oder über der Soll-Linie — weiter so.`
      : `Du liegst bei <b>${Math.round(letzterIst * 100)} %</b>, die Soll-Linie steht bei ${Math.round(letzterSoll * 100)} %. Aufholbar, wenn du dranbleibst.`);
    if (schwach) {
      teile.push(`Schwächster Punkt gerade: <b>${nameVon(schwach[0])}</b> (${Math.round(schwach[1].score * 100)} %${schwach[1].weakest ? `, vor allem auf Stufe ${schwach[1].weakest}` : ''}).`);
    }
    const sicherFalsch = [...agg.values()].reduce((a, c) => a + c.sureButWrong, 0);
    if (sicherFalsch >= 5) {
      teile.push(`<b>${sicherFalsch}×</b> warst du dir sicher und lagst daneben — das ist der Stoff, der im Gespräch weh tut.`);
    }
    if (q.kern.length) {
      teile.push(`Heute fällig: <b>${q.kern.length}</b> Karte${q.kern.length === 1 ? '' : 'n'} im Kern${q.aufhol.length ? `, ${q.aufhol.length} zum Aufholen` : ''}.`);
    }
    else teile.push('Keine Karten fällig — guter Moment für eine neue Einheit.');
    coach.innerHTML = teile.map(t => `<p>${t}</p>`).join('') + '<span class="sig">— Deine Coach</span>';
  }
  // Points per calendar week from dayStats (real data)
  const dayXp = Object.entries(s.dayStats ?? {});
  const weekXp = new Map();
  for (const [day, st] of dayXp) {
    const d = new Date(day + 'T12:00');
    const key = `${d.getFullYear()}-W${String(Math.ceil(((d - new Date(d.getFullYear(), 0, 1)) / 864e5 + 1) / 7)).padStart(2, '0')}`;
    weekXp.set(key, (weekXp.get(key) ?? 0) + (st.xp ?? 0));
  }
  const xpBars = [...weekXp.entries()].slice(-4).map(([label, xp]) => ({ label: label.split('-')[1], xp }));
  import('./rewards.js').then(({ renderBadgeGallery }) => renderBadgeGallery(view.querySelector('#d-badges'), s));
  renderXpBars(view.querySelector('#d-xp'), xpBars.length ? xpBars : [{ label: 'W1', xp: s.xp ?? 0 }]);
  const series = Object.entries(s.scoreSeries ?? {}).map(([k, v]) => ({
    regime: k.split('|').slice(0, 4).join(' · '),
    attempts: v.runs.map(r => ({ score: Math.round(r.pct * 100) })),
  }));
  renderExamHistory(view.querySelector('#d-exam'), series.length ? series : [{ regime: 'noch kein Examen', attempts: [] }]);
});

// Ceremony demo route, kept for manual inspection of the three tiers
route('zeremonie', (view, ctx, [tier]) => {
  view.innerHTML = `<div class="card"><h3>Zeremonien-Test</h3><p class="dim">
    <a href="#/zeremonie/klein">klein</a> · <a href="#/zeremonie/mittel">mittel</a> · <a href="#/zeremonie/gross">groß</a></p>
    <button class="btn-primary" id="z-go">Auslösen: ${tier ?? 'klein'}</button></div>`;
  view.querySelector('#z-go').addEventListener('click', () => {
    const lv = levelFor(ctx.state.xp, ctx.state.levelEndtitel);
    if (tier === 'gross') ceremony(document, CEREMONY.GROSS, {
      title: 'Level-Up!', text: `Du bist jetzt Level ${lv.level + 1} — bleib dran.`,
      image: 'assets/characters/crew/01-coach.webp',
      stats: [{ k: 'XP gesamt', v: ctx.state.xp + 120 }, { k: 'Einheiten', v: 12 }, { k: 'Beste Serie', v: '86%' }]
    });
    else if (tier === 'mittel') ceremony(document, CEREMONY.MITTEL, {
      title: 'Badge: Dreistellig', text: '100 Fragen beantwortet. Verlässlich unspektakulär.',
      image: 'assets/characters/crew/01-coach.webp'
    });
    else ceremony(document, CEREMONY.KLEIN, { xp: 14, anchor: view.querySelector('#z-go').parentElement });
  });
});

import { renderUnit } from './unit-view.js';

const PHASE_LABEL = { p1: 'Fundament', p2: 'Verbote', p3: 'Einstufung', p4: 'Pflichten', p5: 'Transparenz',
  p6: 'GPAI', p7: 'Aufsicht', p8: 'Randwissen', p9: 'Ländermodul AT', p10: 'Auslegung' };

/**
 * Why a phase is here although it is not the user's home ground. Only where that
 * question actually comes up — the promise "nothing is left out" (#2) is worth
 * little if the product never says it.
 */
const PHASE_NOTIZ = {
  p8: 'Nicht dein Kerngebiet — aber genau die Artikel, die in Diskussionen unvermittelt auftauchen. Als Überblick, nicht zum Anwenden (#3).',
  p10: 'Kür: die Erwägungsgründe liefern die Auslegungsargumente, die in Diskussionen den Ausschlag geben.',
};

route('lernen', async (view, ctx, [phaseFilter]) => {
  const idx = await fetch('content/units/index.json').then(r => r.json());
  const st = ctx.state;
  const done = new Set(st.unit_done ?? []);
  const skipped = new Set(st.unit_skipped ?? []);
  const phases = phaseFilter ? [phaseFilter] : Object.keys(PHASE_LABEL);
  view.innerHTML = `<div class="card"><div class="chead"><span class="csym"><svg aria-hidden="true"><use href="assets/icons/sprite.svg#icon-nav-lernen"/></svg></span><span class="t"><h3>Lernen${phaseFilter ? ` — ${PHASE_LABEL[phaseFilter] ?? phaseFilter}` : ''}</h3>
    <span class="sub">${phaseFilter ? '<a href="#/lernen">alle Phasen</a>' : 'Vollständiger Stoff, nach Rollen-Relevanz geordnet — jede Phase ist jederzeit zugänglich, die Reihenfolge ist eine Empfehlung. Überspringen erfordert einen Challenge-Test.'}</span></span></div>
    <div id="unit-list"></div></div>`;
  const list = view.querySelector('#unit-list');
  for (const p of phases) {
    const units = idx.units.filter(u => u.phase === p);
    if (!units.length) continue;
    if (!phaseFilter) list.insertAdjacentHTML('beforeend',
      `<div class="sect lern-sect">${p.toUpperCase()} · ${PHASE_LABEL[p] ?? ''}${PHASE_NOTIZ[p] ? `<span class="lern-sect-notiz">${PHASE_NOTIZ[p]}</span>` : ''}</div>`);
    for (const u of units) {
      const status = done.has(u.id) ? 'done' : skipped.has(u.id) ? 'skipped' : '';
      const row = document.createElement('div');
      row.className = 'lern-row';
      // u-titel, nicht lbl: `.ph .lbl` ist ein Spalten-Flex für die Sidebar, wo
      // Name und Fortschrittsbalken übereinander gehören. Auf einen Fließtext
      // angewandt wird jedes Kind-Element zur eigenen Zeile — jeder Titel mit
      // einem Glossarbegriff darin zerfiel in drei Zeilen.
      row.innerHTML = `<a class="ph ${status}" href="#/einheit/${u.id}">
          <span class="ring">${done.has(u.id) ? '✓' : skipped.has(u.id) ? '»' : u.level}</span>
          <span class="u-titel">${u.title}</span><span class="u-komp">${u.competency ?? ''}</span></a>
        ${status ? '' : `<a class="btn-mini" href="#/challenge/${u.id}" title="Challenge-Test: 6 Fragen, 80 % — bei Bestehen wird die Einheit übersprungen (#19)">Challenge</a>`}`;
      list.appendChild(row);
    }
    const test = st.chapterTests?.[p];
    if (phaseFilter || true) list.insertAdjacentHTML('beforeend',
      `<div class="lern-test">${test?.passed ? `Kapiteltest bestanden${Number.isFinite(test.pct) ? ` (${(test.pct * 100).toFixed(0)} %)` : ''}` : 'Kapiteltest offen'} — <a href="#/test/${p}">${test?.passed ? 'erneut antreten' : 'zum Kapiteltest'}</a></div>`);
  }
});

route('einheit', async (view, ctx, [unitId]) => {
  view.classList.remove('dash-grid');
  // Mandatory review BEFORE new material — the gate comes from session.js
  const { todaySession, sessionStatus } = await import('./ritual.js');
  const { canStartUnit, completeStep } = await import('./session.js');
  const s = todaySession(ctx.state);
  const q = splitQueues(ctx.state.cards ?? [], Date.now());
  if (!s.review.done && q.kern.length === 0) { completeStep(s, 'review'); ctx.saveState(); }
  if (!canStartUnit(s)) {
    const c = document.createElement('div');
    c.className = 'card';
    c.innerHTML = `<h3>Erst wiederholen, dann Neues</h3>
      <p>Heute ${s.review.kern.length === 1 ? 'ist' : 'sind'} <b>${s.review.kern.length}</b> Karte${s.review.kern.length === 1 ? '' : 'n'} regulär fällig. Verteilte Wiederholung VOR neuem Stoff ist der robusteste Lern-Hebel — deshalb ist dieser Schritt Pflicht (§3, #32).</p>
      <a class="btn-primary" href="#/karten">Zum Pflicht-Review</a> <a class="btn" href="#/heute">Ritual-Übersicht</a>`;
    view.appendChild(c);
    return;
  }
  const st = sessionStatus(ctx.state);
  if (st.block.due) {
    const b = document.createElement('div');
    b.className = 'card block-note';
    b.innerHTML = `<b>Intensiv-Block ${st.block.block} erreicht (~60 min).</b> <span class="dim">Kurz aufstehen — Konsolidierung im Stundentakt schlägt Durchhalten (#33).</span>`;
    view.appendChild(b);
    ctx.saveState();
  }
  renderUnit(view, unitId, ctx);
});

// ---------- Wiederholung (Kern-/Aufholwarteschlange, #32/#34) ----------
import { planAufhol, review, newCard } from './engine-leitner.js';

route('karten', async (view, ctx) => {
  // Glossar-Kategorie (#6): Begriffskarten laufen wie alle anderen durchs Leitner-System
  if (!ctx.state.glossarCardsSeeded) {
    try {
      const fc = await fetch('content/flashcards.json').then(r => r.json());
      const have = new Set((ctx.state.cards ?? []).map(c => c.id));
      for (const c of fc.cards.filter(x => x.kind === 'glossar' && !have.has(x.id))) {
        (ctx.state.cards ??= []).push(newCard(c.id, { competency: c.competency, front: c.front, back: c.back, kind: 'glossar' }, Date.now()));
      }
      ctx.state.glossarCardsSeeded = true;
      await ctx.saveState();
    } catch { /* Glossar-Karten sind Zusatz */ }
  }
  const paint = () => {
    const q = splitQueues(ctx.state.cards ?? [], Date.now());
    const aufholToday = planAufhol(q.aufholMeta, { perDay: 15 }).today;
    const queue = [...q.kern, ...aufholToday];
    if (!queue.length) {
      view.innerHTML = `<div class="card"><div class="chead"><span class="csym"><svg aria-hidden="true"><use href="assets/icons/sprite.svg#icon-nav-karten"/></svg></span><span class="t"><h3>Wiederholung</h3><span class="sub">Nichts fällig</span></span></div><p class="dim">Kern: 0 · Aufholen heute: 0${(ctx.state.cards ?? []).length ? ` · ${(ctx.state.cards).length} Karten im System — die nächste Fälligkeit folgt automatisch` : ''}.</p></div>`;
      return;
    }
    const c = queue[0];
    view.innerHTML = `<div class="card"><div class="chead"><span class="csym"><svg aria-hidden="true"><use href="assets/icons/sprite.svg#icon-nav-karten"/></svg></span><span class="t"><h3>Wiederholung</h3><span class="sub">Kern ${q.kern.length} · Aufholen heute ${aufholToday.length}</span></span></div>
      <div class="card unit-block karte-blatt"><div class="unit-tag">${c.competency ?? ''}${c.level ? ' · Stufe ' + c.level : ''}</div>
        <p class="karte-front">${c.front ?? '<span class="karte-leer">Diese Karte hat keinen Fragetext — sie stammt aus einem Import oder einem Testlauf.</span>'}</p>
        <div id="k-back" hidden><p class="karte-back">${c.back ?? '<span class="karte-leer">Keine Antwort hinterlegt.</span>'}</p>
          <div class="q-confidence"><span>Gewusst?</span>
            <button data-r="richtig-sicher">richtig · sicher</button>
            <button data-r="richtig-unsicher">richtig · unsicher</button>
            <button data-r="falsch">falsch</button></div></div>
        <button class="btn-primary" id="k-flip">Antwort zeigen</button>
      </div></div>`;
    view.querySelector('#k-flip').onclick = () => { view.querySelector('#k-back').hidden = false; view.querySelector('#k-flip').hidden = true; };
    view.querySelectorAll('[data-r]').forEach(b => b.onclick = () => {
      const r = b.dataset.r;
      review(c, { correct: r !== 'falsch', confidence: r === 'richtig-unsicher' ? 'unsicher' : 'sicher' }, Date.now());
      ctx.state.dayStats = ctx.state.dayStats ?? {};
      const dk = (d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)(new Date());
      ctx.state.dayStats[dk] = { ...(ctx.state.dayStats[dk] ?? {}), reviewDone: true, xp: (ctx.state.dayStats[dk]?.xp ?? 0) + 2 };
      ctx.state.events.push({ competency: c.competency, level: 'A', correct: r !== 'falsch', confidence: r.includes('unsicher') ? 'unsicher' : 'sicher', summative: false, ts: Date.now() });
      // If the core queue is empty, tick off step 1 of the ritual
      import('./ritual.js').then(({ todaySession }) => import('./session.js').then(({ completeStep }) => {
        const s = todaySession(ctx.state);
        if (splitQueues(ctx.state.cards ?? [], Date.now()).kern.length === 0) completeStep(s, 'review');
        ctx.saveState();
      }));
      ctx.saveState(); paint();
    });
  };
  paint();
});

// ---------- Bosskampf (Durchstich: Szenario-Engine + Bridge-Persona, §5.2) ----------
import { createScenarioRun, recordUserTurn, advancePhase, buildAssessmentPayload } from './engine-dialog.js';
import { renderDialog, renderAssessmentCard } from './engine-dialog.js';
import { LlmAdapter } from './llm-adapter.js';

route('boss', async (view, ctx, [scenarioId]) => {
  const sc = await fetch('content/scenarios.json').then(r => r.json());
  const scenario = sc.scenarios.find(s => s.id === (scenarioId ?? 'sz-p2-stimmungsradar'));
  if (!scenario) { view.innerHTML = '<div class="card"><p class="dim">Szenario nicht gefunden.</p></div>'; return; }
  const arch = (await fetch('content/archetypes.json').then(r => r.json())).archetypes
    .find(a => a.id === scenario.persona_archetype);
  // Archetype to crew figure: artwork and persona card per conversation type
  const CREW = {
    'draengler':              { img: '03-fachabteilung', name: 'M. Brunner',  role: 'Leitung Fachabteilung' },
    'kritischer-pruefer':     { img: '04-datenschutz',   name: 'Dr. E. Steiner', role: 'Datenschutzbeauftragte' },
    'fuehrungsebene':         { img: '06-fuehrung',      name: 'K. Wallner',  role: 'Generaldirektion' },
    'belegschaftsvertretung': { img: '05-personalvertretung', name: 'H. Novak', role: 'Personalvertretung' },
    'kunde-konformitaet':     { img: '02-pruefer',       name: 'S. Berger',   role: 'Partner-Fachbereich' },
    'cto-vor-release':        { img: '02-pruefer',       name: 'T. Auer',     role: 'IT-Leitung' },
    'notifizierte-stelle':    { img: '02-pruefer',       name: 'Ing. R. Falk', role: 'Notifizierte Stelle' },
  };
  // Profile reskin: ONLY surface features (organisation, role, domain vocabulary).
  // Facts, rubric, traps and difficulty stay unchanged.
  const eink = (ctx.profile?.personalisierung?.szenario_einkleidungen ?? []).find(e => e.scenario_id === scenario.id);
  const crew = CREW[scenario.persona_archetype] ?? CREW['draengler'];
  const cimg = k => `assets/characters/crew/${crew.img}-${k}.webp`;
  scenario.persona = {
    archetype: arch?.name ?? scenario.persona_archetype,
    name: crew.name, role: eink?.rolle ?? crew.role,
    organisation: eink?.org ?? ctx.profile?.fachprofil?.organisation ?? null,
    domaenenbegriff: eink?.domaenenbegriff ?? ctx.profile?.fachprofil?.domaene ?? null,
    avatar: cimg('neutral'),
    expressions: { neutral: cimg('neutral'), skeptisch: cimg('skeptisch'), zufrieden: cimg('zufrieden'), nachbohrend: cimg('nachbohrend') }
  };
  const llm = new LlmAdapter({});
  try { await llm.refreshHealth(); llm.evaluateGate(); } catch { /* Boss braucht LLM — Fehlerpfad unten */ }
  const run = createScenarioRun(scenario, Date.now());
  run.transcript.push({ who: 'persona', text: 'Schön, dass Sie Zeit haben! Wir wollen ein Stimmungsradar für die Hotline — Dashboard zeigt live die Gesprächsstimmung. Was brauche ich von Ihnen, damit das schnell durchgeht?', ts: Date.now(), phase: 0 });

  const wrap = document.createElement('div');
  wrap.className = 'card';
  wrap.style.cssText = 'height:100%;display:flex;flex-direction:column';
  wrap.innerHTML = `<div class="chead"><span class="t"><h3>${scenario.title}</h3><span class="sub">Bosskampf · ${arch?.name ?? ''}${scenario.persona.organisation ? ` · ${scenario.persona.organisation}` : ''} · Phase <span id="b-phase">1</span>/${scenario.phases.length}</span></span>
    <span class="actions"><button id="b-next" class="btn" style="font-size:.75rem">Phase abschließen ▸</button></span></div>
    <div id="b-dlg" style="flex:1;min-height:0"></div>`;
  view.appendChild(wrap);
  const dmount = wrap.querySelector('#b-dlg');

  const paint = (opts = {}) => renderDialog(dmount, scenario, run, {
    ...opts,
    suggestedMoves: run.transcript.length < 3 ? ['Was genau ist die Zweckbestimmung?', 'Wessen Stimme wird analysiert — nur Anrufende oder auch unsere Leute?'] : [],
    onUserTurn: async text => {
      recordUserTurn(scenario, run, text, Date.now());
      paint({ typing: true });
      try {
        const resp = await llm.boss({
          bossId: `${scenario.id}-${run.started}`,
          personaCard: { name: scenario.persona.name, role: scenario.persona.role, archetype: arch?.name, dynamik: arch?.dynamik, ton: arch?.ton,
            organisation: scenario.persona.organisation, domaenenbegriff: scenario.persona.domaenenbegriff },
          revealedFacts: scenario.facts.filter(f => run.released_fact_ids.includes(f.id)).map(f => f.text),
          phase: scenario.phases[run.phase_index].opening_hint,
          userTurn: text
        });
        run.transcript.push({ who: 'persona', text: resp.say ?? resp.reply ?? resp.text ?? '(keine Antwort)', ts: Date.now(), phase: run.phase_index });
        paint({ mood: resp.pressure_point ? 'nachbohrend' : 'neutral' });
      } catch (e) {
        // Naming the cause correctly matters: the product has no support desk,
        // so the message is what the user (or their agent) works from. Claiming
        // the bridge is unreachable when it answered sends them hunting in the
        // wrong place — the model's answer was the problem.
        const hinweis = /HTTP 50[23]/.test(String(e.message))
          ? 'Das Modell hat keine verwertbare Antwort geliefert'
          : /HTTP 503/.test(String(e.message))
            ? 'Kein Modell verbunden'
            : 'Bridge nicht erreichbar';
        run.transcript.push({ who: 'persona', text: `[${hinweis}: ${e.message}]`, ts: Date.now(), phase: run.phase_index });
        paint();
      }
      ctx.saveState();
    }
  });
  wrap.querySelector('#b-next').onclick = async () => {
    advancePhase(scenario, run);
    wrap.querySelector('#b-phase').textContent = String(run.phase_index + 1);
    if (run.finished) {
      // Grading: a FRESH, isolated call with only the transcript and the rubric
      dmount.innerHTML = '<p class="dim">Bewertung läuft (frischer Prüfer-Aufruf)…</p>';
      // Gating-Urteil (Plan §4.2: Bosskampf mind. „solide" vor Kapiteltest) —
      // Deterministic from the scenario engine: goals reached, no critical trap sprung.
      const payload = buildAssessmentPayload(scenario, run);
      const achieved = payload.goals.filter(g => g.hit).length;
      const solide = achieved / payload.goals.length >= 0.5 && !payload.critical_triggered;
      const phaseKey = (scenario.id.match(/^sz-(p\d+)-/) || [])[1];
      if (phaseKey) {
        ctx.state.bossResults ??= {};
        ctx.state.bossResults[phaseKey] = { scenarioId: scenario.id, passed: solide, achieved, total: payload.goals.length, ts: Date.now() };
        ctx.saveState();
      }
      try {
        const j = await llm.judgeBoss({ scenarioCore: { title: scenario.title, goals: scenario.goals.map(g => g.text), critical_errors: scenario.critical_errors }, rubric: scenario.rubric, transcript: run.transcript });
        dmount.innerHTML = '';
        renderAssessmentCard(dmount, { goals: payload.goals, feedback: (solide ? 'Urteil: solide — Kapiteltest freigeschaltet. ' : 'Urteil: noch nicht solide — Wiederholung mit anderem Gesprächsverlauf empfohlen. ') + (j.feedback ?? '') });
      } catch (e) { dmount.innerHTML = `<p class="dim">Bewertung fehlgeschlagen: ${e.message} — Gating-Urteil (deterministisch): ${solide ? 'solide' : 'nicht solide'}.</p>`; }
    } else {
      const hint = scenario.phases[run.phase_index].opening_hint;
      run.transcript.push({ who: 'persona', text: `(${hint})`, ts: Date.now(), phase: run.phase_index });
      paint();
    }
  };
  paint();
});

// Exam routes register themselves through route()
import './exam.js';
import './onboarding.js';
import './ritual.js';

// ---------- settings: a learning profile is a snapshot, not a vow ----------
route('einstellungen', (view, ctx) => {
  const st = ctx.state;
  const ms = st.milestones ?? [];
  const c = document.createElement('div');
  c.className = 'card';
  c.innerHTML = `<div class="chead violett"><span class="csym"><svg aria-hidden="true"><use href="assets/icons/sprite.svg#icon-nav-einstellungen"/></svg></span><span class="t"><h3>Einstellungen</h3><span class="sub">Lernprofil — nachträglich änderbar; die Soll-Kurve zieht automatisch nach</span></span></div>
    <div class="formular">
    <label class="feld"><span class="feld-name">Minuten pro Tag</span><input id="s-min" type="number" min="10" max="480" value="${st.pace?.minutesPerDay ?? 45}"></label>
    <label class="feld"><span class="feld-name">Lerntage pro Woche</span><input id="s-days" type="number" min="1" max="7" value="${st.pace?.daysPerWeek ?? 5}"></label>
    <label class="feld"><span class="feld-name">Wochenziel (Tage mit Lernen)</span><input id="s-goal" type="number" min="1" max="7" value="${st.week?.goalDays ?? 5}"></label>
    <label class="feld"><span class="feld-name">Meilenstein 1 (Datum)</span><input id="s-m1" type="date" value="${ms[0]?.date ?? ''}"></label>
    <label class="feld"><span class="feld-name">Meilenstein 2 (Datum)</span><input id="s-m2" type="date" value="${ms[1]?.date ?? ''}"></label>
    </div>
    <div class="formular-fuss"><span class="dim" id="s-msg"></span><button class="btn-primary" id="s-save">Speichern</button></div>
    <p class="dim fussnote">Rechtsstand ${LEGAL_STATE.replace('Rechtsstand ', '')} · Bewertungs-Regime wechselt bei Modell-/Rubrik-Änderung automatisch in eine neue Score-Serie (#17).</p>`;
  view.appendChild(c);
  c.querySelector('#s-save').onclick = () => {
    st.pace = { minutesPerDay: +c.querySelector('#s-min').value, daysPerWeek: +c.querySelector('#s-days').value };
    st.week = { ...(st.week ?? {}), goalDays: +c.querySelector('#s-goal').value };
    const m1 = c.querySelector('#s-m1').value, m2 = c.querySelector('#s-m2').value;
    st.milestones = [m1 && { label: ms[0]?.label ?? 'Meilenstein 1', date: m1 }, m2 && { label: ms[1]?.label ?? 'Meilenstein 2', date: m2 }].filter(Boolean);
    ctx.saveState();
    c.querySelector('#s-msg').textContent = 'Gespeichert — Kurve und Wochenziel nutzen ab jetzt die neuen Werte.';
  };
});
