// app/engine-quiz.js — Quiz-Engine (Plan #10, #13, #16a, #21):
// Fragetypen MC / Mehrfachauswahl / Fall-Einstufung / Freitext,
// deterministische SOFORT-Bewertung aller eindeutigen Formate (Agent liefert Tiefe asynchron),
// Konfidenz-Abfrage, Fangfragen-Kennzeichnung, „Nicht genug Informationen"-Option,
// eng gefasste Critical-Error-Gates, Closed-Book-Modus.
// Bewertungslogik ist DOM-frei (Node-testbar); Rendering ist strikt getrennt.

// ---------- Bewertung (deterministisch, DOM-frei) ----------

/**
 * Frage-Schema (verbindlich, content/SCHEMA.md folgt in Task 8):
 * { id, type:'mc'|'multi'|'case'|'freetext', prompt, scenario?, options?:[{id,text,correct,rationale,source_id}],
 *   insufficient_info?: {option_id, correct:bool},         // #13: „nicht genug Informationen" als reguläre Option
 *   trap?: {is_trap, note},                                // Fangfragen-Kennzeichnung im Feedback
 *   critical_error?: {option_ids:[…], reason, requires_complete_facts:true},  // #16a eng gefasst
 *   competency, level:'A'|'B'|'C', legal_basis, legal_status, status }
 */

/** MC/Case: genau eine Auswahl. multi: Set von Auswahl-IDs. */
export function grade(question, answer) {
  switch (question.type) {
    case 'mc':
    case 'case': {
      const chosen = question.options.find(o => o.id === answer.optionId);
      if (!chosen) return { verdict: 'invalid', reason: 'Option unbekannt' };
      const res = chosen.correct ? 'correct' : 'wrong';
      return withGates(question, [chosen.id], {
        verdict: res, score: res === 'correct' ? 1 : 0,
        chosen: [chosen.id],
        rationale: chosen.rationale ?? null,
        trap: question.trap?.is_trap ? question.trap : null
      });
    }
    case 'multi': {
      const sel = new Set(answer.optionIds ?? []);
      const correctSet = new Set(question.options.filter(o => o.correct).map(o => o.id));
      if (sel.size === 0) return { verdict: 'invalid', reason: 'keine Auswahl' };
      const hits = [...sel].filter(id => correctSet.has(id)).length;
      const wrongPicks = [...sel].filter(id => !correctSet.has(id)).length;
      // Teilpunkte: Treffer minus Fehlgriffe, normiert; volle Punkte nur bei exakter Menge
      const score = Math.max(0, (hits - wrongPicks) / correctSet.size);
      const verdict = score === 1 && sel.size === correctSet.size ? 'correct'
        : score > 0 ? 'partial' : 'wrong';
      return withGates(question, [...sel], {
        verdict, score, chosen: [...sel],
        expected: [...correctSet],
        trap: question.trap?.is_trap ? question.trap : null
      });
    }
    case 'assign': {
      // Zuordnung (#11/#45): answer.assignments = { left → right }. Teilpunkte je Treffer.
      const pairs = question.pairs ?? [];
      const ist = answer.assignments ?? {};
      const hits = pairs.filter(p => ist[p.left] === p.right).length;
      if (!Object.keys(ist).length) return { verdict: 'invalid', reason: 'keine Zuordnung' };
      const score = hits / (pairs.length || 1);
      return withGates(question, [], {
        verdict: score === 1 ? 'correct' : score > 0 ? 'partial' : 'wrong',
        score, chosen: ist, expectedPairs: pairs.map(p => [p.left, p.right]),
        trap: question.trap?.is_trap ? question.trap : null
      });
    }
    case 'freetext':
      // Freitext KANN nur der Agent bewerten (#21) — deterministisch nur Annahme + Status.
      return { verdict: 'pending_agent', score: null, chosen: null, answerText: answer.text ?? '' };
    default:
      return { verdict: 'invalid', reason: `unbekannter Typ ${question.type}` };
  }
}

/** Critical-Error-Gate (#16a): greift NUR wenn der Fall vollständige Fakten hat. */
function withGates(question, chosenIds, result) {
  const ce = question.critical_error;
  if (ce && ce.requires_complete_facts !== false) {
    const hit = chosenIds.some(id => ce.option_ids.includes(id));
    if (hit) result.critical_error = { reason: ce.reason };
  }
  return result;
}

/** Konfidenz-Urteil (Plan §3): 1 Klick, Pflicht bei Checks. */
export const CONFIDENCE = ['sicher', 'unsicher', 'geraten'];

/** Fangfragen-Quote eines Fragensatzes prüfen (#13: 10–15 % Deckel — Test-/CI-Helfer). */
export function trapQuota(questions) {
  const n = questions.length;
  const traps = questions.filter(q => q.trap?.is_trap).length;
  return { n, traps, quota: n ? traps / n : 0, withinCap: n === 0 || traps / n <= 0.15 };
}

// ---------- Prüfmodus (Closed Book, #13) ----------

export const MODES = Object.freeze({ LERNEN: 'lernen', CLOSED_BOOK: 'closed_book', OPEN_BOOK: 'open_book' });

