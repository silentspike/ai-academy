// app/onboarding.js — setup wizard for the share version, orchestrated by the app:
// Verbinden → Fachprofil → Lernprofil → Machbarkeits-Check → Personalisierung
// (strukturierte Prompts, JSON-validiert, Retry) → Placement → Los.
// A prepared profile skips the wizard: it comes from data/profiles/ via /api/profile.
import { route } from './router.js';
import { LlmAdapter } from './llm-adapter.js';
import { feasibilityCheck } from './pacing.js';

// ---------------------------------------------------------------- Personalisierungs-Validierung
// Core rule: model answers enter the data structures ONLY after machine-readable
// Datenstrukturen. Reine Funktion — in Node testbar (tools/onboarding-tests.mjs).
export function validatePersonalization(obj) {
  const errors = [];
  if (!obj || typeof obj !== 'object') return { ok: false, errors: ['kein Objekt'] };
  if (typeof obj.level_endtitel !== 'string' || obj.level_endtitel.length < 3 || obj.level_endtitel.length > 60)
    errors.push('level_endtitel fehlt/ungültig (3–60 Zeichen)');
  if (!Array.isArray(obj.relevanz_overrides)) errors.push('relevanz_overrides muss Array sein');
  else for (const r of obj.relevanz_overrides) {
    if (!/^(Art\.|Anhang)/.test(r.ref || '')) errors.push(`relevanz_override ohne gültige ref: ${JSON.stringify(r).slice(0, 60)}`);
    if (!['kern', 'relevant', 'landkarte'].includes(r.stufe)) errors.push(`relevanz_override mit ungültiger stufe: ${r.stufe}`);
  }
  if (!Array.isArray(obj.beispiel_einkleidungen)) errors.push('beispiel_einkleidungen muss Array sein');
  else for (const b of obj.beispiel_einkleidungen) {
    if (!b.intent_id || typeof b.text !== 'string' || b.text.length < 10) errors.push(`beispiel_einkleidung unvollständig: ${b.intent_id ?? '?'}`);
  }
  if (!Array.isArray(obj.szenario_einkleidungen)) errors.push('szenario_einkleidungen muss Array sein');
  else for (const s of obj.szenario_einkleidungen) {
    if (!s.scenario_id || !s.org || !s.rolle) errors.push(`szenario_einkleidung unvollständig: ${s.scenario_id ?? '?'}`);
    // Hard surface boundary: ONLY organisation, role and domain vocabulary — legal fields are forbidden
    const verboten = ['facts', 'goals', 'rubric', 'critical', 'phases', 'legal'];
    for (const k of Object.keys(s)) if (verboten.some(v => k.toLowerCase().includes(v)))
      errors.push(`szenario_einkleidung ${s.scenario_id}: Feld '${k}' überschreitet die Oberflächen-Grenze (§5.2)`);
  }
  return { ok: errors.length === 0, errors };
}

/** Personalisation with a validation retry: invalid JSON triggers up to `retries` attempts. */
export async function personalizeWithRetry(callLlm, payload, { retries = 2 } = {}) {
  let lastErrors = [];
  for (let attempt = 0; attempt <= retries; attempt++) {
    const raw = await callLlm(attempt === 0 ? payload : { ...payload, retry_hint: `Vorige Antwort war invalide: ${lastErrors.join('; ')}. Liefere NUR das geforderte JSON-Schema.` });
    const check = validatePersonalization(raw);
    if (check.ok) return { ok: true, data: raw, attempts: attempt + 1 };
    lastErrors = check.errors;
  }
  return { ok: false, errors: lastErrors, attempts: retries + 1 };
}

// ---------------------------------------------------------------- Wizard-UI
const card = html => { const d = document.createElement('div'); d.className = 'card'; d.innerHTML = html; return d; };

