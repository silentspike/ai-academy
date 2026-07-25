#!/usr/bin/env node
// tools/gold-set-run.mjs — Gold-Set-Lauf (Plan #27a, Gate 3):
// checks the tutor's grading scale against content/goldset.json (54 reference answers,
// 18 of them held out — the holdout never fed into prompt development but is
// measured here as well). Mandatory on every model or prompt change.
//
// Metrics per entry: score deviation |actual−expected|/max, pass/fail flip
// (Verdict-Klasse weicht ab), falsche Critical-Error-Erkennung.
// TOLERANCES (a breach locks grading automatically — not merely a report):
//   T1  mittlere normierte Abweichung  ≤ 0.15
//   T2  Kippfall-Quote                 ≤ 0.15
//   T3  falsche Critical-Errors        = 0
//   T4  max. Einzelabweichung          ≤ 0.35
// Bei Verletzung: data/store/summative_lock.json → Bridge sperrt summative
// grading (chapter test, exam, appeal) until a fresh run passes.
//
// Aufruf:  node tools/gold-set-run.mjs [--reps N] [--sample N] [--entries id,id]
//          [--bridge http://127.0.0.1:8791] [--dry]
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
const ROOT = new URL('..', import.meta.url).pathname;

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const REPS = Number(arg('--reps', '1'));
const SAMPLE = arg('--sample', null);
const ONLY = arg('--entries', null)?.split(',');
const BRIDGE = arg('--bridge', 'http://127.0.0.1:8791');
const TOKEN = process.env.BRIDGE_TOKEN;
if (!TOKEN) { console.error('BRIDGE_TOKEN-Umgebungsvariable fehlt (Pairing-Token der Bridge).'); process.exit(2); }
const DRY = process.argv.includes('--dry');

const TOL = { meanDev: 0.15, flipRate: 0.15, falseCritical: 0, maxDev: 0.35 };
const VERDICT_MAP = { correct: 'korrekt', partial: 'teilweise', wrong: 'falsch' };

const gold = JSON.parse(readFileSync(join(ROOT, 'content/goldset.json'), 'utf-8')).entries;
const questions = Object.fromEntries(
  JSON.parse(readFileSync(join(ROOT, 'content/questions-core.json'), 'utf-8')).questions.map(q => [q.id, q]));

let entries = ONLY ? gold.filter(e => ONLY.includes(e.id)) : gold;
if (SAMPLE) entries = entries.slice(0, Number(SAMPLE));

const LOCK = join(ROOT, 'data/store/summative_lock.json');

