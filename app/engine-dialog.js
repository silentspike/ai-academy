// app/engine-dialog.js — character dialogues, the expert conversations:
// A DETERMINISTIC scenario engine holds the facts, the conversation phases, the release
// of information, the traps and the assessment goals. The model formulates ONLY the
// persona's replies from already released information and may not invent legal facts.
// The engine part is DOM-free and testable in Node; the UI part is strictly separate.

// ---------- Szenario-Engine (DOM-frei) ----------

/**
 * Scenario schema (content/scenarios.json, layers 1 and 2):
 * { id, title, persona:{archetype, name, role, avatar, expressions:{neutral,skeptisch,zufrieden,nachbohrend}},
 *   facts:[{id, text, released_at_phase}],          // Sachverhalt — Freigabe pro Phase
 *   phases:[{id, goal, opening_hint, traps:[{id,text,expected_competency}]}],
 *   goals:[{id, text, competency}], rubric_id, critical_errors:[…] }
 */

export function createScenarioRun(scenario, nowMs) {
  return {
    scenario_id: scenario.id,
    phase_index: 0,
    released_fact_ids: scenario.facts.filter(f => f.released_at_phase === 0).map(f => f.id),
    goals_hit: [],
    criticals_hit: [],
    transcript: [],            // [{who:'user'|'persona', text, ts, phase}]
    started: nowMs,
    finished: false
  };
}

/** Record the learner's move; the engine checks goal hits deterministically via goal_matchers. */
export function recordUserTurn(scenario, run, text, nowMs) {
  run.transcript.push({ who: 'user', text, ts: nowMs, phase: run.phase_index });
  for (const g of scenario.goals) {
    if (run.goals_hit.includes(g.id)) continue;
    const rx = g.matcher ? new RegExp(g.matcher, 'i') : null;
    if (rx && rx.test(text)) run.goals_hit.push(g.id);
  }
  // Critical traps: patterns of agreement spring the trap deterministically
  for (const ce of scenario.critical_errors ?? []) {
    if (run.criticals_hit.includes(ce.id) || !ce.matcher) continue;
    const rx = new RegExp(ce.matcher, 'i');
    if (rx.test(text)) run.criticals_hit.push(ce.id);
  }
  return run;
}

/** Advance the phase, which releases the facts belonging to it. */
export function advancePhase(scenario, run) {
  if (run.phase_index >= scenario.phases.length - 1) { run.finished = true; return run; }
  run.phase_index++;
  for (const f of scenario.facts) {
    if (f.released_at_phase === run.phase_index && !run.released_fact_ids.includes(f.id)) {
      run.released_fact_ids.push(f.id);
    }
  }
  return run;
}

/**
 * THE safety core: the persona prompt contains ONLY
 * - Persona-Beschreibung + Tonvorgabe
 * - the facts ALREADY RELEASED (released_fact_ids)
 * - the transcript
 * Unreleased facts, assessment goals, trap resolutions and rubrics are NOT included.
 * Harte Anweisung: keine neuen rechtlichen Fakten erfinden.
 */
export function buildPersonaPrompt(scenario, run) {
  const released = scenario.facts.filter(f => run.released_fact_ids.includes(f.id));
  const phase = scenario.phases[run.phase_index];
  return [
    `Du spielst eine Rolle in einem Fachgespräch-Training. Rolle: ${scenario.persona.name}, ${scenario.persona.role}.`,
    `Charakter: ${scenario.persona.archetype}. Bleib strikt in der Rolle, antworte kurz und gesprächsnah auf Deutsch.`,
    `HARTE REGELN:`,
    `1. Du kennst AUSSCHLIESSLICH die unten aufgeführten Sachverhalts-Fakten. Erfinde KEINE neuen Tatsachen, Zahlen, Daten oder Systemeigenschaften.`,
    `2. Du gibst KEINE rechtlichen Einschätzungen ab und nennst keine Artikel — du bist Fachseite, nicht Jurist.`,
    `3. Wirst du nach etwas gefragt, das nicht in den Fakten steht, sagst du, dass du es nicht weißt oder nachliefern musst.`,
    `AKTUELLE GESPRÄCHSSITUATION: ${phase.opening_hint}`,
    `SACHVERHALT (nur das weißt du):`,
    ...released.map(f => `- ${f.text}`),
    `BISHERIGES GESPRÄCH:`,
    ...run.transcript.slice(-12).map(t => `${t.who === 'user' ? 'Gegenüber' : scenario.persona.name}: ${t.text}`),
    `Antworte jetzt als ${scenario.persona.name}.`
  ].join('\n');
}