route('onboarding', async (view, ctx) => {
  const llm = new LlmAdapter({});
  const draft = ctx.state.onboardingDraft ?? (ctx.state.onboardingDraft = { step: 0, fachprofil: {}, lernprofil: {} });
  const steps = ['Verbinden', 'Fachprofil', 'Lernprofil', 'Machbarkeit', 'Personalisierung', 'Placement', 'Los'];

  const render = () => {
    view.innerHTML = '';
    view.appendChild(card(`<div class="chead"><span class="t"><h3>Onboarding — Schritt ${draft.step + 1}/7: ${steps[draft.step]}</h3>
      <span class="sub">${steps.map((s, i) => i === draft.step ? `<b>${s}</b>` : s).join(' · ')}</span></span></div>`));
    STEPS[draft.step]();
  };
  const next = () => { draft.step++; ctx.saveState(); render(); };

  const STEPS = [
    // 0 Verbinden
    async () => {
      const c = card('<p class="dim">Verbindung zur Local Bridge und zum LLM wird geprüft …</p>');
      view.appendChild(c);
      try {
        const h = await llm.refreshHealth();
        const gate = llm.evaluateGate();
        c.innerHTML = `<p>Bridge erreichbar · CLI: <b>${h.activeCli ?? '—'}</b> · Modell: <b>${h.model ?? '—'}</b></p>
          <p>${gate.frontier ? '✓ Unterstütztes Frontier-Modell' : '✗ ' + gate.reason + ' — Prüfungen bleiben gesperrt (docs/INTENDED-PURPOSE.md)'}</p>
          <p class="dim">Vor der ersten Tutor-Interaktion: Es antwortet ein KI-System (${h.model}); Freitexte gehen an den LLM-Anbieter; Bewertungen können streuen (Art.-50-Transparenz, §5.0).</p>
          <button class="btn-primary">Weiter</button>`;
        c.querySelector('button').onclick = next;
      } catch (e) {
        c.innerHTML = `<p>Bridge nicht erreichbar (${e.message}). Erst <span class="mono">node bridge/bridge.mjs</span> starten (SETUP-AGENT.md), dann neu laden.</p>`;
      }
    },
    // 1 Fachprofil
    () => {
      const f = draft.fachprofil;
      const c = card(`<div class="formular">
        <label class="feld feld-breit"><span class="feld-name">Organisation/Branche</span><input id="ob-org" value="${f.organisation ?? ''}" placeholder="z. B. Regionalbank, Krankenhaus, Handelskette"></label>
        <label class="feld"><span class="feld-name">Rolle der Organisation</span><select id="ob-rolle"><option value="betreiber">Betreiber (KI wird eingesetzt)</option><option value="anbieter">Anbieter (KI wird entwickelt)</option><option value="beides">Beides</option></select></label>
        <label class="feld"><span class="feld-name">Land</span><select id="ob-land"><option>AT</option><option>DE</option><option>EU-sonstig</option></select></label>
        <label class="feld"><span class="feld-name">Ihre Job-Rolle</span><input id="ob-job" value="${f.job_rolle ?? ''}" placeholder="z. B. KI-Koordinatorin, IT-Leitung"></label>
        <label class="feld"><span class="feld-name">Vorwissen</span><select id="ob-vor"><option value="einsteiger">Einsteiger:in (Worked Examples zuerst)</option><option value="mittel">Mittel</option><option value="erfahren">Erfahren (Problem-first)</option></select></label>
        <label class="feld feld-breit"><span class="feld-name">Fach-Domäne / Datenarten</span><input id="ob-dom" value="${f.domaene ?? ''}" placeholder="z. B. Bonitätsdaten, Patientendaten"></label>
      </div>
      <div class="formular-fuss"><button class="btn-primary">Weiter</button></div>`);
      view.appendChild(c);
      c.querySelector('button').onclick = () => {
        draft.fachprofil = {
          organisation: c.querySelector('#ob-org').value.trim(),
          rolle_org: [c.querySelector('#ob-rolle').value],
          land: c.querySelector('#ob-land').value,
          job_rolle: c.querySelector('#ob-job').value.trim(),
          vorwissen: c.querySelector('#ob-vor').value,
          domaene: c.querySelector('#ob-dom').value.trim(),
        };
        if (!draft.fachprofil.organisation) return alert('Organisation fehlt');
        next();
      };
    },
    // 2 Lernprofil
    () => {
      const c = card(`<div class="formular">
        <label class="feld"><span class="feld-name">Lernmotiv</span><select id="ob-motiv"><option value="jobstart">Jobstart</option><option value="pruefung">Prüfung</option><option value="projekt">Projekt</option><option value="interesse">Interesse</option></select></label>
        <label class="feld"><span class="feld-name">Zieltermin (optional)</span><input id="ob-ziel" type="date"></label>
        <label class="feld"><span class="feld-name">Minuten pro Tag</span><input id="ob-min" type="number" value="30" min="10" max="480"></label>
        <label class="feld"><span class="feld-name">Lerntage pro Woche</span><input id="ob-tage" type="number" value="4" min="1" max="7"></label>
      </div>
      <div class="formular-fuss"><button class="btn-primary">Weiter</button></div>`);
      view.appendChild(c);
      c.querySelector('button').onclick = () => {
        const ziel = c.querySelector('#ob-ziel').value;
        draft.lernprofil = {
          motiv: c.querySelector('#ob-motiv').value,
          zieltermine: ziel ? [{ label: 'Ziel', date: ziel }] : [],
          minutesPerDay: +c.querySelector('#ob-min').value,
          daysPerWeek: +c.querySelector('#ob-tage').value,
        };
        next();
      };
    },
    // 3 Machbarkeits-Check (ehrliche Rechnung, §5.1)
    () => {
      const lp = draft.lernprofil;
      const stoff = { totalMinutes: 2400 };            // ~40 h Gesamtstoff (Blueprint-Schätzung)
      const ziel = lp.zieltermine[0]?.date;
      let html = '<p>Kein Zieltermin — Lernkurve läuft ohne Termindruck.</p>';
      if (ziel) {
        const res = feasibilityCheck({ ...lp, milestones: [{ date: ziel, share: 1 }] }, stoff, Date.now());
        html = res.feasible
          ? `<p>✓ Machbar: Für dein Ziel brauchst du ~${res.neededPerDay ?? lp.minutesPerDay} min/Tag — dein Pensum reicht.</p>`
          : `<p>⚠ Ehrliche Rechnung: Für dein Ziel bräuchtest du ~<b>${res.neededPerDay} min/Tag</b> (geplant: ${lp.minutesPerDay}). Ziel verschieben oder Pensum erhöhen?</p>`;
      }
      const c = card(html + '<button class="btn-primary">Weiter</button>');
      view.appendChild(c);
      c.querySelector('button').onclick = next;
    },
    // 4 Personalisierung (app-orchestriert, JSON-validiert, Retry)
    async () => {
      const c = card('<p class="dim">Personalisierung läuft — strukturierte Prompts an dein LLM, Antworten werden validiert …</p>');
      view.appendChild(c);
      const callLlm = payload => llm.personalize(payload);
      const res = await personalizeWithRetry(callLlm, { fachprofil: draft.fachprofil, lernprofil: draft.lernprofil });
      if (res.ok) {
        draft.personalisierung = res.data;
        c.innerHTML = `<p>✓ Personalisierung übernommen (${res.attempts}. Versuch): Endtitel „${res.data.level_endtitel}", ${res.data.relevanz_overrides.length} Relevanz-Anpassungen, ${res.data.beispiel_einkleidungen.length} Beispiel-Einkleidungen, ${res.data.szenario_einkleidungen.length} Szenario-Einkleidungen.</p><button class="btn-primary">Weiter</button>`;
      } else {
        c.innerHTML = `<p>Personalisierung nach ${res.attempts} Versuchen invalide (${res.errors.slice(0, 2).join('; ')}). Du kannst mit generischem Profil starten und später erneut personalisieren.</p><button class="btn-primary">Ohne Personalisierung weiter</button>`;
      }
      c.querySelector('button').onclick = next;
    },
    // 5 placement (recommendations only)
    () => {
      const c = card('<p>20 Fragen quer durch alle Phasen (~15 min) — Ergebnis sind Startempfehlungen; Einheiten-Skips erfordern Challenge-Tests.</p><button class="btn-primary" id="ob-pl">Placement starten</button> <button class="btn" id="ob-skip">Überspringen</button>');
      view.appendChild(c);
      c.querySelector('#ob-pl').onclick = () => { finishProfile(); location.hash = '#/placement'; };
      c.querySelector('#ob-skip').onclick = () => next();
    },
    // 6 Los
    () => {
      finishProfile();
      const c = card('<h3>Fertig!</h3><p>Dein Profil steuert jetzt Beispiele, Szenario-Einkleidung und Zielkurve.</p><button class="btn-primary">Zum Dashboard</button>');
      view.appendChild(c);
      c.querySelector('button').onclick = () => { location.hash = '#/dashboard'; };
    },
  ];

  // Persona selection follows the organisational role: a public-sector deployer talks to
  // a department, a data protection officer and staff representatives; a provider to a customer, a notified body and a CTO.
  const ARCHETYPEN_NACH_ROLLE = {
    betreiber: ['draengler', 'kritischer-pruefer', 'belegschaftsvertretung', 'fuehrungsebene'],
    anbieter: ['kunde-konformitaet', 'notifizierte-stelle', 'cto-vor-release', 'fuehrungsebene'],
    beides: ['draengler', 'kritischer-pruefer', 'kunde-konformitaet', 'cto-vor-release'],
  };

  function finishProfile() {
    if (ctx.state.profile) return;
    ctx.state.profile = {
      id: 'onboarding-' + Date.now(),
      fachprofil: draft.fachprofil,
      lernprofil: draft.lernprofil,
      personalisierung: draft.personalisierung ?? null,
      level_endtitel: draft.personalisierung?.level_endtitel ?? 'KI-Kompetenzträger:in',
      archetypen: ARCHETYPEN_NACH_ROLLE[draft.fachprofil.rolle_org?.[0]] ?? ARCHETYPEN_NACH_ROLLE.betreiber,
    };
    delete ctx.state.onboardingDraft;
    ctx.saveState();
  }

  render();
});
