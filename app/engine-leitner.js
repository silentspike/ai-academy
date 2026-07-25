// app/engine-leitner.js — Spaced Repetition (Plan §3, #34):
// Leitner-Boxen mit Kern-/Aufholwarteschlange und Retention-Stufenmodell.
// Reine Logik — kein DOM, in Node testbar. Zeit kommt IMMER als Parameter (testbar, kein Date.now-Zwang).

import { RETENTION } from './competency.js';

export const DAY_MS = 86_400_000;

// Box → Intervall in Tagen bis zur nächsten Fälligkeit.
// Box 1 = neu/falsch (nächster Tag), aufsteigend bis Langzeit.
export const BOX_INTERVALS = [null, 1, 3, 7, 14, 30];
export const MAX_BOX = 5;

/** Neue Karte. refs: {competency, level, unit_id, legal_basis} werden durchgereicht. */
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
  // LOKALE Mitternacht (Plan #29 „Tageswechsel Mitternacht") — nicht UTC:
  // sonst wechselt der Lerntag in Wien erst um 01:00/02:00.
  const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime();
}
export function daysBetween(aMs, bMs) { return Math.floor((startOfDay(bMs) - startOfDay(aMs)) / DAY_MS); }

/**
 * Antwort verbuchen (Plan §3: Konfidenz steuert die Einstufung mit).
 * richtig+sicher → Box +1 · richtig+unsicher → Box bleibt · richtig+geraten → Box −1
 * falsch → Box 1. Retention-Stufen NUR über echte Zeitabstände (Intensiv-Tag erhöht nichts, #33).
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
  // Stufenaufstieg nur bei bestätigendem Abstand — Same-Day-Wiederholung zählt nie (gap 0).
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
 * Kern   = heute regulär fällig (due liegt heute oder war gestern fällig — normaler Rhythmus).
 * Aufhol = überfällig ≥2 Tage (Pausen-Rückstand) — wird NICHT komplett auf heute gekippt,
 *          sondern über die kommenden Tage verteilt; nichts verfällt.
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
 * Aufhol-Verteilung (Plan #34): priorisiert nach Überfälligkeit + Kompetenz-Schwäche,
 * gedeckelt pro Tag → Rückgabe: heutige Aufhol-Portion + Restplan.
 * weakScores: Map competency → score (0..1, niedriger = schwächer) — optional.
 */
export function planAufhol(aufholMeta, { perDay = 15, weakScores = new Map() } = {}) {
  const prio = [...aufholMeta].sort((a, b) => {
    const wa = weakScores.get(a.card.competency) ?? .5;
    const wb = weakScores.get(b.card.competency) ?? .5;
    // überfälliger zuerst; bei Gleichstand schwächere Kompetenz zuerst
    return (b.overdueDays - a.overdueDays) || (wa - wb);
  });
  const days = [];
  for (let i = 0; i < prio.length; i += perDay) days.push(prio.slice(i, i + perDay).map(x => x.card));
  return { today: days[0] ?? [], plan: days };
}

/** Retention-Checks des Vortags (Session-Ritual #32): gestern gelernte Einheiten heute bestätigen. */
export function dueRetentionChecks(cards, nowMs) {
  const today = startOfDay(nowMs);
  return cards.filter(c =>
    c.retention === RETENTION.GELERNT &&
    c.last_review == null &&
    today - startOfDay(c.created) === DAY_MS
  );
}
