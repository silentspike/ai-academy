// app/competency.js — Kompetenzmodell (Plan §3, #16, #44):
// Mapping Frage/Einheit → Kompetenz (K01..K18) + Stufe A/B/C,
// Evaluation per competency and level, plus radar data for the dashboard.
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
 * Returns: Map competency → {byLevel:{A:{n,correct,score},…}, score, weakest, sureButWrong}
 * score = weighted share correct (C counts 1.5, B 1.25, A 1.0 — application weighs more).
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
    // Diagnostic core: which level is the problem? (for example C weak while A is strong)
    c.weakest = LEVELS
      .filter(lv => c.byLevel[lv].n >= 2)
      .sort((a, b) => (c.byLevel[a].score ?? 1) - (c.byLevel[b].score ?? 1))[0] ?? null;
  }
  return out;
}

/**
 * Radar data: group competencies into bundles (for example K1 to K3).
 * competencies: content/competencies.json-Array [{id,name,…}]
 * agg: result of aggregateCompetencies
 * groupSize: axis bundling (the dashboard uses 3, giving 6 axes for 18 competencies)
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

/** Weakness ranking for the drill and for remediation. */
export function weakestCompetencies(agg, limit = 3) {
  return [...agg.entries()]
    .filter(([, c]) => c.score != null && c.n >= 3)
    .sort((a, b) => a[1].score - b[1].score)
    .slice(0, limit)
    .map(([id, c]) => ({ id, score: c.score, weakestLevel: c.weakest, sureButWrong: c.sureButWrong }));
}
