// app/session.js — Session-Ritual (Plan #32) + Intensiv-Blöcke (#33) + Rotations-Banner (§3).
// Zustandsmaschine DOM-frei; die App rendert die Schritte.

import { splitQueues, planAufhol, dueRetentionChecks } from './engine-leitner.js';

// 4-Takt (#32): Pflicht-Review → 2–3 Einheiten → Tages-Drill → Abschluss-Karte
export const STEPS = ['review', 'units', 'drill', 'wrapup'];

export function createSession(state, nowMs, { weakScores } = {}) {
  const q = splitQueues(state.cards ?? [], nowMs);
  const aufholToday = planAufhol(q.aufholMeta, { perDay: 15, weakScores }).today;
  return {
    started: nowMs,
    step: 'review',
    review: {
      kern: q.kern.map(c => c.id),
      aufhol: aufholToday.map(c => c.id),
      retentionChecks: dueRetentionChecks(state.cards ?? [], nowMs).map(c => c.id),
      done: false
    },
    unitsPlanned: 2, unitsDone: 0,
    drill: { size: 5, mix: { weak: 3, random: 1, cBonus: 1 }, done: false },  // schwächen-gewichtet (#32)
    activityLog: [],                        // [{ts, kind}] für Block-Rhythmus + Rotations-Banner
    blocks: { lastBreakAt: nowMs, count: 0 }
  };
}

/** Pflicht-Review VOR neuem Stoff — Einheiten sind gesperrt bis Review erledigt (§3 „erzwungen"). */
export function canStartUnit(session) { return session.review.done; }

export function completeStep(session, step) {
  if (step === 'review') session.review.done = true;
  if (step === 'units') session.unitsDone++;
  if (step === 'drill') session.drill.done = true;
  const idx = STEPS.indexOf(session.step);
  if (step === session.step) {
    if (step === 'units' && session.unitsDone < session.unitsPlanned) return session; // 2–3 Einheiten
    session.step = STEPS[Math.min(idx + 1, STEPS.length - 1)];
  }
  return session;
}

/** Intensiv-Block (#33): nach ~60 min automatischer Mini-Block (5 Blitzfragen + Pausenvorschlag). */
export function blockCheck(session, nowMs, { blockMinutes = 60 } = {}) {
  if (nowMs - session.blocks.lastBreakAt >= blockMinutes * 60_000) {
    session.blocks.count++;
    session.blocks.lastBreakAt = nowMs;
    return { due: true, block: session.blocks.count, miniQuiz: 5, suggestBreak: true };
  }
  return { due: false };
}

/** Examens-Warnung nach Marathon (#33): unmittelbar nach sehr langer Sitzung warnen. */
export function marathonWarning(session, nowMs, { hours = 4 } = {}) {
  const h = (nowMs - session.started) / 3_600_000;
  return h >= hours
    ? { warn: true, text: `Du lernst seit ${h.toFixed(1)} h. Ein Examens-Antritt direkt nach einem Marathon misst Erschöpfung, nicht Können — besser morgen früh.` }
    : { warn: false };
}

/** Rotations-Banner (§3): nach 2–3 gleichartigen Aktivitäten freiwilligen Wechsel vorschlagen — nie Zwang. */
export function rotationHint(session, kind, nowMs) {
  session.activityLog.push({ ts: nowMs, kind });
  const last = session.activityLog.slice(-3);
  if (last.length === 3 && last.every(a => a.kind === kind)) {
    return { hint: true, text: 'Dritte Runde desselben Formats — ein Formatwechsel würde die Unterscheidungsfähigkeit trainieren. (Nur ein Vorschlag.)' };
  }
  return { hint: false };
}

/** Abschluss-Karte (#32): Bilanz + Morgen-Vorschau. driftResult von pacing.driftCheck. */
export function wrapupCard(session, state, driftResult, nowMs) {
  return {
    bilanz: {
      reviewed: session.review.kern.length + session.review.aufhol.length,
      retentionChecks: session.review.retentionChecks.length,
      units: session.unitsDone,
      drillDone: session.drill.done,
      minutes: Math.round((nowMs - session.started) / 60_000),
      xpToday: state.stats?.xpToday ?? 0
    },
    drift: driftResult,
    morgen: {
      dueTomorrow: (state.cards ?? []).filter(c => c.due > nowMs && c.due <= nowMs + 86_400_000).length,
      nextUnit: state.nextUnit ?? null
    }
  };
}
