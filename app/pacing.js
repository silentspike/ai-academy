// app/pacing.js — Zieltermin-Soll-Kurve, Machbarkeits-Check, Drift-Nachjustierung (Plan #30, §5.1).
// Derived from the amount of material and the learning profile, so the curve follows profile changes.
// Reine Logik, Node-testbar.

export const DAY_MS = 86_400_000;

/**
 * Lernprofil (Auszug): { minutesPerDay, daysPerWeek, milestones:[{id,label,date,scope_units}] }
 * Stoffmodell: { totalUnits, minutesPerUnit (Ø inkl. Review-Anteil) }
 */

/** Learning minutes available between two points in time, per profile. */
export function availableMinutes(profile, fromMs, toMs) {
  const days = Math.max(0, Math.ceil((toMs - fromMs) / DAY_MS));
  return days * (profile.daysPerWeek / 7) * profile.minutesPerDay;
}

/**
 * Feasibility check: material divided by workload divided by time, reported honestly.
 * Returns: {feasible, neededMinutesPerDay, availableMinutes, requiredMinutes, deficitUnits}
 */
export function feasibilityCheck(profile, stoff, nowMs) {
  const results = [];
  let doneUnits = stoff.doneUnits ?? 0;
  for (const ms of profile.milestones ?? []) {
    const target = Date.parse(ms.date);
    const units = (ms.scope_units ?? stoff.totalUnits) - doneUnits;
    const required = units * stoff.minutesPerUnit;
    const avail = availableMinutes(profile, nowMs, target);
    const days = Math.max(1, (target - nowMs) / DAY_MS * (profile.daysPerWeek / 7));
    const needPerDay = Math.ceil(required / days);
    results.push({
      milestone: ms.id, label: ms.label,
      feasible: avail >= required,
      requiredMinutes: Math.round(required),
      availableMinutes: Math.round(avail),
      neededMinutesPerDay: needPerDay,
      message: avail >= required
        ? `Machbar: ~${needPerDay} min an ${profile.daysPerWeek} Tagen/Woche bis „${ms.label}".`
        : `Für „${ms.label}" bräuchtest du ~${needPerDay} min/Tag (eingestellt: ${profile.minutesPerDay}) — Ziel verschieben oder Pensum erhöhen?`
    });
  }
  return results;
}

/**
 * Umfang des Stoffs — EINE Stelle für alle, die damit rechnen.
 *
 * Vier Aufrufer setzten `minutesPerUnit: 25` je für sich; das ist die reine
 * Lesezeit einer Einheit und lässt Fragen, Wiederholung, Kapitelprüfungen,
 * Fachgespräche und das Examen aus. Der ganze AI Act erschien so als Sache von
 * sieben Stunden, und der Machbarkeits-Check konnte gar nicht mehr „zu knapp"
 * sagen. Der Gesamtwert ist die Planungsgröße aus dem Bauplan (~40 h); geteilt
 * durch die tatsächliche Zahl der Einheiten ergibt er das Budget je Einheit.
 */
export const STOFF_MINUTEN_GESAMT = 2400;
export function stoffUmfang(totalUnits, doneUnits = 0) {
  return { totalUnits, minutesPerUnit: Math.round(STOFF_MINUTEN_GESAMT / Math.max(1, totalUnits)), doneUnits };
}

/** Target curve: expected progress (0..1) per day up to the final milestone. */
export function targetCurve(profile, stoff, startMs) {
  const end = Math.max(...(profile.milestones ?? []).map(m => Date.parse(m.date)), startMs + 30 * DAY_MS);
  const points = [];
  const totalAvail = availableMinutes(profile, startMs, end) || 1;
  for (let t = startMs; t < end; t += DAY_MS) {
    points.push({ ts: t, target: Math.min(1, availableMinutes(profile, startMs, t) / totalAvail) });
  }
  points.push({ ts: end, target: 1 });      // Zieltermin ist immer der letzte Kurvenpunkt
  return points;
}

/**
 * Drift-Nachjustierung (§5.1): Ist vs. Soll; ab Schwelle konkreter Entscheidungsvorschlag
 * (Tempo / Wochenziel / Termin) statt stillschweigend unerreichbarer Kurve.
 */
export function driftCheck(profile, stoff, progress /*0..1*/, startMs, nowMs, { threshold = 0.08 } = {}) {
  const curve = targetCurve(profile, stoff, startMs);
  const today = curve.find(p => p.ts >= nowMs - DAY_MS / 2) ?? curve[curve.length - 1];
  const drift = progress - today.target;
  if (drift >= -threshold) return { onTrack: true, drift };
  const feas = feasibilityCheck(profile, { ...stoff, doneUnits: Math.round(progress * stoff.totalUnits) }, nowMs);
  const worst = feas.find(f => !f.feasible) ?? feas[feas.length - 1];
  return {
    onTrack: false, drift,
    options: [
      { kind: 'tempo', text: `Tagespensum auf ~${worst?.neededMinutesPerDay ?? profile.minutesPerDay + 15} min erhöhen` },
      { kind: 'woche', text: `Lerntage von ${profile.daysPerWeek} auf ${Math.min(7, profile.daysPerWeek + 1)}/Woche erhöhen` },
      { kind: 'termin', text: 'Meilenstein bewusst verschieben (Einstellungen)' }
    ]
  };
}