/** Zentraler Schalter: Closed Book deaktiviert Glossar-Tooltips, Originaltext-Boxen, Visualisierungs-Hilfen. */
export function applyMode(root, mode) {
  root.dataset.quizMode = mode;
  const closed = mode === MODES.CLOSED_BOOK;
  root.querySelectorAll('[data-hilfsmittel]').forEach(el => {
    el.toggleAttribute('hidden', closed);
    if (closed) el.setAttribute('aria-hidden', 'true'); else el.removeAttribute('aria-hidden');
  });
  root.querySelectorAll('.gloss').forEach(el => {
    el.classList.toggle('gloss-off', closed);
    if (closed) { el.removeAttribute('tabindex'); el.title = ''; }
  });
  return { mode, hilfsmittelSichtbar: !closed };
}

// ---------- Rendering (Browser) ----------

const ICON = { correct: '✓', partial: '≈', wrong: '✕' };

/**
 * Rendert eine Frage in `mount`. opts: {mode, onAnswered(result, confidence)}.
 * Ablauf Checks (Plan §3): Antwort wählen → Konfidenz-Klick → deterministisches Sofort-Feedback.
 */
export function renderQuestion(mount, question, opts = {}) {
  const doc = mount.ownerDocument;
  mount.innerHTML = '';
  const el = doc.createElement('div');
  el.className = 'q';
  el.dataset.qid = question.id;

  if (question.scenario) {
    const sc = doc.createElement('div');
    sc.className = 'q-scenario card';
    sc.textContent = question.scenario;
    el.appendChild(sc);
  }
  const p = doc.createElement('div');
  p.className = 'q-prompt';
  p.innerHTML = question.prompt_html ?? escapeHtml(question.prompt);
  el.appendChild(p);

  if (question.type === 'freetext') {
    const ta = doc.createElement('textarea');
    ta.className = 'q-freetext'; ta.rows = 6;
    ta.placeholder = 'Einstufung + Begründung mit Fundstellen …';
    const note = doc.createElement('div');
    note.className = 'q-privacy';
    note.textContent = 'Hinweis: Freitext geht zur Bewertung an den LLM-Anbieter — keine echten Personendaten oder Organisations-Interna eingeben.';
    const btn = doc.createElement('button');
    btn.className = 'btn-primary'; btn.textContent = 'Zur Bewertung einreichen';
    btn.addEventListener('click', () => {
      const result = grade(question, { text: ta.value });
      showConfidence(doc, el, conf => opts.onAnswered?.(result, conf));
    });
    el.append(ta, note, btn);
  } else if (question.type === 'assign') {
    // Zuordnungs-UI ohne Drag-Zwang: pro linkem Begriff die rechte Option anklicken (#43-konform).
    const pairs = question.pairs ?? [];
    const rights = [...new Set([...pairs.map(p => p.right), ...(question.distractors ?? [])])];
    const ist = {};
    const wrap = doc.createElement('div');
    wrap.className = 'q-assign';
    for (const p of pairs) {
      const row = doc.createElement('div');
      row.className = 'q-assign-row';
      const left = doc.createElement('div');
      left.className = 'q-assign-left'; left.textContent = p.left;
      const opts_ = doc.createElement('div');
      opts_.className = 'q-assign-opts';
      for (const r of rights) {
        const b = doc.createElement('button');
        b.className = 'q-opt q-assign-opt'; b.textContent = r;
        b.addEventListener('click', () => {
          ist[p.left] = r;
          [...opts_.children].forEach(x => x.classList.remove('sel'));
          b.classList.add('sel');
        });
        opts_.appendChild(b);
      }
      row.append(left, opts_);
      wrap.appendChild(row);
    }
    const done = doc.createElement('button');
    done.className = 'btn-primary'; done.textContent = 'Zuordnung bestätigen';
    done.addEventListener('click', () => {
      const result = grade(question, { assignments: ist });
      if (result.verdict === 'invalid') return;
      lock(wrap);
      showConfidence(doc, el, conf => {
        paintFeedback(doc, el, question, result);
        opts.onAnswered?.(result, conf);
      });
    });
    el.append(wrap, done);
  } else {
    const multi = question.type === 'multi';
    const list = doc.createElement('div');
    list.className = 'q-options';
    const chosen = new Set();
    for (const [i, o] of question.options.entries()) {
      const b = doc.createElement('button');
      b.className = 'q-opt'; b.dataset.oid = o.id;
      b.innerHTML = `<span class="q-key">${i + 1}</span> ${renderOptionText(o)}`;
      b.addEventListener('click', () => {
        if (multi) { b.classList.toggle('sel'); chosen.has(o.id) ? chosen.delete(o.id) : chosen.add(o.id); }
        else finish({ optionId: o.id });
      });
      list.appendChild(b);
    }
    el.appendChild(list);
    if (multi) {
      const done = doc.createElement('button');
      done.className = 'btn-primary'; done.textContent = 'Auswahl bestätigen';
      done.addEventListener('click', () => finish({ optionIds: [...chosen] }));
      el.appendChild(done);
    }
    // Tastatur 1–4 + Enter (#43)
    el.tabIndex = 0;
    el.addEventListener('keydown', ev => {
      const n = parseInt(ev.key, 10);
      if (n >= 1 && n <= question.options.length) list.children[n - 1].click();
      if (ev.key === 'Enter' && multi) el.querySelector('.btn-primary')?.click();
    });

    function finish(answer) {
      const result = grade(question, answer);
      if (result.verdict === 'invalid') return;
      lock(list);
      // Feedback-Timing nach Aufgabentyp (§3, v3.2): Fakten-/Zuordnungsfragen sofort;
      // komplexe Falllösungen (case oder C-Stufe) erst Selbstbegründung + Konfidenz,
      // DANN Feedback — sonst überschreibt die Lösung die eigene Denkspur.
      const komplex = question.type === 'case' || question.level === 'C';
      const weiter = conf => { paintFeedback(doc, el, question, result); opts.onAnswered?.(result, conf); };
      if (komplex && !opts.noSelfExplain) {
        const se = doc.createElement('div');
        se.className = 'q-selfexplain';
        se.innerHTML = `<label>Warum diese Antwort? <span class="dim">(kurz für dich selbst — wird nicht bewertet)</span>
          <textarea rows="2" placeholder="Meine Begründung in einem Satz …"></textarea></label>
          <button class="btn">Begründung festhalten</button>`;
        el.appendChild(se);
        se.querySelector('button').addEventListener('click', () => {
          const txt = se.querySelector('textarea').value.trim();
          se.remove();
          if (txt) opts.onSelfExplain?.(txt, question.id);
          showConfidence(doc, el, weiter);
        });
      } else {
        showConfidence(doc, el, weiter);
      }
    }
  }

  mount.appendChild(el);
  if (opts.mode) applyMode(mount, opts.mode);
  return el;
}

