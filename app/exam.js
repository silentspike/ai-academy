// app/exam.js — exam views: two-part chapter tests, final exam parts A and B,
// placement, remediation, appeal and the personal record of learning.
// The logic lives in exam-core.js (DOM-free, tested); this file is flow and presentation.
import { route } from './router.js';
import { kompetenzName, stufenName, setKompetenzen, PHASEN_NAME } from './competency.js';
import { renderQuestion, applyMode, MODES, escapeHtml } from './engine-quiz.js';

/**
 * Source note for a graded answer. Empty when the assessment made no legal claim
 * — a seal on nothing would be the same lie in the other direction.
 */
async function quellenHinweis(bewertung) {
  try {
    const { ladeRegister, pruefeAntwort } = await import('./quellenpruefung.js');
    const b = pruefeAntwort(bewertung, await ladeRegister());
    if (b.beanstandet.length) {
      return `<p class="coach-unbelegt"><b>Nicht verifiziert:</b> ` +
        b.beanstandet.map(x => (x.text || '(ohne Text)') +
          (x.unbekannt.length ? ` <span class="mono">[${x.unbekannt.join(', ')} nicht im Quellenpaket]</span>`
                              : ' <span class="mono">[ohne Fundstelle]</span>')).join(' · ') + `</p>`;
    }
    return b.geprueft ? `<p class="coach-belegt">${b.geprueft} rechtliche Aussage${b.geprueft === 1 ? '' : 'n'} gegen das Quellenpaket geprüft.</p>` : '';
  } catch { return ''; }
}
import { LlmAdapter } from './llm-adapter.js';
import {
  buildChapterTest, buildExamA, gradeAnswer, evaluateTest, examGate,
  regimeKey, recordScore, nachschulungPlan, placementBuild, placementRecommend,
  buildChallengeTest, PASS_SCORE,
} from './exam-core.js';

const RECHTSSTAND = '2026-07-27';
let _data = null;
async function data() {
  if (_data) return _data;
  const [qc, comp, sc] = await Promise.all([
    fetch('content/questions-core.json').then(r => r.json()),
    fetch('content/competencies.json').then(r => r.json()),
    fetch('content/scenarios.json').then(r => r.json()),
  ]);
  setKompetenzen(comp.kompetenzen);   // Klarnamen fuer die Fragemarken
  return (_data = { pool: qc.questions, kompetenzen: comp.kompetenzen, scenarios: sc.scenarios });
}

function card(html) { const d = document.createElement('div'); d.className = 'card'; d.innerHTML = html; return d; }

// Ein Frage-Ablauf: rendert questions nacheinander, sammelt Ergebnisse.
// Deterministic types grade immediately; free text goes through the bridge, transactionally.
async function runQuestions(view, questions, { mode, kind, llm, onDone }) {
  const results = [];
  let i = 0;
  // Ein zweiter Klick auf dieselbe Frage (Doppelklick, oder Antwort und
  // Sicherheits-Abfrage kurz hintereinander) plante `step` ein zweites Mal ein.
  // Folge: `i` lief ueber das Ende hinaus und `onDone` feuerte mehrfach — im Bild
  // stand die Ergebniskarte DREIMAL untereinander, samt drei „Neuer Antritt"-Knoepfen.
  let fertig = false;
  let beantwortet = -1;
  const mount = document.createElement('div');
  view.appendChild(mount);
  // Assessment and appeal cards survive moving to the next question: the mount is
  // cleared per step, which used to make the appeal button unreachable.
  const resultsArea = document.createElement('div');
  resultsArea.className = 'exam-results-area';
  view.appendChild(resultsArea);
  const step = () => {
    mount.innerHTML = '';
    if (i >= questions.length) { if (!fertig) { fertig = true; onDone(results); } return; }
    const q = questions[i];
    // Counter and question on ONE surface — as two cards they read as unrelated
    // blocks, and only the first one was inside the reading column.
    const head = card(`<div class="q-fortschritt" role="img" aria-label="Frage ${i + 1} von ${questions.length}"><i style="width:${Math.round((i + 1) / questions.length * 100)}%"></i></div>
      <div class="q-meta"><span class="q-zaehler">Frage ${i + 1}<i>/${questions.length}</i></span>
      <span class="q-marken"><span class="q-marke">${kompetenzName(q.competency)}</span><span class="q-marke">${stufenName(q.level)}</span>${mode === 'exam' ? '<span class="q-marke streng">ohne Hilfsmittel</span>' : mode === 'open' ? '<span class="q-marke">Verordnungstext erlaubt</span>' : ''}</span></div>`);
    mount.appendChild(head);
    const qm = document.createElement('div');
    head.appendChild(qm);
    renderQuestion(qm, q, {
      onAnswered: async (res, conf) => {
        if (beantwortet === i) return;   // dieselbe Frage nur einmal zaehlen
        beantwortet = i;
        if (res.verdict === 'pending_agent') {
          qm.insertAdjacentHTML('beforeend', '<p class="dim">Bewertung läuft (frischer Prüfer-Aufruf)…</p>');
          try {
            const out = await llm.grade({
              question: q.prompt, rubric: JSON.stringify(q.rubric || ''), modelAnswer: q.model_answer || '',
              answer: res.answerText, kind,
            });
            const r = out.result ?? out;
            results.push({ score: r.score, max: r.max || 10, critical: !!r.critical_error, confidence: conf, txId: out.txId, feedback: r.feedback });
            // Appeal: a fresh second assessor WITHOUT the first assessment in the prompt
            const lab = out.label ? `<span class="grade-label mono">Bewertungstyp: ${out.label.type} · ${out.label.model} · Rubrik ${out.label.rubricVersion} · Rechtsstand 27.7.2026</span>` : '';
            // Same rule as in the units: a legal statement in the assessment is
            // checked against the shipped provisions, and an unsourced one says so.
            // It matters more here than anywhere else — this text explains a mark.
            const quellen = await quellenHinweis(r);
            // Die Bewertung begann mit „2/10 — " im Fliesstext. Die Punktzahl ist
            // die Kernzahl dieser Karte und gehoert entsprechend gesetzt.
            const fb = card(`<div class="bew-kopf"><span class="bew-wert"><b>${r.score}</b><span>von ${r.max || 10}</span></span>
                <p class="bew-text">${r.feedback ?? ''}</p></div>${quellen}${lab}
              <details class="bew-einspruch"><summary>Einspruch einlegen</summary>
              <p class="feld-hilfe">Eine zweite Bewertung entscheidet neu — sie sieht deine Antwort und die Aufgabenstellung, aber nicht die erste Bewertung.</p>
              <textarea class="q-freetext" rows="2" placeholder="Woran ist die Bewertung deiner Ansicht nach vorbeigegangen?"></textarea>
              <div class="formular-fuss"><button class="btn">Einspruch abschicken</button></div>
              <span class="dim" style="display:block"></span></details>`);
            resultsArea.appendChild(fb);
            fb.querySelector('button').onclick = async ev => {
              ev.target.disabled = true;
              const out2 = await llm.appeal({ question: q.prompt, rubric: JSON.stringify(q.rubric || ''), modelAnswer: q.model_answer || '', answer: res.answerText, appealReason: fb.querySelector('textarea').value, kind: 'appeal' }).catch(e => ({ error: e.message }));
              const r2 = out2.result ?? out2;
              const granted = !out2.error && (r2.score ?? 0) > (r.score ?? 0);
              fb.querySelector('details span').textContent = out2.error ? `Einspruch fehlgeschlagen: ${out2.error}` :
                `Zweitprüfung: ${r2.score}/${r2.max || 10} — ${granted ? 'STATTGEGEBEN (Punkte korrigiert; Frage zur Review markiert)' : 'Erstbewertung bestätigt'}`;
              if (granted) { results[results.length - 1].score = r2.score; results[results.length - 1].appealed = true; }
              (window.__akademieCtx?.state?.appeals ?? []).push?.({ q: q.id, granted, ts: Date.now() });
            };
          } catch (e) {
            // Transactional safeguard: the answer is stored by the bridge, the attempt is not consumed.
            resultsArea.appendChild(card(`<p class="dim">Bewertung technisch fehlgeschlagen (${e.message}). Die Antwort ist gesichert — „Bewertung neu anstoßen" im Examen-Menü.</p>`));
            results.push({ score: 0, max: 10, pending: true, confidence: conf });
          }
        } else {
          const g = gradeAnswer(q, res.chosen?.length === 1 ? res.chosen[0] : (q.type === 'multi' ? res.chosen : res.chosen));
          results.push({ score: res.score, max: 1, critical: !!res.critical, confidence: conf, ...(g && { critical: g.critical }) });
        }
        i++; setTimeout(step, mode === 'exam' ? 250 : 700);
      },
    });
    if (mode === 'exam') applyMode(qm, MODES.CLOSED_BOOK);
  };
  step();
}

