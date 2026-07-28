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

  // Ein Symbol je Schritt statt des allgemeinen Abspiel-Zeichens für alle sieben:
  // Das Platzhalter-Symbol sagt „irgendein Ablauf", nicht „hier verbindest du dich".
  const SYMBOLE = ['icon-fach-ki', 'icon-fach-behoerde', 'icon-st-kalender',
                   'icon-st-ziel', 'icon-act-edit', 'icon-nav-pruefung', 'icon-act-play'];
  const render = () => {
    view.innerHTML = '';
    // Fortschritt als Bild, nicht als „Schritt 4/7" im Text (Vorgabe: das Produkt
    // spricht sonst in füllenden Balken und Ringen).
    const anteil = Math.round((draft.step + 1) / steps.length * 100);
    view.appendChild(card(`<div class="chead violett"><span class="csym"><svg aria-hidden="true"><use href="assets/icons/sprite.svg#${SYMBOLE[draft.step] ?? 'icon-act-play'}"/></svg></span><span class="t"><h3>Einrichtung — ${steps[draft.step]}</h3>
      <span class="sub">${steps.map((s, i) => i === draft.step ? `<b>${s}</b>` : s).join(' · ')}</span></span></div>
      <div class="ob-fortschritt" role="img" aria-label="Schritt ${draft.step + 1} von ${steps.length}">
        <i style="width:${anteil}%"></i><span>Schritt ${draft.step + 1} von ${steps.length}</span></div>`));
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
              <span>${gate.frontier ? 'Unterstütztes Modell — die Prüfungen dieser Akademie zählen.' : gate.reason + '. Lernen geht, aber Prüfungen bleiben zu — die Bridge mit einem unterstützten Modell neu starten, dann hier weiter.'}</span></div>
          </div>
          <dl class="verb-daten">
            <div><dt>Bridge</dt><dd>erreichbar</dd></div>
            <div><dt>CLI</dt><dd class="mono">${h.activeCli ?? '—'}</dd></div>
            <div><dt>Modell</dt><dd class="mono">${h.model ?? '—'}</dd></div>
          </dl>
          <p class="verb-hinweis">Hier antwortet ein KI-System (${h.model}). Was du als Freitext schreibst, geht zur Bewertung an dieses Modell, und seine Bewertungen können schwanken.</p>
          <div class="ex-start-zeile"><button class="btn-primary">Weiter</button></div>`;
        c.querySelector('button').onclick = next;
      } catch (e) {
        // Der Ausfall stand als grauer Fließtext da: ohne Titel, ohne Farbe, ohne
        // Symbol, mit „Failed to fetch" und einem Repo-Dateinamen — und ohne einen
        // Knopf, mit dem man weiterkommt. Ein Totalausfall ist ein Zustand und
        // muss auch so aussehen.
        c.innerHTML = `<div class="lage lage-fehler">
            <span class="lage-symbol"><svg aria-hidden="true"><use href="assets/icons/sprite.svg#icon-st-warn"/></svg></span>
            <div class="lage-txt">
              <h3>Keine Verbindung zur Akademie</h3>
              <p>Das Hintergrundprogramm antwortet nicht. Ohne sie kann die Akademie weder
              Fragen bewerten noch deinen Lernstand speichern.</p>
              <p class="dim">Starte die Akademie neu — beim mitgelieferten Paket über
              <span class="mono">start.sh</span> beziehungsweise <span class="mono">start.bat</span>.
              Läuft sie schon, hilft meist ein neuer Versuch.</p>
            </div>
          </div>
          <div class="ex-start-zeile"><button class="btn-primary" id="ob-retry">Erneut versuchen</button></div>`;
        c.querySelector('#ob-retry').onclick = () => render();
      }
    },
    // 1 Fachprofil
    () => {
      const f = draft.fachprofil;
      // Der Absatz sagte dreimal, was die Eingabe NICHT tut, in unserem Vokabular
      // („Einkleidung") und gegen eine Befürchtung, die an dieser Stelle niemand hat —
      // er weckte den Verdacht erst, den er ausräumen wollte. Was jedes Feld bewirkt,
      // steht ohnehin darunter in der Feldhilfe.
      const c = card(`<div class="chead"><span class="csym"><svg aria-hidden="true"><use href="assets/icons/sprite.svg#icon-fach-behoerde"/></svg></span><span class="t"><h3>Dein Umfeld</h3>
        <span class="sub">Damit die Beispiele aus deinem Alltag kommen und nicht aus einem Lehrbuch — alles später änderbar</span></span></div>
      <div class="formular">
        <label class="feld feld-breit"><span class="feld-name">Organisation/Branche</span><input id="ob-org" value="${f.organisation ?? ''}" placeholder="z. B. Regionalbank, Krankenhaus, Handelskette"><span class="feld-hilfe">Bestimmt, in welchem Umfeld die Fallbeispiele und Fachgespräche spielen.</span></label>
        <label class="feld"><span class="feld-name">Rolle der Organisation</span><select id="ob-rolle"><option value="betreiber">Betreiber (KI wird eingesetzt)</option><option value="anbieter">Anbieter (KI wird entwickelt)</option><option value="beides">Beides</option></select><span class="feld-hilfe">Entscheidet, welche Pflichtenkapitel Vorrang bekommen.</span></label>
        <label class="feld"><span class="feld-name">Land</span><select id="ob-land"><option>AT</option><option>DE</option><option>EU-sonstig</option></select><span class="feld-hilfe">Wählt das Ländermodul in Phase 9.</span></label>
        <label class="feld"><span class="feld-name">Ihre Job-Rolle</span><input id="ob-job" value="${f.job_rolle ?? ''}" placeholder="z. B. KI-Koordinatorin, IT-Leitung"><span class="feld-hilfe">Bestimmt, mit wem du in den Fachgesprächen sprichst.</span></label>
        <label class="feld"><span class="feld-name">Vorwissen</span><select id="ob-vor"><option value="einsteiger">Einsteiger</option><option value="mittel">Mittel</option><option value="erfahren">Erfahren</option></select><span class="feld-hilfe">Einsteiger sehen erst ein durchgerechnetes Beispiel, Erfahrene starten mit dem Fall.</span></label>
        <label class="feld feld-doppelt"><span class="feld-name">Fach-Domäne / Datenarten</span><input id="ob-dom" value="${f.domaene ?? ''}" placeholder="z. B. Bonitätsdaten, Patientendaten"><span class="feld-hilfe">Legt fest, welche Datenarten in den Beispielen vorkommen — das ändert die Einstufungsfragen.</span></label>
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
          // Symbol statt nur Farbe: Der Fehler soll im Überfliegen auffindbar sein,
          // nicht erst beim Lesen — und er trägt dasselbe Warnzeichen wie die
          // Lage-Karten, damit ein Zustand überall gleich aussieht.
          hinweis.innerHTML = '<svg aria-hidden="true"><use href="assets/icons/sprite.svg#icon-st-warn"/></svg>'
            + '<span>Bitte eine Organisation oder Branche angeben — daran hängen die Beispiele.</span>';
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
      const c = card(`<div class="chead"><span class="csym"><svg aria-hidden="true"><use href="assets/icons/sprite.svg#icon-st-kalender"/></svg></span><span class="t"><h3>Dein Zeitrahmen</h3>
        <span class="sub">Daraus entsteht deine Soll-Kurve — im nächsten Schritt rechnet die Akademie nach, ob Ziel und Pensum zusammenpassen</span></span></div>
      <div class="formular formular-zwei">
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
      // Ohne Zieltermin stand hier nur ein Satz und zwei Knöpfe — ein Leerzustand,
      // der nichts sagt. Die Daten für eine nützliche Auskunft sind vorhanden:
      // Wie groß ist der Stoff, und wie lange dauert er bei diesem Pensum?
      const stdOhne = m => (m / 60).toFixed(1).replace('.', ',');
      const proWoche = Math.max(1, (lp.minutesPerDay ?? 30) * (lp.daysPerWeek ?? 4));
      const wochen = Math.ceil((stoff.totalUnits * stoff.minutesPerUnit) / proWoche);
      let html = `<div class="chead"><span class="csym"><svg aria-hidden="true"><use href="assets/icons/sprite.svg#icon-st-uhr"/></svg></span><span class="t"><h3>Ohne Termindruck</h3>
        <span class="sub">Kein Zieltermin gesetzt — die Kurve läuft ohne Stichtag</span></span></div>
        <div class="mb-lage gut">
          <div class="mb-kern"><b>${wochen}</b><span>Wochen bis zum Ende</span></div>
          <div class="mb-vergleich">
            <div class="mb-zeile"><span class="mb-name">Der Stoff braucht</span>
              <span class="mb-spur"><i class="mb-noetig" style="width:100%"></i></span>
              <span class="mb-wert">${stdOhne(stoff.totalUnits * stoff.minutesPerUnit)} h</span></div>
            <div class="mb-zeile"><span class="mb-name">Pro Woche schaffst du</span>
              <span class="mb-spur"><i class="mb-hab" style="width:${Math.min(100, Math.round(proWoche / (stoff.totalUnits * stoff.minutesPerUnit) * 100))}%"></i></span>
              <span class="mb-wert">${stdOhne(proWoche)} h</span></div>
          </div>
        </div>
        <p class="mb-fuss">Bei <b>${lp.minutesPerDay} Minuten</b> an <b>${lp.daysPerWeek} Tagen</b> pro Woche.
          Einen Termin kannst du jederzeit in den Einstellungen nachtragen.</p>`;
      if (ziel) {
        const [res] = feasibilityCheck({ ...lp, milestones: [{ id: 'ziel', label: 'dein Ziel', date: ziel, share: 1 }] }, stoff, Date.now());
        const std = m => (m / 60).toFixed(1).replace('.', ',');
        const tage = Math.max(0, Math.ceil((Date.parse(ziel) - Date.now()) / 86400000));
        const datum = new Date(ziel).toLocaleDateString('de-AT', { day: '2-digit', month: 'long', year: 'numeric' });
        // Der Vergleich ist ein BILD, keine Aufzählung: „267,4 verfügbar gegen 40,0
        // nötig" sagt als Zahlenpaar im Fließtext nichts, als zwei Balken auf einer
        // Skala alles. Beide Zustände nutzen dieselbe Darstellung — im Fehlfall
        // bleibt der zweite Balken sichtbar kürzer, und die Lücke trägt Farbe.
        const skala = Math.max(res.requiredMinutes, res.availableMinutes) || 1;
        const anteil = m => Math.max(2, Math.round(m / skala * 100));
        const kernzahl = res.feasible
          ? { wert: std(res.availableMinutes - res.requiredMinutes), einheit: 'Stunden Puffer', klasse: 'gut' }
          : { wert: std(res.requiredMinutes - res.availableMinutes), einheit: 'Stunden fehlen', klasse: 'knapp' };
        html = `<div class="chead${res.feasible ? '' : ' warnung'}"><span class="csym"><svg aria-hidden="true"><use href="assets/icons/sprite.svg#icon-st-${res.feasible ? 'ziel' : 'warn'}"/></svg></span><span class="t"><h3>${res.feasible ? 'Dein Plan geht auf' : 'Dein Plan geht sich nicht aus'}</h3>
            <span class="sub">${res.feasible
              ? `~${res.neededMinutesPerDay} min pro Tag würden reichen — du hast ${lp.minutesPerDay} eingeplant`
              : `Für dein Ziel bräuchtest du ~${res.neededMinutesPerDay} min pro Tag — geplant sind ${lp.minutesPerDay}`}</span></span></div>
          <div class="mb-lage ${kernzahl.klasse}">
            <div class="mb-kern"><b>${kernzahl.wert}</b><span>${kernzahl.einheit}</span></div>
            <div class="mb-vergleich">
              <div class="mb-zeile">
                <span class="mb-name">Der Stoff braucht</span>
                <span class="mb-spur"><i class="mb-noetig" style="width:${anteil(res.requiredMinutes)}%"></i></span>
                <span class="mb-wert">${std(res.requiredMinutes)} h</span>
              </div>
              <div class="mb-zeile">
                <span class="mb-name">Du hast Zeit für</span>
                <span class="mb-spur"><i class="mb-hab" style="width:${anteil(res.availableMinutes)}%"></i></span>
                <span class="mb-wert">${std(res.availableMinutes)} h</span>
              </div>
            </div>
          </div>
          <p class="mb-fuss">Bis ${datum} sind es <b>${tage} Tage</b> — bei ${lp.daysPerWeek} Lerntagen pro Woche rund
            <b>${Math.round(tage * lp.daysPerWeek / 7)} Lerntage</b> à ${lp.minutesPerDay} Minuten.</p>
          ${res.feasible ? '' : '<p class="dim">Drei Stellschrauben: späterer Termin, mehr Minuten pro Tag oder mehr Lerntage pro Woche.</p>'}`;
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
      // Wartezustand: stand als grauer Satz in unserem Vokabular da („strukturierte
      // Prompts", „validiert") und ohne jede Bewegung — was arbeitet, muss man sehen,
      // sonst wirkt es hängengeblieben.
      const c = card(`<div class="chead"><span class="csym"><svg aria-hidden="true"><use href="assets/icons/sprite.svg#icon-act-edit"/></svg></span><span class="t"><h3>Wird auf dich zugeschnitten</h3>
        <span class="sub">Dein Modell schreibt gerade die Beispiele, Fälle und Gesprächspartner für dein Umfeld um</span></span></div>
        <div class="warte"><i></i><i></i><i></i><span>Das dauert meist zehn bis dreißig Sekunden.</span></div>`);
      view.appendChild(c);
      const callLlm = payload => llm.personalize(payload);
      const res = await personalizeWithRetry(callLlm, { fachprofil: draft.fachprofil, lernprofil: draft.lernprofil });
      if (res.ok) {
        draft.personalisierung = res.data;
        // Erfolgszustand: stand als grauer Satz mit einem Text-Häkchen da. Der
        // Zuschnitt ist der Moment, in dem aus dem Kurs „deiner" wird — der darf
        // man ansehen, dass er geglückt ist.
        c.innerHTML = `<div class="chead"><span class="csym"><svg aria-hidden="true"><use href="assets/icons/sprite.svg#icon-st-check"/></svg></span><span class="t"><h3>Fertig zugeschnitten</h3>
            <span class="sub">Beispiele, Fälle und Gesprächspartner spielen ab jetzt in deinem Umfeld</span></span></div>
          <div class="mb-lage gut">
            <div class="mb-kern"><b>${res.data.relevanz_overrides.length + res.data.beispiel_einkleidungen.length + res.data.szenario_einkleidungen.length}</b><span>Stellen angepasst</span></div>
            <div class="perso-titel">
              <span class="dim">Deine Endstufe heißt</span>
              <b>${res.data.level_endtitel}</b>
            </div>
          </div>
          <div class="formular-fuss"><button class="btn-primary">Weiter</button></div>`;
      } else {
        // Fehlpfad: „Personalisierung nach 3 Versuchen invalide (…)" ist eine
        // Entwicklermeldung. Der Nutzer braucht: was ist passiert, was heißt das für
        // ihn, wie geht es weiter — und die technische Ursache nur zum Aufklappen.
        c.innerHTML = `<div class="lage lage-warnung">
            <span class="lage-symbol"><svg aria-hidden="true"><use href="assets/icons/sprite.svg#icon-st-warn"/></svg></span>
            <div class="lage-txt">
              <h3>Der Zuschnitt hat nicht geklappt</h3>
              <p>Dein Modell hat nach ${res.attempts} Versuchen keine brauchbare Antwort geliefert.
              Du kannst trotzdem loslegen — dann sind die Beispiele allgemein gehalten statt aus
              deinem Umfeld. Nachholen kannst du es jederzeit in den Einstellungen.</p>
              <details class="lage-detail"><summary>Was genau schiefging</summary>
                <p class="mono">${res.errors.slice(0, 2).join('; ')}</p></details>
            </div>
          </div>
          <div class="formular-fuss"><button class="btn-primary">Ohne Zuschnitt weiter</button></div>`;
      }
      c.querySelector('button').onclick = next;
    },
    // 5 placement (recommendations only)
    () => {
      const c = card(`<div class="chead"><span class="csym"><svg aria-hidden="true"><use href="assets/icons/sprite.svg#icon-nav-pruefung"/></svg></span><span class="t"><h3>Wo stehst du schon?</h3>
          <span class="sub">20 Fragen quer durch alle Phasen, etwa 15 Minuten</span></span></div>
        <p>Das Ergebnis sind Startempfehlungen — übersprungen wird eine Einheit erst nach einem
        bestandenen Challenge-Test. Du kannst den Test auch auslassen und einfach vorne anfangen.</p>
        <div class="formular-fuss"><button class="btn" id="ob-skip">Überspringen</button>
          <button class="btn-primary" id="ob-pl">Placement starten</button></div>`);
      view.appendChild(c);
      c.querySelector('#ob-pl').onclick = () => { finishProfile(); location.hash = '#/placement'; };
      c.querySelector('#ob-skip').onclick = () => next();
    },
    // 6 Los
    () => {
      finishProfile();
      // Der Abschluss der Einrichtung war ein Wort und ein Knopf. Er ist aber der
      // Moment, in dem aus einem Werkzeug „deins" wird — also fasst er zusammen,
      // was jetzt gilt, statt es nur zu behaupten.
      const fp = draft.fachprofil ?? {}, lp2 = draft.lernprofil ?? {};
      const zielDatum = lp2.zieltermine?.[0]?.date
        ? new Date(lp2.zieltermine[0].date + 'T12:00:00').toLocaleDateString('de-AT', { day: '2-digit', month: 'long', year: 'numeric' })
        : null;
      const c = card(`<div class="chead"><span class="csym"><svg aria-hidden="true"><use href="assets/icons/sprite.svg#icon-st-check"/></svg></span><span class="t"><h3>Eingerichtet</h3>
          <span class="sub">Das gilt ab jetzt — änderbar in den Einstellungen</span></span></div>
        <div class="los-fakten">
          <div><span>Umfeld</span><b>${fp.organisation || 'allgemein'}</b></div>
          <div><span>Pensum</span><b>${lp2.minutesPerDay ?? 30} min an ${lp2.daysPerWeek ?? 4} Tagen</b></div>
          <div><span>Ziel</span><b>${zielDatum ?? 'ohne Termin'}</b></div>
          <div><span>Endstufe</span><b>${draft.personalisierung?.level_endtitel ?? 'KI-Spezialist'}</b></div>
        </div>
        <div class="formular-fuss"><button class="btn-primary">Zum ersten Lerntag</button></div>`);
      view.appendChild(c);
      c.querySelector('button').onclick = () => { location.hash = '#/heute'; };
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
