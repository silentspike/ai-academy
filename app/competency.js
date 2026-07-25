// app/competency.js — Kompetenzmodell (Plan §3, #16, #44):
// Mapping Frage/Einheit → Kompetenz (K01..K18) + Stufe A/B/C,
// Auswertung pro Kompetenz und Stufe, Radar-Daten fürs Dashboard.
// Reine Logik — kein DOM, in Node testbar.

export const LEVELS = ['A', 'B', 'C'];

// Retention-Stufen (Plan §3 Retention-Stufenmodell)
export const RETENTION = Object.freeze({
  GELERNT: 'gelernt',
  BESTAETIGT_1D: 'vorlaeufig_behalten',   // Folgetag bestätigt
  BEHALTEN_7D: 'behalten',                // nach ~7 Tagen bestätigt
  GEFESTIGT: 'gefestigt'                  // ~21–30 Tage
});

/**
 * Aggregiert Antwort-Ereignisse zu einem Kompetenzbild.
 * events: [{competency:'K03', level:'A'|'B'|'C', correct:bool, confidence:'sicher'|'unsicher'|'geraten',
 *           summative:bool, ts:epochMs}]
 * Rückgabe: Map competency → {byLevel:{A:{n,correct,score},…}, score, weakest, sureButWrong}
 * score = gewichteter Anteil richtig (C zählt 1.5, B 1.25, A 1.0 — Anwendung wiegt mehr).
 */
export function aggregateCompetencies(events) {
  const W = { A: 1, B: 1.25, C: 1.5 };
  const out = new Map();
  for (const e of events) {
    if (!e || !e.competency || !LEVELS.includes(e.level)) continue;
    let c = out.get(e.competency);
    if (!c) {
      c = { byLevel: { A: { n: 0, correct: 0 }, B: { n: 0, correct: 0 }, C: { n: 0, correct: 0 } },
            sureButWrong: 0, n: 0 };
      out.set(e.competency, c);
    }
    c.byLevel[e.level].n++;
    c.n++;
    if (e.correct) c.byLevel[e.level].correct++;
    if (!e.correct && e.confidence === 'sicher') c.sureButWrong++;
  }
  for (const c of out.values()) {
    let num = 0, den = 0;
    for (const lv of LEVELS) {
      const b = c.byLevel[lv];
      b.score = b.n ? b.correct / b.n : null;
      num += W[lv] * b.correct; den += W[lv] * b.n;
    }
    c.score = den ? num / den : null;
    // Diagnose-Kern: welche Stufe ist das Problem? (z. B. "K3-C rot bei K3-A grün")
    c.weakest = LEVELS
      .filter(lv => c.byLevel[lv].n >= 2)
      .sort((a, b) => (c.byLevel[a].score ?? 1) - (c.byLevel[b].score ?? 1))[0] ?? null;
  }
  return out;
}

/**
 * Radar-Daten: Kompetenzen in Gruppen (z. B. K1–K3) bündeln.
 * competencies: content/competencies.json-Array [{id,name,…}]
 * agg: Ergebnis von aggregateCompetencies
 * groupSize: Achsen-Bündelung (Dashboard nutzt 3 → 6 Achsen bei 18 Kompetenzen)
 */
export function radarData(competencies, agg, groupSize = 3) {
  const axes = [];
  for (let i = 0; i < competencies.length; i += groupSize) {
    const grp = competencies.slice(i, i + groupSize);
    const scores = grp.map(k => agg.get(k.id)?.score).filter(s => s != null);
    axes.push({
      label: grp.length > 1 ? `${grp[0].id}–${grp[grp.length - 1].id}` : grp[0].id,
      ids: grp.map(k => k.id),
      value: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0
    });
  }
  return axes;
}

/** Schwächen-Ranking für Drill/Nachschulung (Plan #16, #32). */
export function weakestCompetencies(agg, limit = 3) {
  return [...agg.entries()]
    .filter(([, c]) => c.score != null && c.n >= 3)
    .sort((a, b) => a[1].score - b[1].score)
    .slice(0, limit)
    .map(([id, c]) => ({ id, score: c.score, weakestLevel: c.weakest, sureButWrong: c.sureButWrong }));
}
