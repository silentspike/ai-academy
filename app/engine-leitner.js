// app/engine-leitner.js — Spaced Repetition (Plan §3, #34):
// Leitner boxes with a core and a catch-up queue, plus retention tiers.
// Pure logic, no DOM, testable in Node. Time is ALWAYS a parameter, never Date.now.

import { RETENTION } from './competency.js';

export const DAY_MS = 86_400_000;

// Box → interval in days until the next due date.
// Box 1 = new or wrong (next day), rising to long-term.
export const BOX_INTERVALS = [null, 1, 3, 7, 14, 30];
export const MAX_BOX = 5;

/** New card. refs: {competency, level, unit_id, legal_basis} are passed through. */
export function newCard(id, meta = {}, nowMs) {
  return {
    id, box: 1, ...meta,
    created: nowMs,
    last_review: null,
    due: startOfDay(nowMs) + DAY_MS,      // neue Karten: ab morgen fällig (heute wurde gelernt)
    retention: RETENTION.GELERNT,
    history: []                            // [{ts, correct, confidence}]
  };
}

export function startOfDay(ms) {
  // LOCAL midnight, not UTC: otherwise the learning day would roll over at
  // one or two in the morning in Central European time.
  const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime();
}
export function daysBetween(aMs, bMs) { return Math.floor((startOfDay(bMs) - startOfDay(aMs)) / DAY_MS); }

/**
 * Record an answer; the stated confidence co-determines the placement.
 * richtig+sicher → Box +1 · richtig+unsicher → Box bleibt · richtig+geraten → Box −1
 * Wrong → box 1. Retention tiers advance ONLY on real elapsed time; a marathon day promotes nothing.
 */
export function review(card, { correct, confidence = 'sicher' }, nowMs) {
  const prev = card.last_review;
  card.history.push({ ts: nowMs, correct, confidence });
  if (correct) {
    if (confidence === 'sicher') card.box = Math.min(MAX_BOX, card.box + 1);
    else if (confidence === 'geraten') card.box = Math.max(1, card.box - 1);
    const gap = prev == null ? daysBetween(card.created, nowMs) : daysBetween(prev, nowMs);
    card.retention = nextRetention(card.retention, gap);
  } else {
    card.box = 1;
    card.retention = RETENTION.GELERNT;   // Fehlleistung wirft auf „gelernt" zurück
  }
  card.last_review = nowMs;
  card.due = startOfDay(nowMs) + BOX_INTERVALS[card.box] * DAY_MS;
  return card;
}

function nextRetention(current, gapDays) {
  // A tier only advances on a confirming interval; same-day repetition never counts (gap 0).
  if (gapDays >= 21) return RETENTION.GEFESTIGT;
  if (gapDays >= 7) {
    return (current === RETENTION.BEHALTEN_7D || current === RETENTION.GEFESTIGT)
      ? RETENTION.GEFESTIGT : RETENTION.BEHALTEN_7D;
  }
  if (gapDays >= 1) {
    return current === RETENTION.GELERNT ? RETENTION.BESTAETIGT_1D : current;
  }
  return current;
}

/**
 * Kern-/Aufholwarteschlange (Plan #34):
 * Core     = regularly due today (due today or yesterday — the normal rhythm).
 * Catch-up = overdue by two days or more after a break. It is NOT dumped onto today but
 *            spread across the coming days; nothing expires.
 */
export function splitQueues(cards, nowMs) {
  const today = startOfDay(nowMs);
  const kern = [], aufhol = [];
  for (const c of cards) {
    if (c.due > today) continue;                    // noch nicht fällig
    const overdueDays = daysBetween(c.due, today);
    if (overdueDays <= 1) kern.push(c);
    else aufhol.push({ card: c, overdueDays });
  }
  return { kern, aufhol: aufhol.map(x => x.card), aufholMeta: aufhol };
}

/**
 * Catch-up distribution: prioritised by how overdue a card is and by competency weakness,
 * capped per day. Returns today's portion plus the remaining plan.
 * weakScores: Map competency → score (0..1, lower means weaker) — optional.
 */
export function planAufhol(aufholMeta, { perDay = 15, weakScores = new Map() } = {}) {
  const prio = [...aufholMeta].sort((a, b) => {
    const wa = weakScores.get(a.card.competency) ?? .5;
    const wb = weakScores.get(b.card.competency) ?? .5;
    // more overdue first; on a tie, the weaker competency first
    return (b.overdueDays - a.overdueDays) || (wa - wb);
  });
  const days = [];
  for (let i = 0; i < prio.length; i += perDay) days.push(prio.slice(i, i + perDay).map(x => x.card));
  return { today: days[0] ?? [], plan: days };
}

/** Retention checks from the previous day: confirm today what was learned yesterday. */
export function dueRetentionChecks(cards, nowMs) {
  const today = startOfDay(nowMs);
  return cards.filter(c =>
    c.retention === RETENTION.GELERNT &&
    c.last_review == null &&
    today - startOfDay(c.created) === DAY_MS
  );
}
