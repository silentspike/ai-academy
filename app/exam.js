// app/exam.js — Prüfungs-Views (Plan §4.3): Kapiteltests (2-teilig), Examen A+B,
// Placement, Nachschulung, Einspruch, Persönlicher Lernnachweis.
// Logik liegt in exam-core.js (DOM-frei, getestet) — hier nur Ablauf + Darstellung.
import { route } from './router.js';
import { renderQuestion, applyMode, MODES } from './engine-quiz.js';
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
  return (_data = { pool: qc.questions, kompetenzen: comp.kompetenzen, scenarios: sc.scenarios });
}

function card(html) { const d = document.createElement('div'); d.className = 'card'; d.innerHTML = html; return d; }

// Ein Frage-Ablauf: rendert questions nacheinander, sammelt Ergebnisse.
// Deterministische Typen sofort; freetext über die Bridge (kind), transaktional (#25).
async function runQuestions(view, questions, { mode, kind, llm, onDone }) {
  const results = [];
  let i = 0;
  const mount = document.createElement('div');
  view.appendChild(mount);
  // Bewertungs-/Einspruchs-Karten überleben den Fragenwechsel (Task-12-E2E-Finding:
  // mount wird pro Schritt geleert — der Einspruchs-Button war sonst unerreichbar)
  const resultsArea = document.createElement('div');
  resultsArea.className = 'exam-results-area';
  view.appendChild(resultsArea);
  const step = () => {
    mount.innerHTML = '';
    if (i >= questions.length) { onDone(results); return; }
    const q = questions[i];
    const head = card(`<div class="chead"><span class="t"><h3>Frage ${i + 1}/${questions.length}</h3><span class="sub">${q.competency} · Stufe ${q.level}${mode === 'exam' ? ' · Closed Book' : mode === 'open' ? ' · Verordnungstext erlaubt' : ''}</span></span></div>`);
    mount.appendChild(head);
    const qm = document.createElement('div');
    mount.appendChild(qm);
    renderQuestion(qm, q, {
      onAnswered: async (res, conf) => {
        if (res.verdict === 'pending_agent') {
          qm.insertAdjacentHTML('beforeend', '<p class="dim">Bewertung läuft (frischer Prüfer-Aufruf)…</p>');
          try {
            const out = await llm.grade({
              question: q.prompt, rubric: JSON.stringify(q.rubric || ''), modelAnswer: q.model_answer || '',
              answer: res.answerText, kind,
            });
            const r = out.result ?? out;
            results.push({ score: r.score, max: r.max || 10, critical: !!r.critical_error, confidence: conf, txId: out.txId, feedback: r.feedback });
            // Einspruch (#20): frischer Zweitprüfer OHNE Erstbewertung im Prompt (Bridge buildAppealPrompt)
            const lab = out.label ? `<span class="grade-label mono">Bewertungstyp: ${out.label.type} · ${out.label.model} · Rubrik ${out.label.rubricVersion} · Rechtsstand 27.7.2026</span>` : '';
            const fb = card(`<p><b>${r.score}/${r.max || 10}</b> — ${r.feedback ?? ''}</p>${lab}
              <details><summary>Einspruch einlegen</summary>
              <textarea class="q-freetext" rows="2" placeholder="Begründung des Einspruchs …"></textarea>
              <button class="btn">Einspruch abschicken (frische Zweitprüfung)</button>
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
            // Transaktionale Sicherung (#25): Antwort ist bridge-seitig gespeichert; Versuch nicht verbraucht.
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
route('test', async (view, ctx, [phaseId]) => {
  const { pool, kompetenzen, scenarios } = await data();
  const llm = new LlmAdapter({});
  try { await llm.refreshHealth(); llm.evaluateGate(); } catch { /* Gate-Anzeige unten */ }
  const st = ctx.state;
  st.chapterTests ??= {}; st.usedTestQuestions ??= {};
  const attempts = (st.chapterTests[phaseId]?.attempts ?? 0);

  if (!llm.summativeAllowed) {
    view.appendChild(card(`<h3>Kapiteltest ${phaseId?.toUpperCase()}</h3><p class="dim">Prüfungen gesperrt: ${llm.gate.reason}</p>`));
    return;
  }
  // Bosskampf-Gating (Plan §4.2): jede Phase erst Fachgespräch (mind. „solide"), dann Test
  const boss = st.bossResults?.[phaseId];
  if (!boss?.passed) {
    const { scenarios } = await data();
    const sz = scenarios.find(x => x.id.startsWith('sz-' + phaseId + '-'));
    view.appendChild(card(`<h3>Kapiteltest ${phaseId.toUpperCase()} — gesperrt</h3>
      <p>Vor dem Test steht der Bosskampf: das Fachgespräch der Phase mit Mindesturteil „solide" (≥ 50 % der Gesprächsziele, keine Critical-Falle).</p>
      ${sz ? `<button class="btn-primary" onclick="location.hash='#/boss/${sz.id}'">Zum Bosskampf: ${sz.title}</button>` : '<p class="dim">Kein Szenario für diese Phase hinterlegt.</p>'}
      ${boss ? `<p class="dim">Letzter Versuch: ${boss.achieved}/${boss.total} Ziele — Wiederholung mit anderem Gesprächsverlauf möglich.</p>` : ''}`));
    return;
  }
  const used = new Set(st.usedTestQuestions[phaseId] ?? []);
  const test = buildChapterTest(phaseId, pool, { salt: 'a' + attempts, excludeIds: used });
  const intro = card(`<h3>Kapiteltest ${phaseId.toUpperCase()} — zweiteilig</h3>
    <p>Teil 1 „Triage" (${test.part1.length} Fragen, Closed Book) → Teil 2 „Quellenarbeit" (${test.part2.length} Aufgaben, Verordnungstext erlaubt).
    Bestehensgrenze ${PASS_SCORE * 100} % · <a href="docs/CRITICAL-ERRORS.md" target="_blank">Critical-Error-Liste</a> · Antritt ${attempts + 1}</p>
    <button class="btn-primary" id="t-start">Teil 1 starten</button>`);
  view.appendChild(intro);
  intro.querySelector('#t-start').onclick = () => {
    intro.remove();
    runQuestions(view, test.part1, {
      mode: 'exam', kind: 'chapter1', llm,
      onDone: r1 => {
        view.appendChild(card('<h3>Teil 2 — Quellenarbeit (Open Book)</h3><p class="dim">Der Verordnungstext (Originaltext-Boxen der Einheiten) darf verwendet werden.</p>'));
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
            const res = card(`<h3>${ev.passed ? 'Bestanden' : 'Nicht bestanden'} — ${(ev.pct * 100).toFixed(0)} %</h3>
              ${ev.reason === 'critical_error' ? `<p><b>Critical Error</b> (${ev.criticals.join(', ')}): Der Test gilt unabhängig von der Punktzahl als nicht bestanden.</p>` : ''}
              ${ev.reason === 'kern_mindestleistung' ? `<p><b>Kern-Kompetenz unter Mindestleistung:</b> ${ev.kernFails.join(', ')}</p>` : ''}
              <p class="dim">Kompetenzen: ${Object.entries(ev.perCompetency).map(([k, v]) => `${k} ${(v * 100).toFixed(0)} %`).join(' · ')}</p>`);
            view.appendChild(res);
            if (!ev.passed) {
              const units = []; // Einheiten-Kompetenz-Mapping steckt in den Unit-JSONs — Nachschulung nennt Fragen-IDs
              const plan = nachschulungPlan(ev, { pool, units, scenarios });
              res.insertAdjacentHTML('beforeend', `<h4>Pflicht-Nachschulung (je Kompetenz, 100 %-Hürde, dann Retake heute möglich)</h4>
                <ul>${plan.map(p => `<li><b>${p.competency}</b>: ${p.questions.length} Fragen (${p.questions.slice(0, 3).join(', ')} …)${p.szenario ? ` + Kurzszenario <a href="#/boss/${p.szenario}">${p.szenario}</a>` : ''}</li>`).join('')}</ul>
                <button class="btn" onclick="location.hash='#/test/${phaseId}';window.dispatchEvent(new HashChangeEvent('hashchange'))">Retake (neue Fragen)</button>`);
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
  const gate = examGate(st, { kompetenzen, cards: st.cards ?? [], nowMs: Date.now() });

  // Marathon-Warnung vor dem Antritt (#33): nach sehr langer Sitzung misst ein Examen Erschöpfung
  const { sessionStatus } = await import('./ritual.js');
  const mw = sessionStatus(st).marathon;
  if (mw.warn) view.appendChild(card(`<p class="ritual-warn">⚠ ${mw.text}</p>`));

  const head = card(`<div class="chead"><span class="t"><h3>Abschlussexamen</h3>
    <span class="sub">Teil A: 40 Fragen / 60 min Closed Book · Teil B: Capstone ~30 min Open Book · max. 1 Antritt/Tag</span></span></div>
    <p class="dim">Rechtsstand ${RECHTSSTAND} · <a href="docs/CRITICAL-ERRORS.md" target="_blank">Critical-Error-Liste</a> · <a href="docs/CUT-SCORE-BLUEPRINT.md" target="_blank">Cut-Score-Begründung</a></p>`);
  view.appendChild(head);

  if (!llm.summativeAllowed) { head.insertAdjacentHTML('beforeend', `<p><b>Gesperrt:</b> ${llm.gate.reason}</p>`); return; }
  if (!gate.allowed) {
    head.insertAdjacentHTML('beforeend', `<h4>Examens-Gate (Schloss aktiv)</h4><ul>${gate.reasons.map(r => `<li>${r}</li>`).join('')}</ul>`);
    paintSeries(view, st.scoreSeries);
    return;
  }
  head.insertAdjacentHTML('beforeend', '<button class="btn-primary" id="ex-start">Examen starten (Teil A)</button>');
  paintSeries(view, st.scoreSeries);
  head.querySelector('#ex-start').onclick = () => {
    head.remove();
    const attempt = st.examAttempts.length;
    const exam = buildExamA(pool, { salt: 'exam' + attempt });
    const t0 = Date.now();
    runQuestions(view, exam.questions, {
      mode: 'exam', kind: 'exam', llm,
      onDone: async resultsA => {
        const evA = evaluateTest({ questions: exam.questions, results: resultsA, kompetenzen });
        // Teil B: Capstone (Open Book) aus dem fixen Kern (Profil-Einkleidung nur im Profil, §5.2)
        const cap = scenarios.find(s => s.id === 'sz-capstone-kern');
        view.appendChild(card(`<h3>Teil B — Capstone (Open Book, ~30 min)</h3><p>${cap.setting_hint ?? cap.title}</p>
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
            view.appendChild(card(`<h3>${passed ? 'EXAMEN BESTANDEN' : 'Nicht bestanden'}</h3>
              <p>Teil A: ${(evA.pct * 100).toFixed(0)} % (${evA.passed ? 'bestanden' : evA.reason}) · Teil B: ${(bPct * 100).toFixed(0)} %</p>
              ${passed ? '<p><a href="#/lernnachweis">→ Persönlichen Lernnachweis erstellen</a></p>' : '<p class="dim">Retake frühestens morgen (1 Antritt/Kalendertag) — Nachschulung empfohlen.</p>'}`));
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
    const s = series[k];
    return `<p class="dim mono" style="font-size:.72rem">${k}</p><p>first ${(s.first.pct * 100).toFixed(0)} % · latest ${(s.latest.pct * 100).toFixed(0)} % · best ${(s.best.pct * 100).toFixed(0)} % (${s.runs.length} Antritte)</p>`;
  }).join('<hr>')));
}

// ---------------------------------------------------------------- Placement #/placement
route('placement', async (view, ctx) => {
  const { pool } = await data();
  const llm = new LlmAdapter({});
  const qs = placementBuild(pool, { salt: 'pl-' + ((ctx.state.placementRuns ?? 0) + 1) });
  view.appendChild(card(`<h3>Placement (~15 min)</h3><p class="dim">20 Fragen quer durch alle Phasen. Ergebnis sind STARTEMPFEHLUNGEN — übersprungen wird eine Einheit erst nach bestandenem Challenge-Test (#19); Tests bleiben immer Pflicht.</p>`));
  runQuestions(view, qs, {
    mode: 'exam', kind: 'placement', llm,
    onDone: async results => {
      const rec = placementRecommend(qs, results.map(r => ({ correct: (r.score ?? 0) >= 1 })));
      ctx.state.placement = rec; ctx.state.placementRuns = (ctx.state.placementRuns ?? 0) + 1;
      await ctx.saveState();
      view.appendChild(card(`<h3>Startempfehlungen</h3><ul>` + Object.entries(rec).map(([ph, r]) =>
        `<li><b>${ph.toUpperCase()}</b> — ${(r.quote * 100).toFixed(0)} % → ${r.empfehlung === 'challenge_moeglich' ? 'stark: Challenge-Tests je Einheit möglich' : r.empfehlung === 'zuegig' ? 'zügig durchgehen' : 'gründlich lernen'}</li>`).join('') + `</ul>`));
    },
  });
});

// ---------------------------------------------------------------- Challenge-Test #/challenge/<unitId> (#19)
// Placement liefert nur EMPFEHLUNGEN — das tatsächliche Überspringen einer Einheit
// muss einzeln verdient werden: 6 kompetenzspezifische Fragen, 80 %-Hürde.
route('challenge', async (view, ctx, [unitId]) => {
  const { pool, kompetenzen } = await data();
  const idx = await fetch('content/units/index.json').then(r => r.json());
  const unit = idx.units.find(u => u.id === unitId);
  if (!unit) { view.appendChild(card('<p class="dim">Einheit unbekannt.</p>')); return; }
  const llm = new LlmAdapter({});
  try { await llm.refreshHealth(); llm.evaluateGate(); } catch { /* Freetext-Bewertung ggf. nicht verfügbar */ }
  const st = ctx.state;
  const ch = buildChallengeTest({ id: unit.id, competencies: [unit.competency] }, pool,
    { salt: 'ch' + ((st.challengeAttempts?.[unit.id] ?? 0) + 1) });

  const intro = card(`<div class="chead"><span class="t"><h3>Challenge-Test — ${unit.title}</h3>
    <span class="sub">${ch.questions.length} Fragen zur Kompetenz ${unit.competency} · Hürde ${ch.passRequired * 100} % · Closed Book</span></span></div>
    <p>Bestehst du, wird die Einheit als <b>übersprungen</b> markiert (Karten laufen trotzdem durchs Leitner-System, der Kapiteltest bleibt Pflicht, #12/#19).</p>
    <button class="btn-primary" id="ch-start">Challenge starten</button>`);
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
        view.appendChild(card(`<h3>${bestanden ? 'Bestanden — Einheit übersprungen' : 'Nicht bestanden'} (${(ev.pct * 100).toFixed(0)} %)</h3>
          <p>${bestanden
            ? 'Die Einheit gilt als nachgewiesen und erscheint in der Lernen-Ansicht als übersprungen. Karten der Einheit bleiben im Wiederholungs-System.'
            : `Unter ${ch.passRequired * 100} % — die Einheit bleibt im Lernpfad. Das ist der Sinn des Verfahrens: Skips werden einzeln verdient (#19).`}</p>
          <a class="btn" href="#/einheit/${unit.id}">Zur Einheit</a> <a class="btn" href="#/lernen">Zur Übersicht</a>`));
      },
    });
  };
});

// ---------------------------------------------------------------- Lernnachweis #/lernnachweis
route('lernnachweis', async (view, ctx) => {
  const st = ctx.state;
  const series = st.scoreSeries ?? {};
  const bestAll = Object.values(series).map(s => s.best).filter(Boolean).sort((a, b) => b.pct - a.pct)[0];
  const llm = new LlmAdapter({});
  let model = '—', pv = '—';
  try { const h = await llm.refreshHealth(); model = h.model; pv = h.promptsVersion; } catch { /* offline druckbar */ }
  const einspruchQuote = st.appeals?.length ? `${st.appeals.filter(a => a.granted).length}/${st.appeals.length}` : '0/0';
  view.appendChild(card(`
    <div class="nachweis" id="nachweis">
      <h2>Persönlicher Lernnachweis — AI-Act-Akademie</h2>
      <p class="nachweis-disclaimer"><b>Persönlicher, unbeaufsichtigter Lernnachweis.</b> Identität und Prüfungsbedingungen
      wurden nicht durch eine unabhängige Stelle verifiziert. Teile der Bewertung sind KI-unterstützt.
      Kein akkreditiertes Zertifikat; nicht für Personal- oder Zulassungsentscheidungen bestimmt.</p>
      <p><b>Bestes Examensergebnis:</b> ${bestAll ? `${(bestAll.pct * 100).toFixed(0)} % (A ${(bestAll.a * 100).toFixed(0)} % / B ${(bestAll.b * 100).toFixed(0)} %) am ${bestAll.day}` : 'noch kein bestandenes Examen'}</p>
      <p><b>Level:</b> ${st.level ?? 1} · <b>XP:</b> ${st.xp ?? 0} (Aktivität, nicht Kompetenz — strikt getrennt, #28)</p>
      <p><b>Rechtsstand:</b> ${RECHTSSTAND} (VO 2024/1689 idF 2026/1744) · <b>Content:</b> c1 · <b>Bewertung:</b> ${model} / Rubrik ${pv}</p>
      <hr>
      <h3>Transparenz-Rückseite</h3>
      <p class="dim">Score-Serien (first/latest/best je Regime): ${Object.values(series).map(s => `${(s.first.pct * 100).toFixed(0)}/${(s.latest.pct * 100).toFixed(0)}/${(s.best.pct * 100).toFixed(0)} %`).join(' · ') || '—'}<br>
      Einspruchsquote: ${einspruchQuote} · Kapiteltests bestanden: ${Object.values(st.chapterTests ?? {}).filter(t => t.passed).length}/9</p>
    </div>
    <button class="btn" onclick="window.print()">Drucken</button>`));
});
