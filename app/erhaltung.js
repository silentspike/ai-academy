// app/erhaltung.js — Erhaltungsmodus (Plan #36): Nach bestandenem Examen wird aus
// dem Kurs ein Dauerbegleiter — täglich 5–10 Karten + 1 Szenario pro Woche.
// Reine Logik, DOM-frei (tools/erhaltung-tests.mjs).
import { DAY_MS, startOfDay } from './engine-leitner.js';

export const WEEK_MS = 7 * DAY_MS;

/** Aktiv, sobald irgendein Examens-Antritt (Teil A+B) bestanden ist. */
export function maintenanceActive(state) {
  return (state.examAttempts ?? []).some(a => a.passed);
}

/**
 * Tagesplan im Erhaltungsmodus: 5–10 Karten (fällige zuerst, dann die ältesten
 * als Auffrischung) + wöchentliches Szenario (fällig, wenn seit dem letzten
 * ≥ 7 Tage vergangen sind).
 */
export function maintenancePlan(state, scenarios, nowMs) {
  if (!maintenanceActive(state)) return { active: false };
  const cards = state.cards ?? [];
  const due = cards.filter(c => c.due <= nowMs).sort((a, b) => a.due - b.due);
  const rest = cards.filter(c => c.due > nowMs).sort((a, b) => (a.last_reviewed ?? 0) - (b.last_reviewed ?? 0));
  const daily = [...due, ...rest].slice(0, Math.max(5, Math.min(10, due.length || 5)));
  const lastSz = state.maintenance?.lastScenarioTs ?? 0;
  const szenarioDue = nowMs - lastSz >= WEEK_MS;
  const idx = Math.floor(startOfDay(nowMs) / WEEK_MS) % Math.max(1, (scenarios ?? []).length);
  return {
    active: true,
    cards: daily.map(c => c.id),
    szenarioDue,
    szenarioId: szenarioDue ? scenarios?.[idx]?.id ?? null : null,
  };
}

/** Nach absolviertem Wochen-Szenario aufrufen. */
export function markScenarioDone(state, nowMs) {
  state.maintenance = { ...(state.maintenance ?? {}), lastScenarioTs: nowMs };
  return state;
}
