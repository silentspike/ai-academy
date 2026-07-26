#!/usr/bin/env node
// tools/fixture-bereinigen.mjs — removes seeded test data from a learning record.
//
// Verification runs write state that looks like progress: chapter tests marked
// passed so the exam gate opens, cards at the seven-day retention tier so the
// gate's second condition is met. They carry seeded:'e2e-fixture' and are meant
// to disappear before anyone learns from the installation — otherwise the first
// real session starts on a record that claims nine chapters and an open exam.
//
// Usage:
//   node tools/fixture-bereinigen.mjs <progress.json> [--anwenden]
// Reports by default; writes only with --anwenden, and only after a backup.

import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const DATEI = resolve(args.find(a => !a.startsWith('--')) ?? '');
const ANWENDEN = args.includes('--anwenden');
const MARKE = 'e2e-fixture';

if (!DATEI || !existsSync(DATEI)) {
  console.error('Aufruf: node tools/fixture-bereinigen.mjs <progress.json> [--anwenden]');
  process.exit(2);
}

const roh = JSON.parse(readFileSync(DATEI, 'utf8'));
const st = roh.state ?? roh;
const befund = [];

const geseedet = (o) => o && typeof o === 'object' && o.seeded === MARKE;

// Chapter tests: each one opens a phase in the exam gate.
const tests = st.chapterTests ?? {};
const testWeg = Object.keys(tests).filter(k => geseedet(tests[k])).sort();
for (const k of testWeg) befund.push(`Kapiteltest ${k} (pct ${tests[k].pct})`);

// Cards at a retention tier they never earned.
const karten = st.cards ?? [];
const kartenWeg = karten.filter(geseedet);
for (const c of kartenWeg) befund.push(`Karte ${c.id} (${c.retention}, ${c.competency})`);

/**
 * Exam attempts that were only possible because the gate stood open on seeded
 * tests. Removed rather than kept: an attempt made by a verification run is not
 * a result of the learner, and it would sit in the first/latest/best series as
 * though it were.
 */
const versuche = st.examAttempts ?? [];
const versucheWeg = testWeg.length ? versuche.slice() : versuche.filter(geseedet);
for (const v of versucheWeg) {
  befund.push(`Examensversuch vom ${v.day ?? '?'} (${Math.round((v.pct ?? 0) * 100)} %, ${v.passed ? 'bestanden' : 'nicht bestanden'}) — nur durch das geöffnete Gate möglich`);
}

console.log(`Lernstand: ${DATEI}`);
if (!befund.length) {
  console.log('Keine geseedeten Testdaten gefunden.');
  process.exit(0);
}
console.log(`\n${befund.length} Eintrag/Einträge aus Testläufen:`);
for (const b of befund) console.log('  - ' + b);

console.log('\nBleibt erhalten:');
console.log(`  - ${Object.keys(tests).length - testWeg.length} echte Kapiteltests: ${Object.keys(tests).filter(k => !geseedet(tests[k])).sort().join(', ') || 'keine'}`);
console.log(`  - ${karten.length - kartenWeg.length} Karten, ${(st.events ?? []).length} Ereignisse, ${(st.unit_done ?? []).length} abgeschlossene Einheiten`);
console.log(`  - XP ${st.xp ?? 0}, Level ${st.level ?? 1}, Badges ${(st.badges ?? []).join(', ') || 'keine'}`);

if (!ANWENDEN) {
  console.log('\nNichts geändert. Mit --anwenden ausführen.');
  process.exit(0);
}

const sicherung = DATEI.replace(/\.json$/, '') + `.vor-bereinigung-${new Date(readFileSync(DATEI).length).getTime()}.json`;
copyFileSync(DATEI, sicherung);

for (const k of testWeg) delete tests[k];
st.cards = karten.filter(c => !geseedet(c));
st.examAttempts = versuche.filter(v => !versucheWeg.includes(v));

// XP and level are activity points and stay: they were earned by working
// through units and questions, not by the seeded gate entries (#28 keeps the
// two quantities apart, and this is exactly the case it is meant for).
writeFileSync(DATEI, JSON.stringify(roh, null, 1));
console.log(`\nBereinigt. Sicherung: ${sicherung}`);
console.log('Danach: Bridge neu starten, damit kein zwischengespeicherter Stand zurückschreibt.');
