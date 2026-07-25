// app/unit-view.js — Einheiten-Renderer (Plan §3, #5–#7): Problem-first (profiladaptiv),
// Chunks and checks, verbatim-text boxes (with an amendment note), recital boxes,
// mnemonics and embedded widgets. Answers feed spaced repetition and competency events.

import { renderQuestion } from './engine-quiz.js';
import { renderTimeline, renderAssignment, renderErwgExplorer, renderAnnexExplorer, renderRoleSwitch } from './engine-widgets.js';
import { applyEvent, ceremony, CEREMONY } from './gamification.js';
import { LlmAdapter } from './llm-adapter.js';

/**
 * Asynchronous follow-up from the coach: Socratic, a hint rather than the answer.
 * Formative, so notes and the learning journal MAY enter the prompt; the ban applies
 * to summative calls only, and the separate prompt builders enforce that structurally.
 */
function coachNachschlag(mount, unit, question, result, confidence, ctx) {
  const box = mount.ownerDocument.createElement('div');
  box.className = 'coach-note';
  box.innerHTML = '<span class="dim">Coach denkt nach …</span>';
  mount.appendChild(box);
  const llm = new LlmAdapter({});
  const sicherUndFalsch = result.verdict !== 'correct' && confidence === 'sicher';
  llm.coach({
    topic: unit.title,
    unitContext: `Einheit ${unit.id} · Kompetenz ${question.competency ?? unit.competency} · Stufe ${question.level ?? unit.level}`,
    notes: ctx?.state?.notes?.[unit.id] ?? '',
    journal: ctx?.state?.journal?.summary ?? '',
    profileHints: ctx?.profile?.fachprofil ? `Organisation: ${ctx.profile.fachprofil.organisation}; Analogie-Anker: ${ctx.profile.fachprofil.analogie_anker ?? '—'}` : '',
    userMessage: `Ich habe folgende Frage ${result.verdict === 'correct' ? 'RICHTIG' : 'FALSCH'} beantwortet` +
      `${sicherUndFalsch ? ' — und war mir dabei SICHER (Scheinwissen-Signal, sprich das an)' : ''}:\n\n` +
      `„${question.prompt}"\n\nGib mir in 2–3 Sätzen einen sokratischen Hinweis (keine Lösung vorsagen), ` +
      `der mir hilft, das Muster dahinter zu behalten. Kein Lob ohne Substanz.`,
  }).then(r => {
    const txt = (r?.text ?? '').trim();
    box.innerHTML = txt
      ? `<div class="coach-head">Coach</div><p>${escapeHtml(txt)}</p><span class="grade-label mono">Bewertungstyp: LLM-unterstützt · formativ (zählt nicht für Kompetenz-Bewertung)</span>`
      : '';
    if (!txt) box.remove();
  }).catch(() => box.remove());   // Coach ist Zusatz — Ausfall darf den Lernfluss nicht stören
}
import { newCard } from './engine-leitner.js';
import { escapeHtml } from './engine-quiz.js';

