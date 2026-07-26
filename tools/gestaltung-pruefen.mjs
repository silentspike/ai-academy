#!/usr/bin/env node
// tools/gestaltung-pruefen.mjs — findet Gestaltungsmängel, die ein Kontaktbogen verbirgt.
//
// Written after a review at 620 pixels per thumbnail reported "no findings" on a
// view whose form had collapsed: labels are inline elements, so
// `<label>Text<br><input></label>` lays them out side by side like words in a
// sentence. At thumbnail size that still looks like a form.
//
// The measurements below are the ones a picture cannot give and a person misses:
// which share of the frame carries anything at all, whether a label sits above
// its field, whether a control shows an identifier instead of a sentence.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const VERZ = resolve(process.argv[2] ?? 'test-results/ansichten');
if (!existsSync(VERZ)) { console.error(`Keine Messdaten unter ${VERZ}`); process.exit(1); }

const dateien = readdirSync(VERZ).filter(f => f.endsWith('.json')).sort();
if (!dateien.length) { console.error('Keine .json neben den Aufnahmen — lief das Projekt "visual"?'); process.exit(1); }

const befunde = [];
for (const f of dateien) {
  const name = f.replace(/\.json$/, '');
  let d; try { d = JSON.parse(readFileSync(join(VERZ, f), 'utf8')); } catch { continue; }
  const melde = (art, hinweis) => befunde.push({ ansicht: name, art, hinweis });

  // Content sitting in the top third with two thirds empty: technically fine,
  // visually an unfinished page.
  if (d.inhaltHoehe != null && d.fensterHoehe) {
    const anteil = d.inhaltHoehe / d.fensterHoehe;
    if (anteil < 0.45) melde('viel Leerraum', `Inhalt füllt ${Math.round(anteil * 100)} % der Höhe`);
  }
  for (const l of d.labelsInline ?? []) melde('Beschriftung neben dem Feld', l);
  for (const k of d.kennungenSichtbar ?? []) melde('Kennung statt Text', k);
  if ((d.symbole ?? 0) === 0 && (d.textLaenge ?? 0) > 200) melde('kein Symbol', 'Ansicht ganz ohne Bildzeichen');
  for (const q of d.querlaufende ?? []) melde('läuft über', q);
  for (const g of d.gekuerzteTexte ?? []) melde('Text gekürzt', g);
}

const nachArt = new Map();
for (const b of befunde) (nachArt.get(b.art) ?? nachArt.set(b.art, []).get(b.art)).push(b);

console.log(`Gestaltung: ${dateien.length} Ansichten, ${befunde.length} Befunde\n`);
for (const [art, liste] of [...nachArt.entries()].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`${art} — ${liste.length}×`);
  for (const b of liste.slice(0, 8)) console.log(`   ${b.ansicht}: ${b.hinweis}`);
  if (liste.length > 8) console.log(`   … und ${liste.length - 8} weitere`);
  console.log('');
}
process.exit(befunde.length ? 1 : 0);