// ---------------------------------------------------------------- Kapiteltest #/test/p2
// Phasen-Namen fuer die Kopfzeilen der Pruefungen: „Kapiteltest P5" sagte dem
// Lernenden nichts, „Phase 5 · Transparenz" schon.
// Phasennamen: gemeinsame Quelle in competency.js

route('test', async (view, ctx, [phaseId]) => {
  const { pool, kompetenzen, scenarios } = await data();
  const llm = new LlmAdapter({});
  try { await llm.refreshHealth(); llm.evaluateGate(); } catch { /* Gate-Anzeige unten */ }
  const st = ctx.state;
  st.chapterTests ??= {}; st.usedTestQuestions ??= {};
  const attempts = (st.chapterTests[phaseId]?.attempts ?? 0);

  if (!llm.summativeAllowed) {
    // War eine Ueberschrift mit dem Kuerzel und ein grauer Satz, der den
    // technischen Grund unveraendert durchreichte. Dieselbe Lage-Karte wie im
    // Einrichtungs-Ablauf: Schloss, Ueberschrift, Grund, Weg.
    const gesperrt = card(`<div class="lage lage-warnung">
        <span class="lage-symbol"><svg aria-hidden="true"><use href="assets/icons/sprite.svg#icon-st-lock"/></svg></span>
        <div class="lage-txt">
          <h3>Prüfungen sind gesperrt</h3>
          <p>${llm.gate.reason}. Prüfungen dieser Akademie zählen nur, wenn sie von einem
          Modell bewertet werden, dessen Maßstab wir kennen — sonst hieße dieselbe Note
          bei jedem etwas anderes.</p>
          <p class="feld-hilfe">Starte die Bridge mit einem unterstützten Modell neu, dann geht es hier weiter.</p>
        </div>
      </div>
      <div class="formular-fuss"><a class="btn" href="#/lernen/${phaseId}">Zurück zur Phase</a></div>`);
    gesperrt.classList.add('sperr-karte');
    view.appendChild(gesperrt);
    return;
  }
  // Dialogue gating: each phase requires a solid expert conversation before the test
  const boss = st.bossResults?.[phaseId];
  // In simulation the dress rehearsal is not required — the test itself is one
  // of the things to be walked through.
  if (!boss?.passed && !ctx.simulation) {
    const { scenarios } = await data();
    const sz = scenarios.find(x => x.id.startsWith('sz-' + phaseId + '-'));
    const g = card(`<div class="chead gold"><span class="csym"><svg aria-hidden="true"><use href="assets/icons/sprite.svg#icon-st-lock"/></svg></span>
      <span class="t"><h3>Kapiteltest — ${PHASEN_NAME[phaseId] ?? phaseId.toUpperCase()}</h3><span class="sub">Noch gesperrt — erst das Fachgespräch</span></span></div>
      <div class="tor-weg">
        <div class="tor-schritt jetzt"><span class="tor-nr">1</span><b>Bosskampf</b><span>Das Fachgespräch dieser Phase. Bestanden ab der Hälfte der Gesprächsziele — und ohne in eine der Fallen zu tappen, die sofort durchfallen lassen.</span></div>
        <div class="tor-pfeil" aria-hidden="true"><svg><use href="assets/icons/sprite.svg#icon-ui-chevron"/></svg></div>
        <div class="tor-schritt"><span class="tor-nr">2</span><b>Kapiteltest</b><span>Erst Fragen ohne Hilfsmittel, dann Aufgaben am Verordnungstext.</span></div>
      </div>
      <p class="tor-warum">Das Fachgespräch ist die Generalprobe für die Anwendungsfragen im Test.</p>
      <div class="ex-start-zeile">${sz ? `<button class="btn-primary" onclick="location.hash='#/boss/${sz.id}'">Zum Bosskampf: ${sz.title}</button>` : '<p class="dim">Kein Szenario für diese Phase hinterlegt.</p>'}</div>
      ${boss ? `<p class="dim" style="margin-top:12px">Letzter Versuch: ${boss.achieved}/${boss.total} Ziele — Wiederholung mit anderem Gesprächsverlauf möglich.</p>` : ''}`);
    g.classList.add('examen-buehne');
    view.appendChild(g);
    return;
  }
  const used = new Set(st.usedTestQuestions[phaseId] ?? []);
  const test = buildChapterTest(phaseId, pool, { salt: 'a' + attempts, excludeIds: used });
  // Kopf mit Symbol wie in jeder anderen Ansicht (Heute, Drill, Wiederholung,
  // Examen). Kapiteltest und Placement waren die zwei Einstiege ohne — nebeneinander
  // gesehen sahen sie aus, als gehörten sie nicht zum selben Werkzeug.
  const intro = card(`<div class="chead"><span class="csym"><svg aria-hidden="true"><use href="assets/icons/sprite.svg#icon-nav-pruefung"/></svg></span><span class="t"><h3>Kapiteltest — ${PHASEN_NAME[phaseId] ?? phaseId.toUpperCase()}</h3>
    <span class="sub">Zwei Teile: erst ${test.part1.length} Fragen ohne Hilfsmittel, dann ${test.part2.length} Aufgaben mit dem Verordnungstext.</span></span></div>
    <div class="test-eckdaten">
      <span><b>${PASS_SCORE * 100} %</b> zum Bestehen</span>
      <span><b>${attempts + 1}.</b> Antritt</span>
      <span><a href="docs/CRITICAL-ERRORS.md" target="_blank">Fehler, die sofort durchfallen lassen</a></span>
    </div>
    <button class="btn-primary" id="t-start">Teil 1 starten</button>`);
  view.appendChild(intro);
  intro.querySelector('#t-start').onclick = () => {
    intro.remove();
    runQuestions(view, test.part1, {
      mode: 'exam', kind: 'chapter1', llm,
      onDone: r1 => {
        // „(Open Book)" und „Originaltext-Boxen der Einheiten" waren unsere Woerter.
        view.appendChild(card(`<div class="chead"><span class="csym"><svg aria-hidden="true"><use href="assets/icons/sprite.svg#icon-fach-paragraph"/></svg></span>
          <span class="t"><h3>Teil 2 — Arbeit am Verordnungstext</h3>
          <span class="sub">Hier darfst du nachschlagen: Der Wortlaut der Verordnung steht in den Einheiten zum Aufklappen bereit.</span></span></div>`));
        runQuestions(view, test.part2, {
          mode: 'open', kind: 'chapter2', llm,
          onDone: async r2 => {
            const questions = [...test.part1, ...test.part2];
            const results = [...r1, ...r2];
            const ev = evaluateTest({ questions, results, kompetenzen });
            st.usedTestQuestions[phaseId] = [...used, ...questions.map(q => q.id)];
            if (ev.passed) { st.stats = st.stats ?? {}; st.stats.chaptersPassed = (st.stats.chaptersPassed ?? 0) + 1; }
            st.chapterTests[phaseId] = { passed: ev.passed, pct: ev.pct, reason: ev.reason, attempts: attempts + 1, ts: Date.now(), regime: regimeKey({ rechtsstand: RECHTSSTAND, contentVersion: 'c1', promptsVersion: llm.health?.promptsVersion, model: llm.health?.model }) };
            await ctx.saveState();
            const { checkRewards } = await import('./rewards.js');
            checkRewards(st, document, { phaseCompleted: ev.passed ? phaseId : null });
            await ctx.saveState();
            // Die Ergebniskarte begann mit „Nicht bestanden — 30 %" als Ueberschrift,
            // darunter fette Zeilen mit Kompetenz-Kuerzeln und eine Browser-Aufzaehlung
            // mit rohen Fragen-Kennungen („p3-q01, p3-q03 …"). Jetzt: Zeichen und
            // Zustandston, die Note gross, Kompetenzen mit Namen und Balken.
            const kName = id => kompetenzen.find(k => k.id === id)?.name ?? id;
            const proz = v => `${(v * 100).toFixed(0)} %`;
            const res = card(`<div class="erg ${ev.passed ? 'gut' : 'schlecht'}">
                <svg class="erg-sym" aria-hidden="true"><use href="assets/icons/sprite.svg#${ev.passed ? 'icon-st-check' : 'icon-act-retry'}"/></svg>
                <div class="erg-txt">
                  <h3>${ev.passed ? 'Bestanden' : 'Nicht bestanden'}</h3>
                  <p class="erg-wert"><b>${proz(ev.pct)}</b> von ${PASS_SCORE * 100} % nötig</p>
                </div>
              </div>
              ${ev.reason === 'critical_error' ? `<p class="erg-grund"><b>${ev.criticals.length === 1 ? 'Ein Fehler' : `${ev.criticals.length} Fehler`} aus der Durchfall-Liste:</b> ${
                // `criticals` traegt Fragen-Kennungen (p9-q11), nicht Kompetenzen — die
                // standen roh im Nutzertext. Gemeint ist, WORAN es lag: der Kompetenzname
                // der betroffenen Frage.
                [...new Set(ev.criticals.map(id => kName(questions.find(q => q.id === id)?.competency ?? id)))].join(', ')
              }. Der Test gilt damit unabhängig von der Punktzahl als nicht bestanden — im Beruf wäre das ein Compliance-Vorfall.</p>` : ''}
              ${ev.reason === 'kern_mindestleistung' ? `<p class="erg-grund"><b>Eine Kern-Kompetenz liegt unter der Mindestleistung:</b> ${ev.kernFails.map(c => kName(c)).join(', ')}.</p>` : ''}
              <div class="erg-komp">${Object.entries(ev.perCompetency).sort((a, b) => a[1] - b[1]).map(([k, v]) => `
                <div class="erg-zeile"><span class="erg-name">${kName(k)}</span>
                  <span class="erg-bar"><i style="width:${Math.round(v * 100)}%" class="${v >= PASS_SCORE ? 'gut' : v >= 0.5 ? 'mittel' : 'schwach'}"></i></span>
                  <b class="mono">${proz(v)}</b></div>`).join('')}</div>`);
            view.appendChild(res);
            if (!ev.passed) {
              const units = []; // Einheiten-Kompetenz-Mapping steckt in den Unit-JSONs
              const plan = nachschulungPlan(ev, { pool, units, scenarios });
              res.insertAdjacentHTML('beforeend', `<div class="nachschulung">
                <div class="unit-tag"><svg class="ut-sym" aria-hidden="true"><use href="assets/icons/sprite.svg#icon-nav-lernen"/></svg>Pflicht-Nachschulung</div>
                <p class="feld-hilfe">Erst diese Punkte nachholen — je Kompetenz alle Fragen richtig. Danach ist heute noch ein Antritt möglich.</p>
                <ul class="wk-wege">${plan.map(p => `<li><svg aria-hidden="true"><use href="assets/icons/sprite.svg#icon-ui-chevron"/></svg>
                  <span><b>${kName(p.competency)}</b> — ${p.questions.length} Fragen${p.szenario ? `, dazu ein Kurzgespräch: <a href="#/boss/${p.szenario}">jetzt führen</a>` : ''}</span></li>`).join('')}</ul>
                <div class="formular-fuss"><button class="btn-primary" onclick="location.hash='#/test/${phaseId}';window.dispatchEvent(new HashChangeEvent('hashchange'))">Neuer Antritt mit neuen Fragen</button></div>
              </div>`);
            }
          },
        });
      },
    });
  };
});