function renderOptionText(o) {
  // NICHT/FALSCH in Fangfragen deutlich markieren (#13)
  return escapeHtml(o.text).replace(/\b(NICHT|FALSCH|KEINE?)\b/g, '<b class="q-neg">$1</b>');
}

function lock(list) { for (const b of list.children) b.disabled = true; }

function showConfidence(doc, el, cb) {
  const bar = doc.createElement('div');
  bar.className = 'q-confidence';
  bar.innerHTML = `<span>Wie sicher warst du?</span>`;
  for (const c of CONFIDENCE) {
    const b = doc.createElement('button');
    b.textContent = c; b.dataset.conf = c;
    b.addEventListener('click', () => { bar.remove(); cb(c); });
    bar.appendChild(b);
  }
  el.appendChild(bar);
}

/** Erklärendes Feedback bei richtig UND falsch (Plan §3) + Fangfragen- und Critical-Kennzeichnung. */
function paintFeedback(doc, el, question, result) {
  // Zuordnungs-Fragen haben keine options — eigenes Feedback (Task-12-E2E-Finding)
  if (question.type === 'assign') {
    const fb = doc.createElement('div');
    fb.className = `q-feedback q-${result.verdict}`;
    const soll = (result.expectedPairs ?? []).map(([l, r]) => `${l} → ${r}`).join(' · ');
    fb.innerHTML = `<b>${result.verdict === 'correct' ? '✓ Alle Zuordnungen richtig.' : result.verdict === 'partial' ? '◐ Teilweise richtig.' : '✕ Nicht richtig.'}</b>` +
      `<div class="dim">Richtige Zuordnung: ${soll}</div>` +
      (result.trap?.is_trap ? `<div class="q-trapnote">⚠ Fangfrage: ${escapeHtml(result.trap.note)}</div>` : '') +
      '<span class="grade-label mono">Bewertungstyp: deterministisch · Rechtsstand 27.7.2026</span>';
    el.appendChild(fb);
    return;
  }
  for (const b of el.querySelectorAll('.q-opt')) {
    const o = question.options.find(x => x.id === b.dataset.oid);
    if (o?.correct) b.classList.add('state-correct');
    else if (result.chosen?.includes(b.dataset.oid)) b.classList.add(result.verdict === 'partial' ? 'state-partial' : 'state-wrong');
  }
  const fb = doc.createElement('div');
  fb.className = `q-feedback q-${result.verdict}`;
  let html = `<b>${ICON[result.verdict] ?? ''} ${
    result.verdict === 'correct' ? 'Richtig.' : result.verdict === 'partial' ? 'Teilweise richtig.' : 'Nicht richtig.'}</b>`;
  const expl = question.options.filter(o => o.correct && o.rationale).map(o => escapeHtml(o.rationale));
  if (expl.length) html += ` ${expl.join(' ')}`;
  if (result.trap) html += `<div class="q-trapnote">⚠ Fangfrage: ${escapeHtml(result.trap.note)}</div>`;
  if (result.critical_error) html += `<div class="q-critical">Critical Error: ${escapeHtml(result.critical_error.reason)}</div>`;
  fb.innerHTML = html;
  fb.insertAdjacentHTML('beforeend', '<span class="grade-label mono">Bewertungstyp: deterministisch · Rechtsstand 27.7.2026</span>');
  el.appendChild(fb);
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
