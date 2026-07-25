// app/exam-core.js — exam system logic. Pure logic, DOM-free and testable in Node.
// kein DOM, in Node testbar (tools/exam-tests.mjs).
//
// Bausteine: Fragenauswahl nach Blueprint (Kapiteltest 2-teilig, Examen Teil A),
// deterministische Bewertung + Critical-Error-Gates (#16a, eng gefasst),
// Examens-Gate (#12: P1–P9 bestanden + Kern-Kompetenzen „behalten"),
// Score-Serien (#17: first/latest/best NUR innerhalb desselben Bewertungsregimes),
// Remediation per competency; placement yields recommendations plus a challenge test.
//
// Cut-score derivation: docs/CUT-SCORE-BLUEPRINT.md · list of critical errors,
// published in advance: docs/CRITICAL-ERRORS.md

import { RETENTION } from './competency.js';

export const PASS_SCORE = 0.8;                       // #10, Herleitung im Blueprint-Doc
export const KERN_MIN = 0.5;                         // Mindestleistung je Kern-Kompetenz im Test
export const BLUEPRINT_VERSION = '1.0.0';

// Composition: chapter test 25/50/25, exam part A 15/50/35 across levels A, B and C.
export const TEST_MIX = { A: 0.25, B: 0.5, C: 0.25 };
export const EXAM_MIX = { A: 0.15, B: 0.5, C: 0.35 };

// ---------------------------------------------------------------- deterministische Auswahl
// Hash seed (as in variants.js): stable per (poolVersion, salt), so a retake with a
// different salt draws other questions; the selection itself uses no date or randomness.
export function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

function pickWeighted(pool, n, mix, rnd, excludeIds = new Set()) {
  const byLevel = { A: [], B: [], C: [] };
  for (const q of pool) if (!excludeIds.has(q.id)) (byLevel[q.level] ?? byLevel.B).push(q);
  const want = { A: Math.round(n * mix.A), B: Math.round(n * mix.B), C: 0 };
  want.C = n - want.A - want.B;
  const out = [];
  for (const lvl of ['A', 'B', 'C']) {
    const src = [...byLevel[lvl]];
    for (let i = 0; i < want[lvl] && src.length; i++) {
      const j = Math.floor(rnd() * src.length);
      out.push(src.splice(j, 1)[0]);
    }
  }
  // Top up if a level was too thinly populated
  const chosen = new Set(out.map(q => q.id));
  const rest = pool.filter(q => !chosen.has(q.id) && !excludeIds.has(q.id));
  while (out.length < n && rest.length) out.push(rest.splice(Math.floor(rnd() * rest.length), 1)[0]);
  return out;
}

// ---------------------------------------------------------------- Kapiteltest (2-teilig, #10)
// Part 1, triage — closed book, only formats that can be graded deterministically.
// Part 2, source work — open book (the regulation is available), free text and cases.
// Exclusively the approved pool: only status approved_summative.
export function buildChapterTest(phaseId, pool, { salt = 'v1', part1Count = 8, part2Count = 2, excludeIds = new Set() } = {}) {
  const approved = pool.filter(q => q.status === 'approved_summative' && q.id.startsWith(phaseId + '-'));
  const rnd = hashSeed(`${phaseId}|${salt}|chapter`);
  const det = approved.filter(q => ['mc', 'multi', 'assign'].includes(q.type));
  const open = approved.filter(q => ['freetext', 'case'].includes(q.type));
  const part1 = pickWeighted(det.concat(open.filter(q => q.type === 'case')), part1Count, TEST_MIX, rnd, excludeIds);
  const p1Ids = new Set(part1.map(q => q.id));
  const part2 = pickWeighted(open.filter(q => !p1Ids.has(q.id)), part2Count, { A: 0, B: 0.5, C: 0.5 }, rnd, excludeIds);
  return { phaseId, salt, part1, part2, mode1: 'closed_book', mode2: 'open_book' };
}