// ---------------------------------------------------------------- Examen #/examen
route('examen', async (view, ctx) => {
  const { pool, kompetenzen, scenarios } = await data();
  const llm = new LlmAdapter({});
  try { await llm.refreshHealth(); llm.evaluateGate(); } catch { /* unten */ }
  const st = ctx.state;
  st.examAttempts ??= []; st.scoreSeries ??= {};
  const gate = examGate(st, { kompetenzen, cards: st.cards ?? [], nowMs: Date.now(), simulation: ctx.simulation });

  // Marathon warning: after a very long session an exam measures exhaustion, not knowledge
  const { sessionStatus } = await import('./ritual.js');
  const mw = sessionStatus(st).marathon;
  // War ein Absatz, der mit dem Textzeichen ⚠ begann.
  if (mw.warn) view.appendChild(card(`<div class="lage lage-warnung">
      <span class="lage-symbol"><svg aria-hidden="true"><use href="assets/icons/sprite.svg#icon-st-uhr"/></svg></span>
      <div class="lage-txt"><h3>Lieber morgen früh</h3><p>${mw.text}</p></div>
    </div>`));

  // The moment the whole product builds towards. It rendered as a small box in
  // a large empty area — the same weight as a settings panel.
  const head = card(`<div class="examen-buehne">
      <div class="chead gold"><span class="csym"><svg aria-hidden="true"><use href="assets/icons/sprite.svg#icon-fach-trophy"/></svg></span>
        <span class="t"><h3>Abschlussexamen</h3>
        <span class="sub">Der Nachweis, dass es sitzt</span></span></div>
      <div class="ex-teile">
        <div class="ex-teil"><span class="ex-nr">A</span><b>40 Fragen · 60 Minuten</b>
          <span>Ohne Hilfsmittel — so wie im Meeting, wenn niemand nachschlagen kann</span></div>
        <div class="ex-teil"><span class="ex-nr">B</span><b>Abschlussfall · etwa 30 Minuten</b>
          <span>Ein Fall mit dem Verordnungstext am Tisch — nachschlagen ist ausdrücklich erlaubt</span></div>
      </div>
      <p class="ex-regel">Beide Teile müssen bestanden werden · höchstens ein Antritt pro Kalendertag</p>
      <p class="dim ex-fuss">Rechtsstand ${new Date(RECHTSSTAND).toLocaleDateString('de-AT')} · <a href="docs/CRITICAL-ERRORS.md" target="_blank">Fehler, die sofort durchfallen lassen</a> · <a href="docs/CUT-SCORE-BLUEPRINT.md" target="_blank">Warum die Grenze bei 80 % liegt</a></p>
    </div>`);
  view.appendChild(head);

  // War ein Absatz „Gesperrt: <technischer Grund>" — dieselbe Lage-Karte wie im
  // Kapiteltest, damit ein Zustand ueberall gleich aussieht.
  if (!llm.summativeAllowed) {
    head.insertAdjacentHTML('beforeend', `<div class="ex-gesperrt">
      <div class="lage lage-warnung">
        <span class="lage-symbol"><svg aria-hidden="true"><use href="assets/icons/sprite.svg#icon-st-lock"/></svg></span>
        <div class="lage-txt">
          <h3>Das Examen ist gesperrt</h3>
          <p>${llm.gate.reason}. Ein Abschluss zählt nur, wenn er von einem Modell bewertet
          wurde, dessen Maßstab wir kennen — sonst wäre dieselbe Note bei jedem etwas anderes.</p>
          <p class="feld-hilfe">Starte die Bridge mit einem unterstützten Modell neu, dann geht es hier weiter.</p>
        </div>
      </div>
    </div>`);
    paintSeries(view, st.scoreSeries);
    return;
  }
  if (!gate.allowed) {
    // War „Examens-Gate (Schloss aktiv)" — unser Wort — und darunter eine
    // Browser-Aufzaehlung der Gruende ohne Zeichen und ohne Weg dorthin.
    head.insertAdjacentHTML('beforeend', `<div class="ex-gesperrt">
      <div class="lage lage-warnung">
        <span class="lage-symbol"><svg aria-hidden="true"><use href="assets/icons/sprite.svg#icon-st-lock"/></svg></span>
        <div class="lage-txt">
          <h3>Das Examen ist noch zu</h3>
          <p>Es öffnet sich, wenn die Kapitel wirklich sitzen — nicht, wenn sie einmal
          angeklickt wurden. Was noch fehlt:</p>
        </div>
      </div>
      <ul class="wk-wege">${gate.reasons.map(r => `<li><svg aria-hidden="true"><use href="assets/icons/sprite.svg#icon-ui-chevron"/></svg><span>${r}</span></li>`).join('')}</ul>
      <div class="formular-fuss"><a class="btn-primary" href="#/lernen">Zur Übersicht der Phasen</a></div>
    </div>`);
    paintSeries(view, st.scoreSeries);
    return;
  }
  head.querySelector('.examen-buehne').insertAdjacentHTML('beforeend',
    '<div class="ex-start-zeile"><button class="btn-primary" id="ex-start">Examen starten — Teil A</button></div>');
  paintSeries(view, st.scoreSeries);
  head.querySelector('#ex-start').onclick = () => {
    head.remove();
    // Die Marathon-Warnung blieb waehrend der ganzen Pruefung stehen — sie ist
    // eine Entscheidungshilfe VOR dem Antritt, danach nur noch Ablenkung.
    for (const w of view.querySelectorAll('.lage-warnung')) w.closest('.card')?.remove();
    const attempt = st.examAttempts.length;
    const exam = buildExamA(pool, { salt: 'exam' + attempt });
    const t0 = Date.now();
    // 60 Minuten stehen im Tor — waehrend der Pruefung war davon nichts zu sehen.
    // Eine Uhr, die die verbleibende Zeit zeigt und in der letzten Viertelstunde
    // die Farbe wechselt; abgelaufen wird sie nicht abgebrochen (der Bauplan
    // kennt kein hartes Limit), sie sagt es nur.
    const uhr = document.createElement('div');
    uhr.className = 'card ex-uhr';
    view.appendChild(uhr);
    const MINUTEN = 60;
    const tick = () => {
      const rest = MINUTEN * 60_000 - (Date.now() - t0);
      const ueber = rest < 0;
      const m = Math.floor(Math.abs(rest) / 60_000);
      const sek = Math.floor((Math.abs(rest) % 60_000) / 1000);
      uhr.className = `card ex-uhr${ueber ? ' drueber' : rest < 15 * 60_000 ? ' knapp' : ''}`;
      uhr.innerHTML = `<svg class="ut-sym" aria-hidden="true"><use href="assets/icons/sprite.svg#icon-st-uhr"/></svg>
        <span class="ex-uhr-wert mono">${ueber ? '+' : ''}${m}:${String(sek).padStart(2, '0')}</span>
        <span class="ex-uhr-txt">${ueber ? 'über der Richtzeit — zu Ende bringen, es wird nichts abgebrochen' : 'von 60 Minuten übrig'}</span>`;
    };
    tick();
    const uhrLauf = setInterval(tick, 1000);
    runQuestions(view, exam.questions, {
      mode: 'exam', kind: 'exam', llm,
      onDone: async resultsA => {
        clearInterval(uhrLauf); uhr.remove();
        const evA = evaluateTest({ questions: exam.questions, results: resultsA, kompetenzen });
        // Part B: the open-book capstone from the fixed core; any reskin lives in the profile only
        const cap = scenarios.find(s => s.id === 'sz-capstone-kern');
        view.appendChild(card(`<div class="chead gold"><span class="csym"><svg aria-hidden="true"><use href="assets/icons/sprite.svg#icon-fach-waage"/></svg></span>
          <span class="t"><h3>Teil B — der Abschlussfall</h3><span class="sub">Etwa 30 Minuten, mit dem Verordnungstext</span></span></div>${cap.setting_hint ? `<p>${cap.setting_hint}</p>` : ''}
          <p class="dim">Methodik, Fundstellen, Schlussfolgerung — bewertet nach fixer Rubrik.</p>`));
        const capQ = { id: 'capstone', type: 'freetext', prompt: cap.prompt ?? cap.title, competency: 'K18', level: 'C', rubric: cap.rubric, model_answer: cap.model_answer ?? '' };
        runQuestions(view, [capQ], {
          mode: 'open', kind: 'capstone', llm,
          onDone: async resultsB => {
            const b = resultsB[0];
            const bPct = (b.score ?? 0) / (b.max || 10);
            const passed = evA.passed && bPct >= PASS_SCORE && !b.critical;
            const key = regimeKey({ rechtsstand: RECHTSSTAND, contentVersion: 'c1', promptsVersion: llm.health?.promptsVersion, model: llm.health?.model });
            const entry = { pct: +((evA.pct + bPct) / 2).toFixed(3), a: evA.pct, b: +bPct.toFixed(3), passed, day: (d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)(new Date()), minutes: Math.round((Date.now() - t0) / 60000) };
            st.examAttempts.push(entry);
            recordScore(st.scoreSeries, key, entry);
            await ctx.saveState();
            const { checkRewards: cr } = await import('./rewards.js');
            cr(st, document, { examPassed: passed });
            await ctx.saveState();
            // Der groesste Moment des Werkzeugs stand in Grossbuchstaben da
            // („EXAMEN BESTANDEN"), die beiden Teilnoten in einer Klammerzeile
            // mit dem internen Grund darin, und der Weg zum Lernnachweis als
            // Textpfeil-Verweis.
            const gruende = { critical_error: 'ein Fehler aus der Durchfall-Liste',
              kern_mindestleistung: 'eine Kern-Kompetenz unter der Mindestleistung', score: 'zu wenige Punkte' };
            view.appendChild(card(`<div class="erg ${passed ? 'gut' : 'schlecht'}">
                <svg class="erg-sym" aria-hidden="true"><use href="assets/icons/sprite.svg#${passed ? 'icon-fach-trophy' : 'icon-act-retry'}"/></svg>
                <div class="erg-txt">
                  <h3>${passed ? 'Examen bestanden' : 'Examen nicht bestanden'}</h3>
                  <p class="erg-wert"><b>${(((evA.pct + bPct) / 2) * 100).toFixed(0)} %</b> im Schnitt beider Teile</p>
                </div>
              </div>
              <div class="erg-komp">
                <div class="erg-zeile"><span class="erg-name">Teil A — 40 Fragen ohne Hilfsmittel</span>
                  <span class="erg-bar"><i style="width:${Math.round(evA.pct * 100)}%" class="${evA.passed ? 'gut' : 'schwach'}"></i></span>
                  <b class="mono">${(evA.pct * 100).toFixed(0)} %</b></div>
                <div class="erg-zeile"><span class="erg-name">Teil B — der Abschlussfall</span>
                  <span class="erg-bar"><i style="width:${Math.round(bPct * 100)}%" class="${bPct >= PASS_SCORE ? 'gut' : 'schwach'}"></i></span>
                  <b class="mono">${(bPct * 100).toFixed(0)} %</b></div>
              </div>
              ${!evA.passed && evA.reason ? `<p class="erg-grund">Teil A scheiterte an: ${gruende[evA.reason] ?? evA.reason}.</p>` : ''}
              <div class="formular-fuss">${passed
                ? '<a class="btn-primary" href="#/lernnachweis">Lernnachweis erstellen</a>'
                : '<span class="feld-hilfe">Der nächste Antritt ist frühestens morgen möglich — einer pro Kalendertag. Die Nacht dazwischen ist Teil der Methode.</span>'}</div>`));
          },
        });
      },
    });
  };
});