export async function renderUnit(mount, unitId, ctx) {
  const doc = mount.ownerDocument;
  const res = await fetch(`content/units/${unitId}.json`);
  if (!res.ok) { mount.innerHTML = `<div class="card"><p class="dim">Einheit ${escapeHtml(unitId)} nicht gefunden.</p></div>`; return null; }
  const unit = await res.json();
  const profileDirect = ctx?.state?.profile?.problem_first === 'direkt';

  const wrap = doc.createElement('div');
  wrap.className = 'unit';
  wrap.innerHTML = `<div class="card unit-head">
      <div class="chead"><span class="t"><h3>${escapeHtml(unit.title)}</h3>
      <span class="sub">${unit.phase.toUpperCase()} · ${unit.competency} · Stufe ${unit.level} · <span class="mono legal-ref">${escapeHtml(unit.legal_basis[0]?.ref ?? '')}</span></span></span>
      <span class="actions"><span class="pill mono" style="height:26px;padding:0 .5rem" title="Rechtsstand">${unit.legal_status === 'konsolidiert-2026-07-27' ? 'RS 27.7.2026' : '⚠ ' + escapeHtml(unit.legal_status)}</span></span></div></div>`;

  let checkCount = 0, answered = 0;
  const done = doc.createElement('div');

  for (const b of unit.blocks) {
    const card = doc.createElement('div');
    card.className = 'card unit-block';
    switch (b.type) {
      case 'problem': {
        // Adaptiv (§3): erfahrene Profile Problem-first; Einsteiger erst Worked Example
        card.classList.add('unit-problem');
        card.innerHTML = `<div class="unit-tag">Einstieg</div><div>${b.html}</div>`;
        if (!profileDirect && b.einsteiger_worked_example) {
          card.innerHTML += `<details class="unit-we" open><summary>Durchgerechnetes Beispiel zuerst</summary><p>${escapeHtml(b.einsteiger_worked_example)}</p></details>`;
        } else if (b.einsteiger_worked_example) {
          card.innerHTML += `<details class="unit-we"><summary>Durchgerechnetes Beispiel (optional)</summary><p>${escapeHtml(b.einsteiger_worked_example)}</p></details>`;
        }
        break;
      }
      case 'worked_example':
        card.innerHTML = `<div class="unit-tag">Beispiel</div><div>${b.html}</div>`; break;
      case 'concept':
        card.innerHTML = `<div>${b.html}</div>`; break;
      case 'merkbild':
        card.classList.add('unit-merkbild');
        card.innerHTML = `<div>${b.html}</div>`; break;
      case 'beispiel': {
        // Fixed didactic intent, profile-variable dressing. If the profile carries a
        // dressing for this slot, it replaces the generic text.
        const eink = (ctx?.profile?.personalisierung?.beispiel_einkleidungen ?? []).find(e => e.intent_id === b.intent_id);
        card.classList.add('unit-beispiel');
        card.innerHTML = `<div class="unit-tag">Beispiel${eink ? ' · auf dein Profil zugeschnitten' : ''}</div>
          <p>${escapeHtml(eink?.text ?? b.generisch)}</p>`;
        break;
      }
      case 'erwg':
        card.classList.add('unit-erwg');
        card.setAttribute('data-hilfsmittel', '');
        card.innerHTML = `<div class="unit-tag">Auslegung · ErwG ${escapeHtml(String(b.nr))}</div><p>${escapeHtml(b.text)}</p>`; break;
      case 'quelle':
        card.classList.add('unit-quelle');
        card.setAttribute('data-hilfsmittel', '');
        // "Verbatim text" only for real quotations; structural commentary is labelled
        // honestly as such.
        card.innerHTML = b.kind === 'einordnung'
          ? `<details><summary>Systematik-Einordnung ${escapeHtml(b.ref)}</summary><p>${escapeHtml(b.text)}</p></details>`
          : `<details><summary>Originaltext ${escapeHtml(b.ref)}${b.changed_by_omnibus ? ' <span class="legal-status-warn">· geändert durch VO 2026/1744</span>' : ''}</summary><blockquote class="mono">${escapeHtml(b.text)}</blockquote></details>`;
        break;
      case 'check': {
        checkCount++;
        card.innerHTML = `<div class="unit-tag">Check</div>`;
        const qmount = doc.createElement('div');
        card.appendChild(qmount);
        renderQuestion(qmount, b.question, {
          onAnswered: (result, confidence) => {
            answered++;
            // Immediate feedback is deterministic and already shown; the COACH supplies
            // the depth of explanation ASYNCHRONOUSLY — formative, with notes and journal.
            // Failures do not disturb the flow: no await, no blocking.
            coachNachschlag(qmount, unit, b.question, result, confidence, ctx);
            // Penalty-free space: points always, mastery only on success (kept separate)
            const ev = applyEvent(ctx.state, {
              kind: 'check_answered', level: unit.level, correct: result.verdict === 'correct',
              confidence, competency: b.question.competency ?? unit.competency, ts: Date.now()
            });
            const dks = (d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)(new Date());
            ctx.state.dayStats = ctx.state.dayStats ?? {};
            ctx.state.dayStats[dks] = { ...(ctx.state.dayStats[dks] ?? {}), questions: (ctx.state.dayStats[dks]?.questions ?? 0) + 1 };
            ctx.state.stats = ctx.state.stats ?? {}; ctx.state.stats.questions = (ctx.state.stats.questions ?? 0) + 1;
            ctx.state.events.push({ kind: 'check_answered', competency: b.question.competency ?? unit.competency, level: unit.level,
              correct: result.verdict === 'correct', confidence, summative: false, ts: Date.now() });
            ceremony(doc, CEREMONY.KLEIN, { xp: ev.xpGain, anchor: card });
            ctx.saveState();
            if (answered === checkCount) finishUnit();
          }
        });
        break;
      }
      case 'widget': {
        card.innerHTML = `<div class="unit-tag">Interaktiv</div>`;
        const wmount = doc.createElement('div');
        card.appendChild(wmount);
        if (b.widget === 'timeline') {
          fetch('content/fristen.json').then(r => r.json()).then(m => {
            renderTimeline(wmount, m.geltungsstufen.map(g => ({
              id: g.id, date: g.applies_from, label: g.was.slice(0, 26) + (g.was.length > 26 ? '…' : ''),
              changed_by_omnibus: /1744|verschoben|NEU/i.test(g.basis + g.status)
            })));
          });
        } else if (b.widget === 'assignment' && b.payload?.zones) {
          renderAssignment(wmount, b.payload);
        } else if (b.widget === 'erwg-explorer') {
          fetch('content/erwg-kompendium.json').then(r => r.json()).then(k => renderErwgExplorer(wmount, k));
        } else if (b.widget === 'annex3') {
          fetch('content/facts-db.json').then(r => r.json()).then(() => renderAnnexExplorer(wmount, b.payload?.areas ?? []));
        } else if (b.widget === 'roleswitch') {
          renderRoleSwitch(wmount, b.payload ?? {});
        } else {
          wmount.innerHTML = `<p class="dim">Widget „${escapeHtml(b.widget)}" wird in dieser Ansicht über die Testseite geprüft.</p>`;
        }
        break;
      }
    }
    wrap.appendChild(card);
  }
  wrap.appendChild(done);

  // Notizen + eigene Karten (#37, Generation Effect): Notiz pro Einheit persistiert;
  // Self-authored cards feed the spaced-repetition system. The tutor uses them FORMATIVELY only;
  // the summative prompt builders have no parameter for notes at all.
  const notesBox = doc.createElement('div');
  notesBox.className = 'card unit-notes';
  const savedNote = ctx.state.notes?.[unit.id] ?? '';
  notesBox.innerHTML = `<h4>Meine Notizen</h4>
    <textarea class="q-freetext" rows="3" placeholder="Eigene Merksätze, offene Fragen …">${savedNote.replace(/</g, '&lt;')}</textarea>
    <div style="display:flex;gap:8px;margin-top:6px">
      <button class="btn" data-act="save">Notiz speichern</button>
      <button class="btn" data-act="card">Als eigene Karte in die Wiederholung</button>
    </div><span class="dim" data-role="msg"></span>`;
  notesBox.addEventListener('click', ev => {
    const act = ev.target.dataset?.act;
    if (!act) return;
    const text = notesBox.querySelector('textarea').value.trim();
    const msg = notesBox.querySelector('[data-role=msg]');
    if (act === 'save') {
      ctx.state.notes = { ...(ctx.state.notes ?? {}), [unit.id]: text };
      ctx.saveState();
      msg.textContent = 'Notiz gespeichert (fließt nur in Coach-Feedback ein, nie in Prüfungen).';
    }
    if (act === 'card') {
      if (text.length < 8) { msg.textContent = 'Für eine Karte braucht es etwas mehr Text.'; return; }
      const id = `custom-${unit.id}-${(ctx.state.cards ?? []).filter(c => c.id.startsWith('custom-')).length + 1}`;
      ctx.state.cards = ctx.state.cards ?? [];
      ctx.state.cards.push(newCard(id, { custom: true, competency: unit.competency, front: `Eigene Karte: ${unit.title}`, back: text }, Date.now()));
      ctx.saveState();
      msg.textContent = `Eigene Karte angelegt (${id}) — ab morgen in der Wiederholung.`;
    }
  });
  wrap.appendChild(notesBox);
  mount.appendChild(wrap);

  function finishUnit() {
    // Unit completed: activity points plus the unit's cards into the repetition queue
    const ev = applyEvent(ctx.state, { kind: 'unit_completed', correct: true, competency: unit.competency, ts: Date.now() });
    ctx.state.events.push({ kind: 'unit_completed', competency: unit.competency, ts: Date.now() });   // Kurven-Datenpunkt
    ctx.state.stats = ctx.state.stats ?? {}; ctx.state.stats.units = (ctx.state.stats.units ?? 0) + 1;
    const dk = (d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)(new Date());
    ctx.state.dayStats = ctx.state.dayStats ?? {};
    ctx.state.dayStats[dk] = { ...(ctx.state.dayStats[dk] ?? {}), units: (ctx.state.dayStats[dk]?.units ?? 0) + 1, xp: (ctx.state.dayStats[dk]?.xp ?? 0) + ev.xpGain };
    import('./rewards.js').then(({ checkRewards }) => { checkRewards(ctx.state, doc); ctx.saveState(); });
    if (!ctx.state.unit_done?.includes(unit.id)) {
      ctx.state.unit_done = [...(ctx.state.unit_done ?? []), unit.id];
      fetch('content/flashcards.json').then(r => r.json()).then(fc => {
        const mine = fc.cards.filter(c => c.id.startsWith(`fc-${unit.phase}`));
        for (const c of mine) {
          if (!ctx.state.cards.some(x => x.id === c.id)) {
            ctx.state.cards.push(newCard(c.id, { competency: c.competency, front: c.front, back: c.back }, Date.now()));
          }
        }
        ctx.saveState();
      });
    }
    // Sitzungs-Takt „units" fortschreiben (#32)
    import('./ritual.js').then(({ todaySession }) => import('./session.js').then(({ completeStep }) => {
      completeStep(todaySession(ctx.state), 'units'); ctx.saveState();
    }));
    done.innerHTML = `<div class="card unit-done"><b>Einheit abgeschlossen.</b>
      <span class="dim">+${ev.xpGain} XP · Karten wandern in die Wiederholung (morgen fällig — Retention zählt erst ab Folgetag).</span></div>`;
    ctx.saveState();
  }
  return unit;
}