// ---------------------------------------------------------------- Examen Teil A (#11)
export function buildExamA(pool, { salt = 'v1', count = 40, excludeIds = new Set() } = {}) {
  const approved = pool.filter(q => q.status === 'approved_summative');
  const rnd = hashSeed(`exam-a|${salt}`);
  // Format-Mix (#11): ~20 MC (inkl. Mehrfachauswahl), ~8 Zuordnung, ~8 Fall, ~4 Freitext
  const buckets = [
    { types: ['mc', 'multi'], n: Math.round(count * 0.5) },
    { types: ['assign'], n: Math.round(count * 0.2) },
    { types: ['case'], n: Math.round(count * 0.2) },
    { types: ['freetext'], n: count - Math.round(count * 0.5) - 2 * Math.round(count * 0.2) },
  ];
  const out = []; const used = new Set(excludeIds);
  for (const b of buckets) {
    const src = approved.filter(q => b.types.includes(q.type));
    out.push(...pickWeighted(src, b.n, EXAM_MIX, rnd, used));
    out.forEach(q => used.add(q.id));
  }
  return { salt, questions: out, mode: 'closed_book', minutes: 60 };
}

// ---------------------------------------------------------------- Bewertung + Critical Errors
// Deterministic for multiple choice, multi-select and assignment; free-text scores arrive
// herein ({score, max, critical_error}). Critical-Error-Gate (#16a, v3.2 eng):
// applies ONLY when the question carries critical_error; requires_complete_facts was
// enforced at authoring time by check-questions and the validator.
export function gradeAnswer(q, answer) {
  if (q.type === 'mc' || q.type === 'case') {
    const correctId = q.options.find(o => o.correct)?.id;
    const ok = answer === correctId;
    const critical = !ok && !!q.critical_error && (q.critical_error.option_ids || []).includes(answer);
    return { score: ok ? 1 : 0, max: 1, correct: ok, critical, deterministic: true };
  }
  if (q.type === 'multi') {
    const soll = new Set(q.options.filter(o => o.correct).map(o => o.id));
    const ist = new Set(Array.isArray(answer) ? answer : []);
    const ok = soll.size === ist.size && [...soll].every(x => ist.has(x));
    return { score: ok ? 1 : 0, max: 1, correct: ok, critical: false, deterministic: true };
  }
  if (q.type === 'assign') {
    const soll = q.pairs || [];
    const ist = answer || {};
    const hit = soll.filter(p => ist[p.left] === p.right).length;
    return { score: hit / (soll.length || 1), max: 1, correct: hit === soll.length, critical: false, deterministic: true };
  }
  return null; // freetext/LLM — Ergebnis kommt von außen
}

export function evaluateTest({ questions, results, kompetenzen }) {
  let score = 0, max = 0;
  const criticals = [];
  const perComp = new Map();
  questions.forEach((q, i) => {
    const r = results[i];
    if (!r) return;
    const norm = (r.score ?? 0) / (r.max || 1);
    score += norm; max += 1;
    if (r.critical || r.critical_error) criticals.push(q.id);
    const c = perComp.get(q.competency) || { n: 0, sum: 0 };
    c.n++; c.sum += norm; perComp.set(q.competency, c);
  });
  const pct = max ? score / max : 0;
  const kernIds = new Set((kompetenzen || []).filter(k => k.kern).map(k => k.id));
  const kernFails = [...perComp.entries()]
    .filter(([id, c]) => kernIds.has(id) && c.n >= 2 && c.sum / c.n < KERN_MIN)
    .map(([id]) => id);
  const passed = pct >= PASS_SCORE && criticals.length === 0 && kernFails.length === 0;
  return {
    pct: +pct.toFixed(3), passed, criticals, kernFails,
    reason: criticals.length ? 'critical_error' : kernFails.length ? 'kern_mindestleistung' : pct < PASS_SCORE ? 'score' : null,
    perCompetency: Object.fromEntries([...perComp.entries()].map(([k, c]) => [k, +(c.sum / c.n).toFixed(2)])),
  };
}

// ---------------------------------------------------------------- Examens-Gate (#12 + Retention §3)
export function examGate(state, { kompetenzen, cards = [], nowMs }) {
  const reasons = [];
  const tests = state.chapterTests || {};
  for (let p = 1; p <= 9; p++) {
    if (!tests['p' + p]?.passed) reasons.push(`Kapiteltest P${p} nicht bestanden`);
  }
  // Core competencies at the "retained" tier (seven-day confirmation), via card retention
  const kernIds = (kompetenzen || []).filter(k => k.kern).map(k => k.id);
  const okStages = new Set([RETENTION.BEHALTEN_7D, RETENTION.GEFESTIGT]);
  for (const kid of kernIds) {
    const kCards = cards.filter(c => (c.competency ?? c.meta?.competency) === kid);
    if (!kCards.length || !kCards.some(c => okStages.has(c.retention)))
      reasons.push(`Kern-Kompetenz ${kid} nicht auf Stufe „behalten" (7-Tage-Bestätigung fehlt)`);
  }
  // 1 Antritt pro Kalendertag (#11)
  const d = new Date(nowMs);
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; // lokaler Kalendertag (#29)
  const attempts = (state.examAttempts || []).filter(a => a.day === today);
  if (attempts.length >= 1) reasons.push('Heute bereits ein Examens-Antritt (max. 1/Kalendertag)');
  return { allowed: reasons.length === 0, reasons };
}

