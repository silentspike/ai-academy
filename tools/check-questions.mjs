#!/usr/bin/env node
// tools/check-questions.mjs — Eigenprüfung Durchgang 1 (deterministischer Abgleich, #15b-i):
// prüft alle zähl-/datumsbaren Angaben in questions-core.json gegen content/fristen.json
// und die Fundstellen-Formate gegen die Relevanz-Matrix. KEIN Ersatz für Durchgang 2 (Zweitdurchsicht).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const ROOT = new URL('..', import.meta.url).pathname;

const qs = JSON.parse(readFileSync(join(ROOT, 'content/questions-core.json'), 'utf8')).questions;
const matrix = JSON.parse(readFileSync(join(ROOT, 'content/fristen.json'), 'utf8'));
const artikel = JSON.parse(readFileSync(join(ROOT, 'content/facts-db.json'), 'utf8')).relevanz_matrix.artikel;
const knownRefs = new Set(artikel.map(a => a.ref.toLowerCase().replace('art. ', '').replace('anhang ', 'anh')));

// SOLL-Fristen aus der Gate-0-Matrix (SSOT)
const FRIST = {};
for (const g of matrix.geltungsstufen) FRIST[g.id] = g.applies_from;
const SOLL = {
  'stamm-verbote': '2025-02-02', 'neue-verbote': '2026-12-02', 'allgemein': '2026-08-02',
  'anhang3': '2027-12-02', 'anhang1': '2028-08-02', 'behoerden-alt': '2030-08-02'
};
// Abgleich SOLL gegen Matrix selbst (Selbstkonsistenz)
const mErr = [];
if (FRIST.g1 !== SOLL['stamm-verbote']) mErr.push('g1 ≠ 2025-02-02');
if (FRIST.g2 !== SOLL['neue-verbote']) mErr.push('g2 ≠ 2026-12-02');
if (FRIST.g3 !== SOLL['allgemein']) mErr.push('g3 ≠ 2026-08-02');
if (FRIST.g4 !== SOLL['anhang3']) mErr.push('g4 ≠ 2027-12-02');
if (FRIST.g5 !== SOLL['anhang1']) mErr.push('g5 ≠ 2028-08-02');

// Datums-Erwähnungen in Fragetexten: jedes deutsche Datum muss eine bekannte Frist ODER Fall-Datum sein
const KNOWN_DATES = new Set([
  '2.2.2025', '02.02.2025', '2. februar 2025', '2.8.2025', '2. august 2025',
  '2.12.2026', '2. dezember 2026', '27.7.2026', '27. juli 2026',
  '2.8.2026', '2. august 2026', '2.12.2027', '2. dezember 2027',
  '2.8.2027', '2. august 2027',            // nur als DISTRAKTOR/Alt-Frist zulässig
  '2.8.2028', '2. august 2028', '2.8.2030', '2. august 2030',
  '2.2.2026', '2. februar 2026', '24.7.2026', '24. juli 2026', '8.7.2026', '8. juli 2026', '2.12.2028', '2. dezember 2028', '2. februar 2027'
]);
const CASE_DATES = /1\.10\.2026|15\.3\.2028|1\.9\.2026|15\.8\.2026|3\.9\.2026|15\.11\.2026|15\.12\.2026|15\. oktober 2026|januar 2027|jänner 2027|märz 2027|q2\/2027|seit 2024|2\.2\.2025|24\. juli 2026|27\. juli 2026/i; // Fall-Daten

let pass = 0, fail = 0;
const report = [];
for (const q of qs) {
  const findings = [];
  const text = JSON.stringify(q).toLowerCase();
  // 1. Alle Datums-Nennungen bekannt?
  for (const m of text.matchAll(/\d{1,2}\.\s?(?:\d{1,2}\.|januar|februar|märz|april|mai|juni|juli|august|september|oktober|november|dezember)\s?\d{4}/g)) {
    const d = m[0].replace(/\s+/g, ' ').trim();
    if (!KNOWN_DATES.has(d) && !CASE_DATES.test(d)) findings.push(`unbekanntes Datum "${d}"`);
  }
  // 2. Kern-Behauptungs-Checks (hart codierte SOLL-Aussagen)
  const correctTexts = (q.options ?? []).filter(o => o.correct).map(o => o.text.toLowerCase()).join(' ');
  if (q.id === 'p2-q01' && !correctTexts.includes('2. februar 2025')) findings.push('q01: richtige Option muss 2.2.2025 sein');
  if (q.id === 'p2-q03' && !correctTexts.includes('2. dezember 2026')) findings.push('q03: richtige Option muss 2.12.2026 sein');
  if (q.id === 'p1-q03' && !correctTexts.includes('27. juli 2026')) findings.push('p1-q03: Inkrafttreten muss 27.7.2026 sein');
  if (q.id === 'p3-q06' && !correctTexts.includes('2.12.2027')) findings.push('p3-q06: Anwendungsbeginn 2.12.2027 muss in richtiger Option stehen');
  // 3. source_refs formal plausibel (beginnen mit Art./Anhang/VO oder Systematik-Marker)
  for (const o of (q.options ?? []).concat(q.pairs ?? [])) {
    if (!/^(art\.|anhang|vo |erwg|aeuv|methodik|systematik|quellenhierarchie|k1[0-9]-methodik|zitierpraxis)/i.test(o.source_ref)) findings.push(`source_ref-Format: "${o.source_ref}"`);
    const base = o.source_ref.toLowerCase().match(/^art\. (\d+[a-z]?)/);
    if (base && !knownRefs.has(base[1])) findings.push(`source_ref zeigt auf unbekannten Artikel: ${o.source_ref}`);
  }
  // 4. mc/case: genau 1 richtig (Redundanz zum Schema-Validator, hier als Prüfprotokoll)
  if ((q.type === 'mc' || q.type === 'case') && (q.options ?? []).filter(o => o.correct).length !== 1)
    findings.push('nicht genau 1 richtige Option');
  if (q.type === 'assign' && (q.pairs ?? []).length < 3) findings.push('assign mit < 3 Paaren');
  if (findings.length) { fail++; report.push({ id: q.id, findings }); }
  else pass++;
}

console.log(`Durchgang 1 (Skript-Abgleich): ${pass}/${qs.length} Fragen ohne Befund`);
if (mErr.length) { console.error('MATRIX-INKONSISTENZ:', mErr); process.exit(1); }
for (const r of report) console.error(`  ✗ ${r.id}: ${r.findings.join(' | ')}`);
process.exit(fail ? 1 : 0);