function paintSeries(view, series) {
  const keys = Object.keys(series || {});
  if (!keys.length) return;
  view.appendChild(card(`<h4>Examens-Historie (je Bewertungsregime getrennt, #17)</h4>` + keys.map(k => {
    const s = series[k] ?? {};
    // first/latest/best are maintained as attempts come in, but a series that
    // arrived through an import — or from an older version — carries only its
    // runs. Deriving them keeps the record readable instead of taking the whole
    // page down with an undefined, which is what a learner would see as a blank
    // certificate after restoring a backup.
    const runs = Array.isArray(s.runs) ? s.runs.filter(r => typeof r?.pct === 'number') : [];
    if (!runs.length && !s.first) return `<p class="dim mono" style="font-size:.72rem">${k}</p><p class="dim">keine auswertbaren Antritte</p>`;
    const first = s.first ?? runs[0];
    const latest = s.latest ?? runs[runs.length - 1];
    const best = s.best ?? runs.reduce((a, b) => (b.pct > a.pct ? b : a), runs[0]);
    const pz = v => `${((v?.pct ?? 0) * 100).toFixed(0)} %`;
    return `<p class="dim mono" style="font-size:.72rem">${k}</p><p>first ${pz(first)} · latest ${pz(latest)} · best ${pz(best)} (${runs.length || s.runs?.length || 0} Antritte)</p>`;
  }).join('<hr>')));
}