// ---------------------------------------------------------------- Score-Serien (#17)
// Regime key: legal baseline plus content, prompt/rubric, model and blueprint version.
// Series are NEVER mixed; a change starts a new series with a visible divider.
export function regimeKey({ rechtsstand, contentVersion, promptsVersion, model }) {
  return [rechtsstand, contentVersion, promptsVersion, model, BLUEPRINT_VERSION].join('|');
}

export function recordScore(series, key, entry) {
  const s = series[key] || (series[key] = { first: null, latest: null, best: null, runs: [] });
  s.runs.push(entry);
  if (!s.first) s.first = entry;
  s.latest = entry;
  if (!s.best || entry.pct > s.best.pct) s.best = entry;
  return s;
}

// ---------------------------------------------------------------- Nachschulung (#16)
export function nachschulungPlan(evalResult, { pool, units, scenarios = [], questionsPerComp = 6 }) {
  const weak = Object.entries(evalResult.perCompetency)
    .filter(([, v]) => v < PASS_SCORE).map(([k]) => k);
  const target = [...new Set([...weak, ...evalResult.kernFails])];
  return target.map(comp => ({
    competency: comp,
    units: (units || []).filter(u => (u.competencies || []).includes(comp)).map(u => u.id),
    questions: pool.filter(q => q.competency === comp && q.status === 'approved_summative')
      .slice(0, questionsPerComp).map(q => q.id),
    // Remediation also requires ONE short scenario per competency: application, not recognition
    szenario: (scenarios.find(s => s.competency === comp)
      ?? scenarios.find(s => (s.goals ?? []).some(g => g.competency === comp)))?.id ?? null,
    passRequired: 1.0,                       // Nachschulungs-Fragen: 100 % (#16)
  }));
}

// ---------------------------------------------------------------- placement (recommendation only)
export function placementBuild(pool, { salt = 'v1', count = 20 } = {}) {
  const approved = pool.filter(q => q.status === 'approved_summative' && ['mc', 'multi', 'case'].includes(q.type));
  const rnd = hashSeed(`placement|${salt}`);
  const phases = [...new Set(approved.map(q => q.id.split('-')[0]))];
  const perPhase = Math.max(1, Math.floor(count / phases.length));
  const out = [];
  for (const ph of phases) out.push(...pickWeighted(approved.filter(q => q.id.startsWith(ph + '-')), perPhase, TEST_MIX, rnd));
  return out.slice(0, count);
}

export function placementRecommend(questions, results) {
  const perPhase = new Map();
  questions.forEach((q, i) => {
    const ph = q.id.split('-')[0];
    const r = results[i];
    const c = perPhase.get(ph) || { n: 0, ok: 0 };
    c.n++; if (r?.correct) c.ok++;
    perPhase.set(ph, c);
  });
  // NUR Empfehlungen (#19): Skip erfordert Challenge-Test je Einheit.
  return Object.fromEntries([...perPhase.entries()].map(([ph, c]) =>
    [ph, { quote: +(c.ok / c.n).toFixed(2), empfehlung: c.ok / c.n >= 0.8 ? 'challenge_moeglich' : c.ok / c.n >= 0.5 ? 'zuegig' : 'gruendlich' }]));
}

export function buildChallengeTest(unit, pool, { salt = 'v1', count = 6 } = {}) {
  const comps = new Set(unit.competencies || []);
  const rnd = hashSeed(`challenge|${unit.id}|${salt}`);
  const src = pool.filter(q => q.status === 'approved_summative' && comps.has(q.competency));
  return { unitId: unit.id, questions: pickWeighted(src, count, { A: 0.2, B: 0.5, C: 0.3 }, rnd), passRequired: 0.8 };
}
