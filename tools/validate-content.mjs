#!/usr/bin/env node
// tools/validate-content.mjs — schema gate for content/ (SCHEMA.md is the source of truth).
// Pipeline rule: content without a legal source or competency fails. Exit 1 on errors.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const C = p => join(ROOT, 'content', p);
const errors = [], warns = [];
const err = (f, m) => errors.push(`${f}: ${m}`);
const warn = (f, m) => warns.push(`${f}: ${m}`);

const LEGAL_STATUS = ['konsolidiert-2026-07-27', 'at-vollzug-offen', 'leitlinie-erwartet'];
const Q_STATUS = ['agent_generated', 'source_linked', 'reviewed', 'approved_summative', 'retired_or_revised'];
const COMPETENCIES = new Set(
  JSON.parse(readFileSync(C('competencies.json'), 'utf8')).kompetenzen.map(k => k.id));

function checkCommon(f, o, { needLevel = true } = {}) {
  if (!o.id) err(f, `Objekt ohne id: ${JSON.stringify(o).slice(0, 60)}`);
  if (!Array.isArray(o.legal_basis) || o.legal_basis.length === 0)
    err(f, `${o.id}: legal_basis fehlt oder leer (Claims-Array Pflicht)`);
  else for (const cl of o.legal_basis) {
    if (!cl.ref || !cl.instrument) err(f, `${o.id}: Claim ohne ref/instrument`);
  }
  if (!LEGAL_STATUS.includes(o.legal_status)) err(f, `${o.id}: legal_status ungültig (${o.legal_status})`);
  if (!COMPETENCIES.has(o.competency)) err(f, `${o.id}: competency ungültig (${o.competency})`);
  if (needLevel && !['A', 'B', 'C'].includes(o.level)) err(f, `${o.id}: level ungültig (${o.level})`);
}

function checkQuestion(f, q) {
  checkCommon(f, q);
  if (!['mc', 'multi', 'case', 'freetext', 'assign'].includes(q.type)) err(f, `${q.id}: type ungültig`);
  if (!Q_STATUS.includes(q.status)) err(f, `${q.id}: status ungültig (${q.status})`);
  if (q.type === 'assign') {
    const pairs = q.pairs ?? [];
    if (pairs.length < 3) err(f, `${q.id}: assign braucht ≥3 Paare`);
    for (const p of pairs) {
      if (!p.left || !p.right) err(f, `${q.id}: assign-Paar unvollständig`);
      if (!p.rationale) err(f, `${q.id}: assign-Paar '${p.left}' ohne rationale (#15a)`);
      if (!p.source_ref) err(f, `${q.id}: assign-Paar '${p.left}' ohne source_ref (#15a)`);
    }
    const rights = new Set(pairs.map(p => p.right));
    if (rights.size !== pairs.length) err(f, `${q.id}: assign-Rechts-Seiten nicht eindeutig`);
  } else if (q.type !== 'freetext') {
    const correct = (q.options ?? []).filter(o => o.correct);
    if ((q.type === 'mc' || q.type === 'case') && correct.length !== 1)
      err(f, `${q.id}: ${q.type} braucht genau 1 richtige Option (hat ${correct.length})`);
    if (q.type === 'multi' && correct.length < 2)
      err(f, `${q.id}: multi braucht ≥2 richtige Optionen`);
    for (const o of q.options ?? []) {
      if (!o.rationale) err(f, `${q.id}/${o.id}: Option ohne rationale (jede Option begründet, #15a)`);
      if (!o.source_ref) err(f, `${q.id}/${o.id}: Option ohne source_ref (Fundstelle Pflicht, #15a)`);
    }
    const texts = new Set((q.options ?? []).map(o => o.text));
    if (texts.size !== (q.options ?? []).length) err(f, `${q.id}: doppelte Optionstexte`);
  } else {
    if (!q.rubric_id && !q.rubric) err(f, `${q.id}: freetext ohne Rubrik`);
    if (!q.model_answer) err(f, `${q.id}: freetext ohne Musterlösung`);
  }
  if (q.status === 'approved_summative' && !q.review_protocol)
    err(f, `${q.id}: approved_summative ohne review_protocol (Eigenprüfungs-Anker, #15)`);
  if (q.critical_error && q.critical_error.requires_complete_facts !== true)
    err(f, `${q.id}: critical_error muss requires_complete_facts:true tragen (#16a eng gefasst)`);
}

let counts = {};
function load(name, required = true) {
  const p = C(name);
  if (!existsSync(p)) { if (required) err(name, 'Datei fehlt'); return null; }
  try { return JSON.parse(readFileSync(p, 'utf8')); }
  catch (e) { err(name, `JSON-Fehler: ${e.message}`); return null; }
}

// ---------- questions-core ----------
const qc = load('questions-core.json');
if (qc) {
  const qs = qc.questions ?? [];
  const ids = new Set();
  for (const q of qs) {
    if (ids.has(q.id)) err('questions-core', `doppelte id ${q.id}`); ids.add(q.id);
    checkQuestion('questions-core', q);
  }
  const summ = qs.filter(q => q.status === 'approved_summative');
  const traps = summ.filter(q => q.trap?.is_trap).length;
  if (summ.length && traps / summ.length > 0.15)
    err('questions-core', `Fangfragen-Quote im summativen Pool ${Math.round(traps / summ.length * 100)}% > 15% (#13)`);
  counts.questions = qs.length;
  counts.approved_summative = summ.length;
  counts.traps = traps;
}