// ---------------------------------------------------------------- Placement #/placement
route('placement', async (view, ctx) => {
  const { pool } = await data();
  const llm = new LlmAdapter({});
  const qs = placementBuild(pool, { salt: 'pl-' + ((ctx.state.placementRuns ?? 0) + 1) });
  view.appendChild(card(`<div class="chead violett"><span class="csym"><svg aria-hidden="true"><use href="assets/icons/sprite.svg#icon-st-ziel"/></svg></span><span class="t"><h3>Placement (~15 min)</h3>
    <span class="sub">20 Fragen quer durch alle Phasen</span></span></div>
    <p class="dim">Ergebnis sind Startempfehlungen. Eine Einheit überspringst du erst nach einem bestandenen Challenge-Test; Tests bleiben immer Pflicht.</p>`));
  runQuestions(view, qs, {
    mode: 'exam', kind: 'placement', llm,
    onDone: async results => {
      const rec = placementRecommend(qs, results.map(r => ({ correct: (r.score ?? 0) >= 1 })));
      ctx.state.placement = rec; ctx.state.placementRuns = (ctx.state.placementRuns ?? 0) + 1;
      await ctx.saveState();
      // Die Empfehlung war eine Standard-Aufzählung mit Phasen-Kürzeln („P2 — 50 %“).
      // Der Nutzer kennt keine Kürzel, und ein Prozentvergleich über zehn Zeilen ist
      // ein Bild, keine Liste. Jetzt: Phasenname, Balken, Farbe nach Empfehlung.
      const { PHASEN } = await import('./app.js');
      const name = id => PHASEN.find(([pid]) => pid === id)?.[1] ?? id.toUpperCase();
      const stufe = e => e === 'challenge_moeglich' ? { k: 'stark', t: 'Challenge-Test möglich' }
        : e === 'zuegig' ? { k: 'mittel', t: 'zügig durchgehen' } : { k: 'neu', t: 'gründlich lernen' };
      view.appendChild(card(`<div class="chead"><span class="csym"><svg aria-hidden="true"><use href="assets/icons/sprite.svg#icon-fach-heatmap"/></svg></span><span class="t"><h3>Wo du schon stehst</h3>
          <span class="sub">Empfehlung je Phase — übersprungen wird erst nach einem bestandenen Challenge-Test</span></span></div>
        <!-- Reihenfolge aus PHASEN, nicht aus der Schlüsselreihenfolge des Ergebnisses:
             sonst steht „Verbote“ vor „Fundament“. -->
        <div class="pl-liste">${PHASEN.map(([pid]) => [pid, rec[pid]]).filter(([, r]) => r).map(([ph, r]) => {
          const st = stufe(r.empfehlung);
          return `<div class="pl-zeile ${st.k}">
            <span class="pl-name">${name(ph)}</span>
            <span class="pl-spur"><i style="width:${Math.max(3, Math.round(r.quote * 100))}%"></i></span>
            <span class="pl-quote">${(r.quote * 100).toFixed(0)} %</span>
            <span class="pl-tipp">${st.t}</span></div>`;
        }).join('')}</div>
        <div class="formular-fuss"><a class="btn-primary" href="#/heute">Zum ersten Lerntag</a></div>`));
    },
  });
});

