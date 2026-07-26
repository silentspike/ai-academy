#!/usr/bin/env node
// tools/betrieb-sync.mjs — brings the running instance up to the repository.
//
// Why this exists: the product lives in two places. This repository is the
// source of truth for code and content; the owner's instance additionally holds
// things that must never enter a public history — the learning record, the
// curated profile, and the gate deliverables under legal/ and docs/.
//
// Copying by hand drifted within days: 25 application files, 20 content files,
// the bridge and the CI diverged, and every layout and defect fix of the last
// days existed only in the repository. The instance was still serving the old
// build, which is the version that would have been learned from.
//
// Usage:
//   node tools/betrieb-sync.mjs --ziel /pfad/zur/instanz            (apply)
//   node tools/betrieb-sync.mjs --ziel /pfad/zur/instanz --pruefen  (report only, exit 1 on drift)

import { readdirSync, lstatSync, readlinkSync, symlinkSync, readFileSync, copyFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const args = process.argv.slice(2);
const zielIdx = args.indexOf('--ziel');
const ZIEL = zielIdx >= 0 && args[zielIdx + 1] ? resolve(args[zielIdx + 1]) : null;
const NUR_PRUEFEN = args.includes('--pruefen');
const AUFRAEUMEN = args.includes('--aufraeumen');
const LEISE = args.includes('--leise');

if (!ZIEL) {
  console.error('Aufruf: node tools/betrieb-sync.mjs --ziel <verzeichnis> [--pruefen]');
  process.exit(2);
}
if (!existsSync(ZIEL)) {
  console.error(`Zielverzeichnis ${ZIEL} existiert nicht.`);
  process.exit(2);
}

/** What the repository owns. Everything else in the instance is left alone. */
const UEBERTRAGEN = ['app', 'public', 'content', 'bridge', 'tutor', 'tools', 'assets',
  'start.sh', 'start.command', 'start.bat', 'package.json'];

/**
 * What the instance owns and this tool must never touch. Listed explicitly
 * rather than derived, so that adding a directory to the repository cannot
 * silently start overwriting private data.
 */
const UNANTASTBAR = ['data', 'legal', 'docs', '.git', 'node_modules', 'test-results', '.env'];

/**
 * Walks with lstat, so symlinks are recorded as links rather than followed.
 * public/app, public/assets and public/content are links to the directories one
 * level up — the web root is public/ while the sources live outside it. Following
 * them would list every file twice and, on copy, replace each link with a real
 * directory: the instance would then serve a frozen copy while the sources it is
 * supposed to expose sat elsewhere.
 */
function dateien(basis, unter = '') {
  const raus = [];
  const voll = join(basis, unter);
  if (!existsSync(voll) && !istLink(voll)) return raus;
  const st = lstatSync(voll);
  if (st.isSymbolicLink() || st.isFile()) return [unter];
  for (const eintrag of readdirSync(voll)) {
    const rel = unter ? join(unter, eintrag) : eintrag;
    if (UNANTASTBAR.some(u => rel === u || rel.startsWith(u + '/'))) continue;
    const p = join(basis, rel);
    const s = lstatSync(p);
    if (s.isDirectory()) raus.push(...dateien(basis, rel));
    else raus.push(rel);                          // includes symlinks
  }
  return raus;
}

function istLink(p) { try { return lstatSync(p).isSymbolicLink(); } catch { return false; } }

/** Compares by content, or by link target when the entry is a symlink. */
function gleich(a, b) {
  const la = istLink(a), lb = istLink(b);
  if (la !== lb) return false;
  if (la) return readlinkSync(a) === readlinkSync(b);
  return hash(a) === hash(b);
}

const hash = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');

const quelle = new Set();
for (const teil of UEBERTRAGEN) for (const f of dateien(ROOT, teil)) quelle.add(f);

const neu = [], geaendert = [], entfernt = [];
for (const f of quelle) {
  const zielDatei = join(ZIEL, f);
  if (!existsSync(zielDatei) && !istLink(zielDatei)) { neu.push(f); continue; }
  if (!gleich(join(ROOT, f), zielDatei)) geaendert.push(f);
}
/**
 * Paths the instance owns although they sit under a repository-owned directory —
 * listed in .betrieb-eigen next to them. The instance holds tooling the public
 * repository does not, and deleting it because it is "surplus" would be data
 * loss dressed up as tidying.
 */
const eigen = (() => {
  const datei = join(ZIEL, '.betrieb-eigen');
  if (!existsSync(datei)) return [];
  return readFileSync(datei, 'utf8').split('\n')
    .map(z => z.replace(/#.*$/, '').trim()).filter(Boolean);
})();
const istEigen = (f) => eigen.some(e => f === e || f.startsWith(e.replace(/\/$/, '') + '/'));

// Files the instance still has under a repository-owned path but the repository
// no longer does. Reported by default and only removed with --aufraeumen:
// deleting is the one operation here that cannot be undone by running it again.
for (const teil of UEBERTRAGEN) {
  for (const f of dateien(ZIEL, teil)) if (!quelle.has(f) && !istEigen(f)) entfernt.push(f);
}

const abweichung = neu.length + geaendert.length + entfernt.length;

if (!LEISE) {
  console.log(`Repository: ${ROOT}`);
  console.log(`Instanz:    ${ZIEL}`);
  console.log(`Dateien im Abgleich: ${quelle.size}`);
  console.log(`  neu: ${neu.length} · geändert: ${geaendert.length} · im Ziel überzählig: ${entfernt.length}`);
  for (const [titel, liste] of [['Neu', neu], ['Geändert', geaendert], ['Überzählig', entfernt]]) {
    if (!liste.length) continue;
    console.log(`\n${titel}:`);
    for (const f of liste.slice(0, 40)) console.log('  ' + f);
    if (liste.length > 40) console.log(`  … und ${liste.length - 40} weitere`);
  }
}

if (NUR_PRUEFEN) {
  if (abweichung) console.error(`\nAbweichung: ${neu.length + geaendert.length} zu übertragen, ${entfernt.length} überzählig. Angleichen mit: node tools/betrieb-sync.mjs --ziel ${ZIEL}`);
  else console.log('\nInstanz und Repository stimmen überein.');
  process.exit(abweichung ? 1 : 0);
}

for (const f of [...neu, ...geaendert]) {
  const von = join(ROOT, f), ziel = join(ZIEL, f);
  mkdirSync(dirname(ziel), { recursive: true });
  if (istLink(von)) {
    rmSync(ziel, { force: true });
    symlinkSync(readlinkSync(von), ziel);
  } else {
    copyFileSync(von, ziel);
  }
}
if (AUFRAEUMEN) {
  for (const f of entfernt) rmSync(join(ZIEL, f), { force: true });
} else if (entfernt.length) {
  console.log(`\n${entfernt.length} überzählige Datei(en) in der Instanz belassen.`);
  console.log('Entfernen mit --aufraeumen; was dort bleiben soll, gehört in .betrieb-eigen.');
}

// Sanity check: everything the instance owns must still be there. A sync that
// takes the learning record with it is worse than no sync at all.
const verloren = UNANTASTBAR.filter(u => existsSync(join(ROOT, u)) && !existsSync(join(ZIEL, u)) &&
  ['data', 'legal', 'docs'].includes(u));
if (verloren.length) {
  console.error(`\nFEHLER: ${verloren.join(', ')} fehlt nach dem Abgleich im Ziel.`);
  process.exit(1);
}

console.log(`\n${neu.length + geaendert.length} Datei(en) übertragen${AUFRAEUMEN ? `, ${entfernt.length} entfernt` : ''}.`);
console.log('Unangetastet: ' + UNANTASTBAR.filter(u => existsSync(join(ZIEL, u))).join(', '));