async function gradeOnce(entry) {
  const q = questions[entry.question_id];
  if (!q) throw new Error(`goldset ${entry.id}: Frage ${entry.question_id} fehlt`);
  const rubric = q.rubric ? JSON.stringify(q.rubric) : '';
  const res = await fetch(BRIDGE + '/api/grade', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Bridge-Token': TOKEN },
    body: JSON.stringify({
      question: q.prompt, rubric, modelAnswer: q.model_answer || '',
      answer: entry.answer_text, kind: 'goldset',
    }),
  });
  if (!res.ok) throw new Error(`grade HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

const results = [];
console.log(`Gold-Set-Lauf: ${entries.length} Einträge × ${REPS} Wiederholung(en) gegen ${BRIDGE}`);
if (DRY) { console.log('(dry) — keine Aufrufe'); process.exit(0); }

const health = await (await fetch(BRIDGE + '/api/health')).json();
console.log(`Bewerter: ${health.activeCli} / ${health.model} / prompts ${health.promptsVersion}`);

async function gradeWithRetry(e) {
  try { return await gradeOnce(e); }
  catch (err) {
    console.error(`  ${e.id}: 1. Versuch fehlgeschlagen (${String(err.message).slice(0, 120)}) — Retry`);
    return gradeOnce(e);                       // genau 1 Retry bei transienten Fehlern
  }
}

for (const e of entries) {
  for (let r = 0; r < REPS; r++) {
    const t0 = Date.now();
    try {
      const raw = await gradeWithRetry(e);
      const out = raw.result ?? raw;              // Bridge liefert {txId, result, label}
      const max = out.max || e.target_max;
      const dev = Math.abs((out.score ?? 0) - e.target_score) / (e.target_max || 10);
      // Pass/fail flip: expected and actual land on different sides of the
      // 80 % pass mark. The verdict word is supplementary, not the metric.
      const PASS = 0.8;
      const flip = (e.target_score / (e.target_max || 10) >= PASS) !== ((out.score ?? 0) / (out.max || e.target_max || 10) >= PASS);
      const verdictMismatch = out.verdict !== VERDICT_MAP[e.target_verdict];
      const falseCrit = !!out.critical_error !== !!e.expect_critical;
      results.push({ id: e.id, rep: r, holdout: e.holdout, anchor: e.anchor_level,
        soll: e.target_score, ist: out.score, max, verdict: out.verdict,
        sollVerdict: VERDICT_MAP[e.target_verdict], dev: +dev.toFixed(3), flip, verdictMismatch, falseCrit,
        ms: Date.now() - t0 });
      console.log(`  ${e.id} r${r} [${e.anchor_level}${e.holdout ? '/holdout' : ''}] soll ${e.target_score}/${e.target_max} → ist ${out.score}/${max} ${out.verdict}${flip ? ' KIPPFALL' : ''}${falseCrit ? ' FALSCH-CRITICAL' : ''} (${Math.round((Date.now() - t0) / 1000)}s)`);
    } catch (err) {
      results.push({ id: e.id, rep: r, error: String(err.message).slice(0, 200) });
      console.error(`  ${e.id} r${r} FEHLER: ${err.message}`);
    }
  }
}

const ok = results.filter(r => !r.error);
const errors = results.length - ok.length;
const meanDev = ok.reduce((s, r) => s + r.dev, 0) / (ok.length || 1);
const flips = ok.filter(r => r.flip).length;
const flipRate = flips / (ok.length || 1);
const falseCrit = ok.filter(r => r.falseCrit).length;
const maxDev = Math.max(0, ...ok.map(r => r.dev));
const breaches = [];
if (meanDev > TOL.meanDev) breaches.push(`T1 mittlere Abweichung ${meanDev.toFixed(3)} > ${TOL.meanDev}`);
if (flipRate > TOL.flipRate) breaches.push(`T2 Kippfall-Quote ${flipRate.toFixed(3)} > ${TOL.flipRate}`);
if (falseCrit > TOL.falseCritical) breaches.push(`T3 falsche Critical-Errors ${falseCrit} > 0`);
if (maxDev > TOL.maxDev) breaches.push(`T4 max. Einzelabweichung ${maxDev.toFixed(3)} > ${TOL.maxDev}`);
if (errors > 0) breaches.push(`Technische Fehler: ${errors}`);

const report = {
  ts: new Date().toISOString(), bridge: BRIDGE, model: health.model,
  promptsVersion: health.promptsVersion, entries: entries.length, reps: REPS,
  metrics: { meanDev: +meanDev.toFixed(3), flipRate: +flipRate.toFixed(3), flips, falseCritical: falseCrit, maxDev: +maxDev.toFixed(3), errors },
  tolerances: TOL, breaches, pass: breaches.length === 0, results,
};
mkdirSync(join(ROOT, 'data/goldset-reports'), { recursive: true });
const rp = join(ROOT, `data/goldset-reports/run-${report.ts.replace(/[:.]/g, '-')}.json`);
writeFileSync(rp, JSON.stringify(report, null, 1));

console.log(`\nErgebnis: meanDev=${report.metrics.meanDev} flipRate=${report.metrics.flipRate} falseCritical=${falseCrit} maxDev=${report.metrics.maxDev} errors=${errors}`);
console.log(`Report: ${rp}`);
const vollerLauf = entries.length === gold.length;
if (report.pass && vollerLauf) {
  if (existsSync(LOCK)) { rmSync(LOCK); console.log('GRÜN (voller Lauf) — Auto-Sperre aufgehoben.'); }
  else console.log('GRÜN (voller Lauf) — keine Sperre aktiv.');
} else if (report.pass) {
  // Partial runs (--entries/--sample) are diagnostics, not release evidence: they must
  // NEVER lift the lock, otherwise a single-question probe would unlock grading.
  console.log(`GRÜN für ${entries.length}/${gold.length} Einträge — Teillauf, Sperre bleibt unverändert. Für die Freigabe: voller Lauf ohne --entries/--sample.`);
} else {
  writeFileSync(LOCK, JSON.stringify({ locked: true, since: report.ts, reason: breaches, report: rp, teillauf: !vollerLauf }, null, 1));
  console.error(`ROT — summative Bewertung GESPERRT (${LOCK}):\n  ${breaches.join('\n  ')}`);
  process.exit(1);
}
