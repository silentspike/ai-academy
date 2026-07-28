// app/onboarding.js — setup wizard for the share version, orchestrated by the app:
// Verbinden → Fachprofil → Lernprofil → Machbarkeits-Check → Personalisierung
// (strukturierte Prompts, JSON-validiert, Retry) → Placement → Los.
// A prepared profile skips the wizard: it comes from data/profiles/ via /api/profile.
import { route } from './router.js';
import { LlmAdapter } from './llm-adapter.js';
import { feasibilityCheck, stoffUmfang } from './pacing.js';
import { einheitenGesamt } from './content-index.js';
import { setzeSetupModus } from './app.js';

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
      errors.push(`szenario_einkleidung ${s.scenario_id}: Feld '${k}' darf die Oberfläche nicht verlassen`);
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
    view.appendChild(card(`<div class="chead violett"><span class="csym"><svg aria-hidden="true"><use href="assets/icons/sprite.svg#icon-act-play"/></svg></span><span class="t"><h3>Onboarding — Schritt ${draft.step + 1}/7: ${steps[draft.step]}</h3>
      <span class="sub">${steps.map((s, i) => i === draft.step ? `<b>${s}</b>` : s).join(' · ')}</span></span></div>`));
    STEPS[draft.step]();
  };
  // Die Seitenleiste zeigt dieselben Schritte und muss mitgehen: der globale
  // Renderer läuft nur bei Routenwechseln, ein Schritt im Wizard ist keiner.
  // Ohne das stand links „Verbinden", während rechts Schritt 2 zu sehen war.
  const next = () => { draft.step++; ctx.saveState(); setzeSetupModus(ctx); render(); };
  const zurueck = (ziel) => { draft.step = ziel; ctx.saveState(); setzeSetupModus(ctx); render(); };

  const STEPS = [
    // 0 Verbinden
    async () => {
      const c = card('<p class="dim">Verbindung zur Local Bridge und zum LLM wird geprüft …</p>');
      view.appendChild(c);
      try {
        const h = await llm.refreshHealth();
        const gate = llm.evaluateGate();
        c.innerHTML = `<div class="verb-status ${gate.frontier ? 'ok' : 'warn'}">
            <span class="verb-punkt" aria-hidden="true"></span>
            <div class="verb-txt"><b>${gate.frontier ? 'Verbunden und prüfungsfähig' : 'Verbunden, aber gesperrt'}</b>
              <span>${gate.frontier ? 'Unterstütztes Frontier-Modell — summative Prüfungen sind freigegeben.' : gate.reason + ' — Prüfungen bleiben gesperrt (docs/INTENDED-PURPOSE.md).'}</span></div>
          </div>
          <dl class="verb-daten">
            <div><dt>Bridge</dt><dd>erreichbar</dd></div>
            <div><dt>CLI</dt><dd class="mono">${h.activeCli ?? '—'}</dd></div>
            <div><dt>Modell</dt><dd class="mono">${h.model ?? '—'}</dd></div>
          </dl>
          <p class="verb-hinweis">Vor der ersten Tutor-Interaktion: Es antwortet ein KI-System (${h.model}); Freitexte gehen an den LLM-Anbieter; Bewertungen können streuen (Art.-50-Transparenz, §5.0).</p>
          <div class="ex-start-zeile"><button class="btn-primary">Weiter</button></div>`;
        c.querySelector('button').onclick = next;
      } catch (e) {
        c.innerHTML = `<p>Bridge nicht erreichbar (${e.message}). Erst <span class="mono">node bridge/bridge.mjs</span> starten (SETUP-AGENT.md), dann neu laden.</p>`;
      }
    },
    // 1 Fachprofil
    () => {
      const f = draft.fachprofil;
      // Der Absatz sagte dreimal, was die Eingabe NICHT tut, in unserem Vokabular
      // („Einkleidung") und gegen eine Befürchtung, die an dieser Stelle niemand hat —
      // er weckte den Verdacht erst, den er ausräumen wollte. Was jedes Feld bewirkt,
      // steht ohnehin darunter in der Feldhilfe.
      const c = card(`<p class="formular-intro">Damit die Beispiele aus deinem Alltag kommen
        und nicht aus einem Lehrbuch. Alles später änderbar.</p>
      <div class="formular">
        <label class="feld feld-breit"><span class="feld-name">Organisation/Branche</span><input id="ob-org" value="${f.organisation ?? ''}" placeholder="z. B. Regionalbank, Krankenhaus, Handelskette"><span class="feld-hilfe">Bestimmt, in welchem Umfeld die Fallbeispiele und Fachgespräche spielen.</span></label>
        <label class="feld"><span class="feld-name">Rolle der Organisation</span><select id="ob-rolle"><option value="betreiber">Betreiber (KI wird eingesetzt)</option><option value="anbieter">Anbieter (KI wird entwickelt)</option><option value="beides">Beides</option></select><span class="feld-hilfe">Entscheidet, welche Pflichtenkapitel Vorrang bekommen.</span></label>
        <label class="feld"><span class="feld-name">Land</span><select id="ob-land"><option>AT</option><option>DE</option><option>EU-sonstig</option></select><span class="feld-hilfe">Wählt das Ländermodul in Phase 9.</span></label>
        <label class="feld"><span class="feld-name">Ihre Job-Rolle</span><input id="ob-job" value="${f.job_rolle ?? ''}" placeholder="z. B. KI-Koordinatorin, IT-Leitung"><span class="feld-hilfe">Bestimmt, mit wem du in den Fachgesprächen sprichst.</span></label>
        <label class="feld"><span class="feld-name">Vorwissen</span><select id="ob-vor"><option value="einsteiger">Einsteiger</option><option value="mittel">Mittel</option><option value="erfahren">Erfahren</option></select><span class="feld-hilfe">Einsteiger sehen erst ein durchgerechnetes Beispiel, Erfahrene starten mit dem Fall.</span></label>
        <label class="feld feld-breit"><span class="feld-name">Fach-Domäne / Datenarten</span><input id="ob-dom" value="${f.domaene ?? ''}" placeholder="z. B. Bonitätsdaten, Patientendaten"><span class="feld-hilfe">Legt fest, welche Datenarten in den Beispielen vorkommen — das ändert die Einstufungsfragen.</span></label>
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
        // Kein Browser-Alert für einen fehlenden Pflichtwert: Er reißt den Nutzer
        // aus der Seite, sagt nicht, WO der Fehler sitzt, und blockiert obendrein
        // jede Automatisierung. Der Hinweis gehört an das Feld.
        const orgFeld = c.querySelector('#ob-org');
        const alterFehler = c.querySelector('.feld-fehler');
        if (alterFehler) alterFehler.remove();
        orgFeld.removeAttribute('aria-invalid');
        if (!draft.fachprofil.organisation) {
          orgFeld.setAttribute('aria-invalid', 'true');
          const hinweis = document.createElement('span');
          hinweis.className = 'feld-fehler';
          hinweis.textContent = 'Bitte eine Organisation oder Branche angeben — daran hängen die Beispiele.';
          orgFeld.closest('.feld').appendChild(hinweis);
          orgFeld.focus();
          return;
        }
        next();
      };
    },
    // 2 Lernprofil
    () => {
      // Vorbelegung aus dem Entwurf: Über „Pensum anpassen" kommt man hierher
      // ZURÜCK — und fand seine Eingaben auf 30 min und 4 Tage zurückgesetzt,
      // weil die Werte fest im Formular standen.
      const lpv = draft.lernprofil ?? {};
      const gewaehlt = (v, wert) => v === wert ? ' selected' : '';
      const c = card(`<p class="formular-intro">Daraus entsteht deine Soll-Kurve. Im nächsten
        Schritt rechnet die Akademie nach, ob Ziel und Pensum zusammenpassen — und sagt es,
        wenn nicht.</p>
      <div class="formular">
        <label class="feld"><span class="feld-name">Lernmotiv</span><select id="ob-motiv"><option value="jobstart"${gewaehlt(lpv.motiv, 'jobstart')}>Jobstart</option><option value="pruefung"${gewaehlt(lpv.motiv, 'pruefung')}>Prüfung</option><option value="projekt"${gewaehlt(lpv.motiv, 'projekt')}>Projekt</option><option value="interesse"${gewaehlt(lpv.motiv, 'interesse')}>Interesse</option></select></label>
        <label class="feld"><span class="feld-name">Zieltermin (optional)</span><input id="ob-ziel" type="date" value="${lpv.zieltermine?.[0]?.date ?? ''}"><span class="feld-hilfe" id="ob-ziel-klar">Etwa ein Prüfungstermin oder ein Dienstantritt. Leer lassen, wenn es keinen gibt.</span></label>
        <label class="feld"><span class="feld-name">Minuten pro Tag</span><input id="ob-min" type="number" value="${lpv.minutesPerDay ?? 30}" min="10" max="480"><span class="feld-hilfe">Grundlage der Soll-Kurve. Ehrlich schätzen — die Rechnung im nächsten Schritt hängt daran.</span></label>
        <label class="feld"><span class="feld-name">Lerntage pro Woche</span><input id="ob-tage" type="number" value="${lpv.daysPerWeek ?? 4}" min="1" max="7"><span class="feld-hilfe">Auch das Wochenziel richtet sich danach.</span></label>
      </div>
      <div class="formular-fuss"><button class="btn-primary">Weiter</button></div>`);
      view.appendChild(c);
      // Das Datumsfeld zeigt sein Format nach der Browsersprache — auf einem
      // englischen Chrome „mm/dd/yyyy". Der ausgeschriebene Tag darunter zeigt,
      // welches Datum tatsächlich angekommen ist.
      const zielFeld = c.querySelector('#ob-ziel');
      const zielKlar = c.querySelector('#ob-ziel-klar');
      const zeigeDatum = () => {
        if (!zielFeld.value) {
          zielKlar.textContent = 'Etwa ein Prüfungstermin oder ein Dienstantritt. Leer lassen, wenn es keinen gibt.';
          return;
        }
        zielKlar.textContent = new Date(zielFeld.value + 'T12:00:00')
          .toLocaleDateString('de-AT', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
      };
      zielFeld.addEventListener('change', zeigeDatum);
      zeigeDatum();
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
    // 3 Machbarkeits-Check — die ehrliche Rechnung
    //
    // Drei Fehler steckten hier übereinander, und jeder allein hätte gereicht:
    // `feasibilityCheck` liefert ein ARRAY (ein Eintrag je Meilenstein), gelesen
    // wurde `res.feasible` — auf einem Array immer undefined, also immer der
    // Warn-Zweig, egal wie großzügig das Pensum war. Das Feld heißt
    // `neededMinutesPerDay`, gelesen wurde `neededPerDay` → „~undefined min/Tag".
    // Und der Stoff wurde als `{ totalMinutes }` übergeben, gelesen werden
    // `totalUnits` und `minutesPerUnit` → die Rechnung lief auf NaN.
    async () => {
      const lp = draft.lernprofil;
      const UNITS = await einheitenGesamt();
      const stoff = stoffUmfang(UNITS);
      const ziel = lp.zieltermine[0]?.date;
      let html = '<p>Kein Zieltermin — die Lernkurve läuft ohne Termindruck.</p>';
      if (ziel) {
        const [res] = feasibilityCheck({ ...lp, milestones: [{ id: 'ziel', label: 'dein Ziel', date: ziel, share: 1 }] }, stoff, Date.now());
        const std = m => (m / 60).toFixed(1).replace('.', ',');
        const tage = Math.max(0, Math.ceil((Date.parse(ziel) - Date.now()) / 86400000));
        const datum = new Date(ziel).toLocaleDateString('de-AT', { day: '2-digit', month: 'long', year: 'numeric' });
        // Die Rechnung offenlegen: Ohne sie weiß niemand, WAS an seiner Eingabe
        // nicht passt — und ob er am Termin, am Pensum oder an den Lerntagen dreht.
        const rechnung = `<ul class="feas-rechnung">
            <li>Bis ${datum}: <b>${tage} Tage</b>, bei ${lp.daysPerWeek} Lerntagen pro Woche sind das rund ${Math.round(tage * lp.daysPerWeek / 7)} Lerntage.</li>
            <li>Dein Pensum: ${lp.minutesPerDay} min → <b>${std(res.availableMinutes)} Stunden</b> verfügbar.</li>
            <li>Der Stoff: ${UNITS} Einheiten samt Fragen, Wiederholung und Prüfungen → <b>${std(res.requiredMinutes)} Stunden</b> nötig.</li>
          </ul>`;
        html = res.feasible
          ? `<p>✓ <b>Machbar.</b> ~${res.neededMinutesPerDay} min/Tag würden reichen, du hast ${lp.minutesPerDay} eingeplant.</p>${rechnung}`
          : `<p>⚠ <b>Das geht sich nicht aus.</b> Es fehlen rund <b>${std(res.requiredMinutes - res.availableMinutes)} Stunden</b>: Für dein Ziel bräuchtest du <b>~${res.neededMinutesPerDay} min/Tag</b>, geplant sind ${lp.minutesPerDay}.</p>${rechnung}
             <p class="dim">Drei Stellschrauben: späterer Termin, mehr Minuten pro Tag oder mehr Lerntage pro Woche.</p>`;
      }
      const c = card(html + `<div class="formular-fuss">
        <button class="btn" id="mb-zurueck">Pensum anpassen</button>
        <button class="btn-primary" id="mb-weiter">Weiter</button></div>`);
      view.appendChild(c);
      // Zurück ins Lernprofil: Dort stehen Termin, Minuten und Lerntage — die
      // drei Werte, an denen diese Rechnung hängt.
      c.querySelector('#mb-zurueck').onclick = () => zurueck(2);
      c.querySelector('#mb-weiter').onclick = next;
    },
    // 4 Personalisierung (app-orchestriert, JSON-validiert, Retry)
    async () => {
      const c = card('<p class="dim">Personalisierung läuft — strukturierte Prompts an dein LLM, Antworten werden validiert …</p>');
      view.appendChild(c);
      const callLlm = payload => llm.personalize(payload);
      const res = await personalizeWithRetry(callLlm, { fachprofil: draft.fachprofil, lernprofil: draft.lernprofil });
      if (res.ok) {
        draft.personalisierung = res.data;
        c.innerHTML = `<p>✓ Fertig zugeschnitten: Beispiele, Fälle und Gesprächspartner spielen jetzt in deinem Umfeld. Deine Endstufe heißt „${res.data.level_endtitel}".</p><button class="btn-primary">Weiter</button>`;
      } else {
        c.innerHTML = `<p>Personalisierung nach ${res.attempts} Versuchen invalide (${res.errors.slice(0, 2).join('; ')}). Du kannst mit generischem Profil starten und später erneut personalisieren.</p><button class="btn-primary">Ohne Personalisierung weiter</button>`;
      }
      c.querySelector('button').onclick = next;
    },
    // 5 placement (recommendations only)
    () => {
      const c = card('<p>20 Fragen quer durch alle Phasen (~15 min) — Ergebnis sind Startempfehlungen; eine Einheit überspringst du nur mit einem bestandenen Challenge-Test.</p><button class="btn-primary" id="ob-pl">Placement starten</button> <button class="btn" id="ob-skip">Überspringen</button>');
      view.appendChild(c);
      c.querySelector('#ob-pl').onclick = () => { finishProfile(); location.hash = '#/placement'; };
      c.querySelector('#ob-skip').onclick = () => next();
    },
    // 6 Los
    () => {
      finishProfile();
      const c = card('<h3>Fertig!</h3><p>Beispiele, Fälle und dein Zeitplan sind auf dich zugeschnitten.</p><button class="btn-primary">Zum Dashboard</button>');
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
    // Also on ctx, not only in the record: setup mode is decided by ctx.profile,
    // and that is filled from the record once at startup. Without this line the
    // wizard would finish and every route would bounce straight back into it.
    ctx.profile = ctx.state.profile;
    ctx.saveState();
  }

  render();
});
