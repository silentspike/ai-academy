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

// Parsed properly: taking "the first argument without a dash" swallowed the
// VALUE of --out and then looked for screenshots in the output directory.
const args = process.argv.slice(2);
const outIdx = args.indexOf('--out');
const ZIEL = resolve(outIdx >= 0 && args[outIdx + 1] ? args[outIdx + 1] : 'test-results/kontaktbogen');
const frei = args.filter((a, i) => !a.startsWith('--') && i !== outIdx + 1);
const QUELLE = resolve(frei[0] ?? 'test-results/ansichten');
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

// Layout faults measured in the browser (12-ansichten.visual writes one JSON per
// view). A picture cannot show that a container scrolls sideways or that a label
// is truncated — the DOM can, and those are the faults that matter.
function layoutBefunde(bild) {
  const jsonPfad = join(QUELLE, bild.replace(/\.png$/, '.json'));
  if (!existsSync(jsonPfad)) return [];
  let d;
  try { d = JSON.parse(readFileSync(jsonPfad, 'utf8')); } catch { return []; }
  const raus = [];
  if (d.seiteQuerScroll) raus.push({ art: 'Seite scrollt quer', hinweis: 'horizontaler Überlauf' });
  for (const q of d.querlaufende ?? []) raus.push({ art: 'läuft über', hinweis: q });
  for (const g of d.gekuerzteTexte ?? []) raus.push({ art: 'Text gekürzt', hinweis: g });
  for (const n of d.nullflaechen ?? []) raus.push({ art: 'Bedienelement ohne Fläche', hinweis: n });
  for (const k of d.konsolenfehler ?? []) raus.push({ art: 'Konsolenfehler', hinweis: k });
  if ((d.textLaenge ?? 0) < 40) raus.push({ art: 'kaum Text', hinweis: `${d.textLaenge} Zeichen` });
  return raus;
}

const befunde = [];
const messwerte = [];
for (const b of bilder) {
  const pfad = join(QUELLE, b);
  let m;
  try { m = messe(pfad); }
  catch (e) { befunde.push({ bild: b, art: 'unlesbar', hinweis: e.message.slice(0, 80) }); continue; }
  messwerte.push({ bild: b, ...m });
  for (const f of layoutBefunde(b)) befunde.push({ bild: b, ...f });

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

// Anything flagged goes on the first sheet: a reviewer looking at one image
// should see the questionable frames first, not hunt for them across four sheets.
const auffaellig = new Set(befunde.map(f => f.bild));
const sortiert = [...bilder].sort((a, b) => (auffaellig.has(b) ? 1 : 0) - (auffaellig.has(a) ? 1 : 0));

const bogen = [];
for (let i = 0; i < sortiert.length; i += PRO_BOGEN) {
  const teil = sortiert.slice(i, i + PRO_BOGEN);
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

// Manifest: which frame sits where, so a specific one can be pulled up without
// opening every sheet.
writeFileSync(join(ZIEL, 'manifest.json'), JSON.stringify({
  erzeugt: 'tools/contact-sheet.mjs',
  proBogen: PRO_BOGEN,
  spalten: 4,
  boegen: bogen.map(b => ({
    datei: b.datei,
    bilder: b.bilder.map((n, i) => ({
      name: n, zeile: Math.floor(i / 4) + 1, spalte: (i % 4) + 1,
      auffaellig: auffaellig.has(n),
    })),
  })),
  befunde,
}, null, 1));

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