// ---------------------------------------------------------------- Challenge-Test #/challenge/<unitId> (#19)
// Placement yields RECOMMENDATIONS only. Actually skipping a unit has to be earned
// individually: six competency-specific questions at an 80 % threshold.
route('challenge', async (view, ctx, [unitId]) => {
  const { pool, kompetenzen } = await data();
  const idx = await fetch('content/units/index.json').then(r => r.json());
  const unit = idx.units.find(u => u.id === unitId);
  // War ein grauer Zweiwortsatz: „Einheit unbekannt." Kein Zeichen, kein Grund,
  // kein Weg — und die Adresse, die nicht stimmt, stand nirgends.
  if (!unit) {
    const fehl = card(`<div class="lage lage-warnung">
        <span class="lage-symbol"><svg aria-hidden="true"><use href="assets/icons/sprite.svg#icon-st-warn"/></svg></span>
        <div class="lage-txt">
          <h3>Diese Einheit gibt es nicht</h3>
          <p>Zu <span class="mono">${escapeHtml(String(unitId ?? '—'))}</span> ist keine Einheit hinterlegt.
          Vermutlich ein alter Verweis oder ein Tippfehler in der Adresse.</p>
        </div>
      </div>
      <div class="formular-fuss"><a class="btn-primary" href="#/lernen">Zur Übersicht aller Phasen</a></div>`);
    fehl.classList.add('sperr-karte');
    view.appendChild(fehl);
    return;
  }
  const llm = new LlmAdapter({});
  try { await llm.refreshHealth(); llm.evaluateGate(); } catch { /* Freetext-Bewertung ggf. nicht verfügbar */ }
  const st = ctx.state;
  const ch = buildChallengeTest({ id: unit.id, competencies: [unit.competency] }, pool,
    { salt: 'ch' + ((st.challengeAttempts?.[unit.id] ?? 0) + 1) });

  const intro = card(`<div class="chead gold"><span class="csym"><svg aria-hidden="true"><use href="assets/icons/sprite.svg#icon-nav-pruefung"/></svg></span><span class="t"><h3>Challenge-Test — ${unit.title}</h3>
    <span class="sub">Kurzprüfung zur Kompetenz „${kompetenzen.find(k => k.id === unit.competency)?.name ?? unit.competency}"</span></span></div>
    <div class="test-eckdaten">
      <span><b>${ch.questions.length}</b> Fragen</span>
      <span><b>${ch.passRequired * 100} %</b> zum Bestehen</span>
      <span>ohne Hilfsmittel</span>
    </div>
    <p>Bestehst du, gilt die Einheit als <b>übersprungen</b>. Die Karten daraus bleiben trotzdem in der Wiederholung, und der Kapiteltest bleibt Pflicht.</p>
    <div class="formular-fuss"><button class="btn-primary" id="ch-start">Kurzprüfung starten</button></div>`);
  view.appendChild(intro);
  intro.querySelector('#ch-start').onclick = () => {
    intro.remove();
    runQuestions(view, ch.questions, {
      mode: 'exam', kind: 'challenge', llm,
      onDone: async results => {
        const ev = evaluateTest({ questions: ch.questions, results, kompetenzen });
        st.challengeAttempts = { ...(st.challengeAttempts ?? {}), [unit.id]: (st.challengeAttempts?.[unit.id] ?? 0) + 1 };
        const bestanden = ev.pct >= ch.passRequired && !ev.criticals.length;
        if (bestanden) st.unit_skipped = [...new Set([...(st.unit_skipped ?? []), unit.id])];
        await ctx.saveState();
        // Dieselbe Ergebnisform wie beim Kapiteltest: Zeichen, Zustandston, Note gross.
        // Vorher stand alles in einer Ueberschrift mit der Note in Klammern.
        view.appendChild(card(`<div class="erg ${bestanden ? 'gut' : 'schlecht'}">
            <svg class="erg-sym" aria-hidden="true"><use href="assets/icons/sprite.svg#${bestanden ? 'icon-st-check' : 'icon-act-retry'}"/></svg>
            <div class="erg-txt">
              <h3>${bestanden ? 'Bestanden — Einheit übersprungen' : 'Nicht bestanden'}</h3>
              <p class="erg-wert"><b>${(ev.pct * 100).toFixed(0)} %</b> von ${ch.passRequired * 100} % nötig</p>
            </div>
          </div>
          <p>${bestanden
            ? 'Die Einheit gilt als nachgewiesen und steht in der Übersicht als übersprungen. Ihre Karten bleiben in der Wiederholung — überspringen heißt nicht vergessen.'
            : 'Die Einheit bleibt im Lernpfad. Ein neuer Versuch ist jederzeit möglich, mit anderen Fragen.'}</p>
          <div class="formular-fuss">
            <a class="btn" href="#/lernen">Zur Übersicht</a>
            <a class="btn-primary" href="#/einheit/${unit.id}">Zur Einheit</a>
          </div>`));
      },
    });
  };
});