// ---------- units ----------
const unitDir = C('units');
let unitFiles = existsSync(unitDir) ? readdirSync(unitDir).filter(x => x.endsWith('.json') && x !== 'index.json') : [];
counts.units = 0;
for (const uf of unitFiles) {
  const u = JSON.parse(readFileSync(join(unitDir, uf), 'utf8'));
  counts.units++;
  checkCommon(`units/${uf}`, u);
  if (!u.phase || !u.title || !Array.isArray(u.blocks) || u.blocks.length < 2)
    err(`units/${uf}`, `${u.id}: phase/title/blocks unvollständig`);
  if (!Array.isArray(u.change_log)) err(`units/${uf}`, `${u.id}: change_log[] fehlt (#9c)`);
  let hasProblem = false, hasQuelle = false, hasCheck = false;
  for (const b of u.blocks ?? []) {
    if (b.type === 'problem' || b.type === 'worked_example') hasProblem = true;
    if (b.type === 'quelle') { hasQuelle = true; if (b.changed_by_omnibus == null) err(`units/${uf}`, `${u.id}: quelle ohne changed_by_omnibus-Flag (#7)`); }
    if (b.type === 'check') { hasCheck = true; checkQuestion(`units/${uf}`, { level: u.level, competency: u.competency, legal_basis: u.legal_basis, legal_status: u.legal_status, status: 'source_linked', ...b.question }); }
  }
  if (!hasProblem) err(`units/${uf}`, `${u.id}: kein Problem-first-/Worked-Example-Block (§3)`);
  if (!hasQuelle) warn(`units/${uf}`, `${u.id}: keine Originaltext-Box (#7)`);
  if (!hasCheck) err(`units/${uf}`, `${u.id}: kein Check (Häppchen+Check, §3)`);
}

// ---------- facts-db ----------
const fd = load('facts-db.json');
if (fd) {
  for (const fact of fd.facts ?? []) {
    checkCommon('facts-db', fact);
    if (!fact.correct || !Array.isArray(fact.distractor_pool) || fact.distractor_pool.length < 3)
      err('facts-db', `${fact.id}: correct/distractor_pool (≥3) unvollständig`);
    if (fact.invertible && !fact.negation) err('facts-db', `${fact.id}: invertible ohne negation`);
  }
  counts.facts = (fd.facts ?? []).length;
  if (!fd.relevanz_matrix?.artikel?.length) err('facts-db', 'relevanz_matrix.artikel fehlt (#3 berechnet, nie hardcoded UI)');
  else counts.relevanz_artikel = fd.relevanz_matrix.artikel.length;
}

// ---------- glossary / flashcards / scenarios / archetypes / blueprints / goldset ----------
const gl = load('glossary.json');
if (gl) { for (const g of gl) { if (!g.term || !g.simple) err('glossary', `Eintrag unvollständig: ${g.term}`); } counts.glossary = gl.length; }
const fc = load('flashcards.json');
if (fc) { for (const c of fc.cards ?? []) checkCommon('flashcards', c); counts.flashcards = (fc.cards ?? []).length; }
const sc = load('scenarios.json');
if (sc) {
  for (const s of sc.scenarios ?? []) {
    checkCommon('scenarios', s, { needLevel: false });
    if (!Array.isArray(s.rubric) || !s.rubric.length) err('scenarios', `${s.id}: Rubrik fehlt`);
    if (!s.facts?.every(x => Number.isInteger(x.released_at_phase))) err('scenarios', `${s.id}: facts ohne released_at_phase (deterministische Freigabe, §5.2)`);
    if (!s.persona_archetype) err('scenarios', `${s.id}: persona_archetype fehlt (3-Schichten)`);
    if (!s.goals?.every(g => g.matcher)) err('scenarios', `${s.id}: goals ohne matcher`);
  }
  counts.scenarios = (sc.scenarios ?? []).length;
}
const ar = load('archetypes.json');
if (ar) counts.archetypes = (ar.archetypes ?? []).length;
const bp = load('blueprints.json');
if (bp) { for (const b of bp.blueprints ?? []) { if (b.summative) err('blueprints', `${b.id}: Blueprints sind NUR formativ (#14)`); } counts.blueprints = (bp.blueprints ?? []).length; }
const gs = load('goldset.json');
if (gs) {
  const entries = gs.entries ?? [];
  const holdout = entries.filter(e => e.holdout).length;
  if (entries.length && holdout === 0) err('goldset', 'kein Holdout-Anteil (#27a)');
  for (const e of entries) if (e.target_score == null || !e.answer_text) err('goldset', `${e.id}: target_score/answer_text fehlt`);
  counts.goldset = entries.length; counts.holdout = holdout;
}

// ---------- Profile-Regeln (§5.1) ----------
if (existsSync(C('profiles'))) err('content/', 'profiles/ darf NICHT im Content liegen (Repo enthält keine Profile)');
if (!existsSync(join(ROOT, 'tests/fixtures/profile-beispielbank.json'))) warn('tests', 'Fixture-Profil fehlt noch');

// ---------- Report ----------
console.log('Schema-Validierung content/ —', JSON.stringify(counts));
for (const w of warns) console.log('  ⚠', w);
if (errors.length) { for (const e of errors) console.error('  ✗', e); console.error(`${errors.length} FEHLER`); process.exit(1); }
console.log('OK — 0 Fehler');