/** Bewertungs-Input (frischer Aufruf, #22c): NUR Transcript + Rubrik-ID — nie Coach-Kontext. */
export function buildAssessmentPayload(scenario, run) {
  return {
    rubric_id: scenario.rubric_id,
    goals: scenario.goals.map(g => ({ id: g.id, text: g.text, competency: g.competency, hit: run.goals_hit.includes(g.id) })),
    transcript: run.transcript,
    phases_completed: run.phase_index + (run.finished ? 1 : 0),
    critical_triggered: (run.criticals_hit ?? []).length > 0,
    criticals_hit: run.criticals_hit ?? []
  };
}

// ---------- Dialog-UI (Browser) ----------

/** Expression changes along the conversation; the engine supplies the key. */
export function expressionFor(scenario, run, lastPersonaMood) {
  if (lastPersonaMood && scenario.persona.expressions[lastPersonaMood]) return lastPersonaMood;
  return run.goals_hit.length > scenario.goals.length / 2 ? 'zufrieden' : 'neutral';
}

export function renderDialog(mount, scenario, run, opts = {}) {
  const doc = mount.ownerDocument;
  mount.innerHTML = '';
  const wrap = doc.createElement('div');
  wrap.className = 'dlg';

  const head = doc.createElement('div');
  head.className = 'dlg-head';
  const img = doc.createElement('img');
  img.className = 'dlg-avatar';
  img.src = scenario.persona.expressions[expressionFor(scenario, run, opts.mood)] ?? scenario.persona.avatar;
  img.alt = scenario.persona.name;
  head.append(img, Object.assign(doc.createElement('div'), {
    className: 'dlg-who',
    innerHTML: `<b>${scenario.persona.name}</b><span>${scenario.persona.role}</span>`
  }));
  wrap.appendChild(head);

  const feed = doc.createElement('div');
  feed.className = 'dlg-feed';
  for (const t of run.transcript) {
    const b = doc.createElement('div');
    b.className = `bubble ${t.who === 'user' ? 'me' : 'them'}`;
    b.textContent = t.text;
    feed.appendChild(b);
  }
  if (opts.typing) {
    const ty = doc.createElement('div');
    ty.className = 'bubble them typing';
    ty.innerHTML = '<i></i><i></i><i></i>';
    feed.appendChild(ty);
  }
  wrap.appendChild(feed);

  // Moves: clickable suggestions plus free text
  const moves = doc.createElement('div');
  moves.className = 'dlg-moves';
  for (const m of (opts.suggestedMoves ?? [])) {
    const b = doc.createElement('button');
    b.className = 'dlg-move'; b.textContent = m;
    b.addEventListener('click', () => opts.onUserTurn?.(m));
    moves.appendChild(b);
  }
  const row = doc.createElement('div');
  row.className = 'dlg-inputrow';
  const inp = doc.createElement('textarea');
  inp.rows = 2; inp.placeholder = 'Eigene Antwort …';
  const send = doc.createElement('button');
  send.className = 'btn-primary'; send.textContent = 'Senden';
  send.addEventListener('click', () => { if (inp.value.trim()) { opts.onUserTurn?.(inp.value.trim()); inp.value = ''; } });
  row.append(inp, send);
  wrap.append(moves, row);
  mount.appendChild(wrap);
  feed.scrollTop = feed.scrollHeight;
  return wrap;
}

/** Assessment card shown once the conversation ends. */
export function renderAssessmentCard(mount, assessment) {
  const doc = mount.ownerDocument;
  const card = doc.createElement('div');
  card.className = 'card dlg-assessment';
  card.innerHTML = `<h3>Bewertung des Fachgesprächs</h3>` +
    assessment.goals.map(g =>
      `<div class="dlg-goal ${g.hit ? 'hit' : 'miss'}">${g.hit ? '✓' : '○'} ${g.text} <span class="mono">${g.competency}</span></div>`
    ).join('') +
    (assessment.feedback ? `<p>${assessment.feedback}</p>` : '');
  mount.appendChild(card);
  return card;
}
