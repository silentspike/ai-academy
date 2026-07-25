// app/erhaltung.js — maintenance mode: once the exam is passed the course turns
// into a long-term companion — five to ten cards a day plus one scenario a week.
// Reine Logik, DOM-frei (tools/erhaltung-tests.mjs).
import { DAY_MS, startOfDay } from './engine-leitner.js';

export const WEEK_MS = 7 * DAY_MS;

/** Active as soon as any exam attempt (parts A and B) has been passed. */
export function maintenanceActive(state) {
  return (state.examAttempts ?? []).some(a => a.passed);
}

/**
 * Daily plan in maintenance mode: five to ten cards (due ones first, then the oldest
 * as a refresher) plus a weekly scenario, due once seven days have passed since
 * the previous one.
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
