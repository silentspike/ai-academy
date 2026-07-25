#!/usr/bin/env node
// tools/coverage-report.mjs — evaluates the click coverage.
//
// The same evaluation the 99-coverage spec performs locally, but as a standalone
// tool: with sharding the recording is spread over several machines, and no
// single test run sees all of it. CI collects the per-shard files and runs this.
//
// Usage: node tools/coverage-report.mjs [verzeichnis] [--markdown datei]
// Exit 1 if a control was unreachable, or was neither operated nor checked.

import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const args = process.argv.slice(2);
const VERZEICHNIS = resolve(args.find(a => !a.startsWith('--')) ?? '.tmp-coverage');
const mdIndex = args.indexOf('--markdown');
const MD_DATEI = mdIndex >= 0 ? args[mdIndex + 1] : null;

/** Routes that exist only to prove the reachability probe works. */
const NICHT_WERTEN = new Set(['#/negativtest']);

if (!existsSync(VERZEICHNIS)) {
  console.error(`Keine Abdeckungsdaten unter ${VERZEICHNIS} — liefen die aufzeichnenden Specs?`);
  process.exit(1);
}

const dateien = readdirSync(VERZEICHNIS)
  .filter(n => n.startsWith('clicks-') && n.endsWith('.json'));
if (!dateien.length) {
  console.error(`Keine clicks-*.json in ${VERZEICHNIS} — liefen die aufzeichnenden Specs?`);
  process.exit(1);
}

const daten = {};
for (const f of dateien) {
  let teil;
  try { teil = JSON.parse(readFileSync(join(VERZEICHNIS, f), 'utf8')); }
  catch (e) { console.error(`  ${f} unlesbar: ${e.message}`); continue; }
  for (const [route, r] of Object.entries(teil)) {
    const z = daten[route] ??= { gefunden: [], betaetigt: [], geprueft: [], unerreichbar: [] };
    for (const k of ['gefunden', 'betaetigt', 'geprueft', 'unerreichbar']) {
      z[k] = [...new Set([...z[k], ...(r[k] ?? [])])];
    }
  }
}

const wo = new Map();
const betaetigt = new Set(), geprueft = new Set();
const unerreichbar = [];
for (const [route, r] of Object.entries(daten)) {
  if (NICHT_WERTEN.has(route)) continue;
  for (const g of r.gefunden) if (!wo.has(g)) wo.set(g, route);
  for (const b of r.betaetigt) betaetigt.add(b);
  for (const g of r.geprueft) geprueft.add(g);
  for (const u of r.unerreichbar) unerreichbar.push(`${route}  ${u}`);
}

const offen = [...wo.entries()].filter(([g]) => !betaetigt.has(g) && !geprueft.has(g)).map(([g, r]) => `${r}  ${g}`);
const nurGeprueft = [...wo.entries()].filter(([g]) => !betaetigt.has(g) && geprueft.has(g)).map(([g, r]) => `${r}  ${g}`);
const routen = Object.keys(daten).filter(r => !NICHT_WERTEN.has(r)).length;
const anzahlBetaetigt = [...betaetigt].filter(b => wo.has(b)).length;
const quote = wo.size ? (anzahlBetaetigt + nurGeprueft.length) / wo.size : 0;

console.log(`Klick-Abdeckung aus ${dateien.length} Teildateien:`);
console.log(`  Routen: ${routen} · Bedienelemente: ${wo.size}`);
console.log(`  betätigt: ${anzahlBetaetigt} · nur auf Erreichbarkeit geprüft: ${nurGeprueft.length}`);
console.log(`  unerreichbar: ${unerreichbar.length} · weder noch: ${offen.length}`);
console.log(`  Abdeckung: ${Math.round(quote * 100)} %`);

if (MD_DATEI) {
  const zeilen = [
    '# Klick-Abdeckung', '',
    `- Routen: **${routen}**`,
    `- Bedienelemente: **${wo.size}**`,
    `- betätigt: **${anzahlBetaetigt}**`,
    `- nur auf Erreichbarkeit geprüft: **${nurGeprueft.length}**`,
    `- unerreichbar: **${unerreichbar.length}**`,
    `- Abdeckung: **${Math.round(quote * 100)} %**`, '',
  ];
  if (unerreichbar.length) zeilen.push('## Unerreichbar', '', ...unerreichbar.map(u => `- ${u}`), '');
  if (offen.length) zeilen.push('## Weder betätigt noch geprüft', '', ...offen.map(o => `- ${o}`), '');
  writeFileSync(MD_DATEI, zeilen.join('\n'));
}

if (unerreichbar.length) {
  console.error('\nUnerreichbare Bedienelemente — etwas liegt darüber:');
  for (const u of unerreichbar) console.error('  ' + u);
}
if (offen.length) {
  console.error('\nWeder betätigt noch geprüft:');
  for (const o of offen) console.error('  ' + o);
}
process.exit(unerreichbar.length || offen.length ? 1 : 0);