// ---------------------------------------------------------------- Lernnachweis #/lernnachweis
route('lernnachweis', async (view, ctx) => {
  const st = ctx.state;
  const series = st.scoreSeries ?? {};
  // Series maintain first/latest/best as attempts come in, but an imported or
  // older series carries only its runs. Normalising here keeps the record
  // printable — the alternative was a blank page after restoring a backup.
  const abgeleitet = Object.fromEntries(Object.entries(series).map(([k, s]) => {
    const runs = (Array.isArray(s?.runs) ? s.runs : []).filter(r => typeof r?.pct === 'number');
    if (!runs.length) return [k, s ?? {}];
    return [k, {
      ...s,
      first: s?.first ?? runs[0],
      latest: s?.latest ?? runs[runs.length - 1],
      best: s?.best ?? runs.reduce((a, b) => (b.pct > a.pct ? b : a), runs[0]),
    }];
  }));
  const bestAll = Object.values(abgeleitet).map(s => s.best).filter(b => typeof b?.pct === 'number')
    .sort((a, b) => b.pct - a.pct)[0];
  const llm = new LlmAdapter({});
  let model = '—', pv = '—';
  try { const h = await llm.refreshHealth(); model = h.model; pv = h.promptsVersion; } catch { /* offline druckbar */ }
  const einspruchQuote = st.appeals?.length ? `${st.appeals.filter(a => a.granted).length}/${st.appeals.length}` : '0/0';
  view.appendChild(card(`
    <div class="nachweis" id="nachweis">
      <h2>Persönlicher Lernnachweis</h2>
      <p class="nw-unter">AI-Act-Akademie · ausgestellt am ${new Date().toLocaleDateString('de-AT')}</p>
      ${ctx.simulation ? `<p class="nachweis-disclaimer nachweis-sim"><b>Aus einer Simulation.</b> Alle Sperren
      standen offen: das Examen war ohne bestandene Kapiteltests zugänglich, es galt keine Antrittsgrenze
      pro Tag, die Pflicht-Wiederholung entfiel und das Fachgespräch war vor dem Kapiteltest nicht nötig.
      Was hier steht, belegt keinen Lernstand.</p>` : ''}
      <p class="nachweis-disclaimer"><b>Persönlicher, unbeaufsichtigter Lernnachweis.</b> Identität und Prüfungsbedingungen
      wurden nicht durch eine unabhängige Stelle verifiziert. Teile der Bewertung sind KI-unterstützt.
      Kein akkreditiertes Zertifikat. Nicht bestimmt für den Einsatz durch Bildungseinrichtungen
      oder Arbeitgeber zur Bewertung von Personen.</p>
      <dl class="nw-fakten">
        <dt>Bestes Examensergebnis</dt>
        <dd>${bestAll ? `<b>${(bestAll.pct * 100).toFixed(0)} %</b>${typeof bestAll.a === 'number' && typeof bestAll.b === 'number' ? ` — Teil A ${(bestAll.a * 100).toFixed(0)} %, Teil B ${(bestAll.b * 100).toFixed(0)} %` : ''}${bestAll.day ? `, am ${bestAll.day}` : ''}` : 'noch kein bestandenes Examen'}</dd>
        <dt>Level und Punkte</dt>
        <dd>Level <b>${st.level ?? 1}</b> · <b>${(st.xp ?? 0).toLocaleString('de-AT')}</b> XP
            <span class="dim">— Aktivität, nicht Kompetenz</span></dd>
        <dt>Kapiteltests</dt>
        <dd><b>${Object.values(st.chapterTests ?? {}).filter(t => t.passed).length}</b> von 9 bestanden</dd>
        <dt>Rechtsstand</dt>
        <dd>${new Date(RECHTSSTAND).toLocaleDateString('de-AT', { day: 'numeric', month: 'long', year: 'numeric' })} <span class="dim">(VO 2024/1689 in der Fassung 2026/1744)</span></dd>
        <dt>Bewertung</dt>
        <dd><span class="mono">${model}</span> · Bewertungsmaßstab <span class="mono">${pv}</span> · Inhaltsstand <span class="mono">c1</span></dd>
      </dl>
      <hr>
      <h3>Transparenz-Rückseite</h3>
      <dl class="nw-fakten">
        <dt>Ergebnis-Reihen</dt>
        <dd>${Object.values(abgeleitet).filter(s => typeof s.first?.pct === 'number').map(s => `${(s.first.pct * 100).toFixed(0)} / ${(s.latest.pct * 100).toFixed(0)} / ${(s.best.pct * 100).toFixed(0)} %`).join(' · ') || '—'}
            <span class="dim">— erster / letzter / bester Versuch je Bewertungsregime</span></dd>
        <dt>Einsprüche</dt>
        <dd>${einspruchQuote} <span class="dim">— stattgegeben von gestellt</span></dd>
      </dl>
    </div>
    <div class="nw-fuss"><button class="btn" onclick="window.print()">Drucken</button></div>`));
});
