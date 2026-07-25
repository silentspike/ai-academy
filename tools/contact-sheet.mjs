#!/usr/bin/env node
// tools/contact-sheet.mjs — turns the screenshots into reviewable contact sheets
// and flags the ones worth a closer look.
//
// Two tracks, on purpose:
//   PNG   the originals, lossless, for pixel comparison
//   JPEG  smaller copies arranged twelve to a sheet, for a person to look at
//
// The heuristics do not judge design. They find the failures that are obvious in
// hindsight and easy to miss in a list of 40 file names: a view that rendered
// nothing, one that is almost entirely one colour, one that came out far darker
// or lighter than its neighbours. Each is a symptom this project has produced at
// least once.
//
// Usage: node tools/contact-sheet.mjs [quellverzeichnis] [--out verzeichnis]

import { readdirSync, existsSync, mkdirSync, writeFileSync, statSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const QUELLE = resolve(args.find(a => !a.startsWith('--')) ?? 'test-results/ansichten');
const outIdx = args.indexOf('--out');
const ZIEL = resolve(outIdx >= 0 ? args[outIdx + 1] : 'test-results/kontaktbogen');
const PRO_BOGEN = 12;

if (!existsSync(QUELLE)) {
  console.error(`Keine Aufnahmen unter ${QUELLE} — lief das Projekt "visual"?`);
  process.exit(1);
}
const bilder = readdirSync(QUELLE).filter(f => f.endsWith('.png')).sort();
if (!bilder.length) {
  console.error(`Keine PNG-Dateien in ${QUELLE}.`);
  process.exit(1);
}
mkdirSync(ZIEL, { recursive: true });

/** Brightness, spread and colour count — enough to spot an empty or broken view. */
function messe(pfad) {
  const roh = execFileSync('identify', [
    '-format', '%[fx:mean] %[fx:standard_deviation] %[fx:maxima] %[fx:minima] %w %h',
    pfad + '[0]',
  ], { encoding: 'utf-8' }).trim().split(/\s+/).map(Number);
  const farben = Number(execFileSync('identify', ['-format', '%k', pfad + '[0]'], { encoding: 'utf-8' }).trim());
  const [mittel, streuung, max, min, breite, hoehe] = roh;
  return { mittel, streuung, max, min, breite, hoehe, farben, bytes: statSync(pfad).size };
}

const befunde = [];
const messwerte = [];
for (const b of bilder) {
  const pfad = join(QUELLE, b);
  let m;
  try { m = messe(pfad); }
  catch (e) { befunde.push({ bild: b, art: 'unlesbar', hinweis: e.message.slice(0, 80) }); continue; }
  messwerte.push({ bild: b, ...m });

  // A view that rendered nothing: almost no variation across the whole frame.
  if (m.streuung < 0.02) befunde.push({ bild: b, art: 'praktisch leer', hinweis: `Streuung ${m.streuung.toFixed(3)}` });
  // Very few distinct colours — a shell without content looks like this.
  else if (m.farben < 60) befunde.push({ bild: b, art: 'fast einfarbig', hinweis: `${m.farben} Farben` });
  // The product is a dark theme; a bright frame means something rendered wrong.
  if (m.mittel > 0.55) befunde.push({ bild: b, art: 'unerwartet hell', hinweis: `Mittel ${m.mittel.toFixed(2)}` });
  // Wrong window size makes every design judgement worthless.
  if (m.breite !== 1920 || m.hoehe !== 1026) {
    befunde.push({ bild: b, art: 'falsche Fenstergröße', hinweis: `${m.breite}×${m.hoehe} statt 1920×1026` });
  }
}

// Outliers against the group: a single frame far darker than the rest is worth a
// look even when its absolute value is unremarkable.
if (messwerte.length > 3) {
  const mittelwerte = messwerte.map(m => m.mittel).sort((a, b) => a - b);
  const median = mittelwerte[Math.floor(mittelwerte.length / 2)];
  for (const m of messwerte) {
    if (Math.abs(m.mittel - median) > 0.18) {
      befunde.push({ bild: m.bild, art: 'Helligkeits-Ausreißer', hinweis: `${m.mittel.toFixed(2)} vs. Median ${median.toFixed(2)}` });
    }
  }
}

// Sheets of twelve, with the file name under each frame.
const bogen = [];
for (let i = 0; i < bilder.length; i += PRO_BOGEN) {
  const teil = bilder.slice(i, i + PRO_BOGEN);
  const nr = String(bogen.length + 1).padStart(2, '0');
  const ziel = join(ZIEL, `bogen-${nr}.jpg`);
  // -label and the styling settings apply to images that FOLLOW them. Placed
  // after the file list they had no effect, and the sheet came out unlabelled —
  // which makes a review unable to say which frame it is talking about.
  execFileSync('montage', [
    '-background', '#0a0e17', '-fill', '#9db0d0', '-pointsize', '13', '-label', '%f',
    ...teil.map(b => join(QUELLE, b)),
    '-tile', '4x3', '-geometry', '620x+6+18',
    '-quality', '82', ziel,
  ]);
  bogen.push({ datei: basename(ziel), bilder: teil });
}

const bericht = [
  '# Kontaktbögen', '',
  `- Aufnahmen: **${bilder.length}**`,
  `- Bögen: **${bogen.length}** (je ${PRO_BOGEN})`,
  `- Auffälligkeiten: **${befunde.length}**`, '',
];
if (befunde.length) {
  bericht.push('## Auffälligkeiten', '',
    'Heuristisch — jede Zeile ist ein Hinweis zum Nachsehen, kein Urteil.', '',
    '| Aufnahme | Art | Messwert |', '|---|---|---|',
    ...befunde.map(f => `| ${f.bild} | ${f.art} | ${f.hinweis} |`), '');
}
bericht.push('## Bögen', '', ...bogen.map(b => `- \`${b.datei}\` — ${b.bilder.length} Aufnahmen`), '');
writeFileSync(join(ZIEL, 'BEFUND.md'), bericht.join('\n'));

console.log(`Kontaktbögen: ${bogen.length} aus ${bilder.length} Aufnahmen → ${ZIEL}`);
if (befunde.length) {
  console.log(`Auffälligkeiten: ${befunde.length}`);
  for (const f of befunde) console.log(`  ${f.bild}: ${f.art} (${f.hinweis})`);
} else {
  console.log('Keine Auffälligkeiten.');
}

// Exit code 0 either way: these are pointers for a person, not a verdict. The
// window-size check is the exception — screenshots at the wrong size make every
// judgement based on them worthless.
const falscheGroesse = befunde.filter(f => f.art === 'falsche Fenstergröße');
if (falscheGroesse.length) {
  console.error(`\n${falscheGroesse.length} Aufnahmen bei falscher Fenstergröße — Bewertung darauf ist wertlos.`);
  process.exit(1);
}
