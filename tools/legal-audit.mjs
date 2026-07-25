#!/usr/bin/env node
// tools/legal-audit.mjs — Quellenregister-Abfragen (Plan #9e):
//   node tools/legal-audit.mjs                → alle Objekte je Rechtsquelle/Status
//   node tools/legal-audit.mjs "Art. 5"       → welche Objekte hängen an Art. 5?
//   node tools/legal-audit.mjs --status at-vollzug-offen
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const C = p => join(ROOT, 'content', p);
const arg = process.argv[2];
const statusFilter = arg === '--status' ? process.argv[3] : null;
const refFilter = arg && arg !== '--status' ? arg : null;

// Alle Content-Objekte mit legal_basis einsammeln (Datei, Typ, id, claims)
const objects = [];
function collect(file, type, list) {
  for (const o of list ?? []) {
    if (Array.isArray(o.legal_basis)) objects.push({ file, type, id: o.id, status: o.legal_status, claims: o.legal_basis });
  }
}
const J = f => existsSync(C(f)) ? JSON.parse(readFileSync(C(f), 'utf8')) : null;

collect('questions-core.json', 'frage', J('questions-core.json')?.questions);
collect('facts-db.json', 'fakt', J('facts-db.json')?.facts);
collect('flashcards.json', 'karte', J('flashcards.json')?.cards);
collect('scenarios.json', 'szenario', J('scenarios.json')?.scenarios);
for (const uf of (existsSync(C('units')) ? readdirSync(C('units')) : []).filter(x => x.endsWith('.json'))) {
  const u = JSON.parse(readFileSync(join(C('units'), uf), 'utf8'));
  collect(`units/${uf}`, 'einheit', [u]);
  // eingebettete Checks zählen als eigene Objekte (erben Unit-Claims, haben aber eigene source_refs)
  for (const b of u.blocks ?? []) if (b.type === 'check' && b.question) {
    objects.push({ file: `units/${uf}`, type: 'check', id: b.question.id, status: u.legal_status,
      claims: (b.question.options ?? []).map(o => ({ ref: o.source_ref, instrument: 'via option' })) });
  }
}

// Normalisierung: "Art. 5 Abs. 1 lit. f" matcht Abfrage "Art. 5"
const norm = s => String(s ?? '').toLowerCase().replace(/\s+/g, ' ');
const matches = (claimRef, query) => {
  const c = norm(claimRef), q = norm(query);
  if (c === q) return true;
  // Präfix mit Wortgrenze: "art. 5" matcht "art. 5 abs. 1", NICHT "art. 50"
  return c.startsWith(q) && !/[0-9a-z]/.test(c.charAt(q.length));
};

let out = objects;
if (refFilter) out = objects.filter(o => o.claims.some(cl => matches(cl.ref, refFilter)));
if (statusFilter) out = objects.filter(o => o.status === statusFilter);

if (refFilter) console.log(`Objekte mit Rechtsgrundlage "${refFilter}": ${out.length}`);
else if (statusFilter) console.log(`Objekte mit legal_status=${statusFilter}: ${out.length}`);
else console.log(`Alle Content-Objekte mit Quellenregister: ${objects.length}`);
for (const o of out) {
  const refs = [...new Set(o.claims.map(c => c.ref))].join(' · ');
  console.log(`  [${o.type}] ${o.id}  (${o.file})  → ${refs}`);
}
if (!refFilter && !statusFilter) {
  const byStatus = {};
  for (const o of objects) byStatus[o.status] = (byStatus[o.status] ?? 0) + 1;
  console.log('Status-Verteilung:', JSON.stringify(byStatus));
}
