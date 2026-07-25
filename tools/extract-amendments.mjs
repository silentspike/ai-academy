#!/usr/bin/env node
// Extrahiert die nummerierten Änderungsbefehle aus dem Amtsblatt-XHTML der VO (EU) 2026/1744.
// Amtsblatt-Markup: Jeder Änderungsbefehl ist eine <tr> mit erster Zelle "<p>N.</p>" (4%-Spalte)
// und dem Befehl in der zweiten Zelle. Unterpunkte (a), (1) usw. haben keine reine Zahl-Zelle.
// Ausgabe: legal/aenderungsbefehle-roh.json — Basis für das kuratierte Änderungsregister.

import { readFileSync, writeFileSync } from 'node:fs';

const SRC = new URL('../legal/quelle-vo-2026-1744-de.html', import.meta.url);
const OUT = new URL('../legal/aenderungsbefehle-roh.json', import.meta.url);

const raw = readFileSync(SRC, 'utf-8');

function stripTags(s) {
  return s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

// Zielartikel der Änderungs-VO: Artikel 1 (2024/1689), Artikel 2 (2018/1139), Artikel 3 (2023/1230)
const artDivs = [
  { key: 'art_1', regulation: 'VO (EU) 2024/1689' },
  { key: 'art_2', regulation: 'VO (EU) 2018/1139' },
  { key: 'art_3', regulation: 'VO (EU) 2023/1230' },
];

// Grenzen der Artikel-Divisionen im Rohtext finden
function divStart(key) {
  const m = raw.indexOf(`id="${key}"`);
  if (m < 0) throw new Error(`Division ${key} nicht gefunden`);
  return m;
}
const bounds = {};
for (let i = 0; i < artDivs.length; i++) {
  const start = divStart(artDivs[i].key);
  const end = i + 1 < artDivs.length ? divStart(artDivs[i + 1].key) : raw.indexOf('id="art_4"') > 0 ? raw.indexOf('id="art_4"') : raw.length;
  bounds[artDivs[i].key] = [start, end];
}

// Top-Level-Befehlsanker: <td ...><p ...>N.</p></td> ODER <p ...>(N)</p> — das Amtsblatt
// mischt beide Nummernformate innerhalb derselben Befehlsliste (empirisch verifiziert:
// Befehl 3 als "3.", Befehl 4 als "(4)").
const anchorRe = /<td[^>]*>\s*<p[^>]*>\s*(?:\((\d{1,3})\)|(\d{1,3})\.)\s*<\/p>\s*<\/td>/g;

const result = [];
for (const { key, regulation } of artDivs) {
  const [start, end] = bounds[key];
  const seg = raw.slice(start, end);
  const anchors = [];
  let m;
  anchorRe.lastIndex = 0;
  while ((m = anchorRe.exec(seg)) !== null) {
    anchors.push({ nr: parseInt(m[1] ?? m[2], 10), pos: m.index, afterPos: anchorRe.lastIndex });
  }
  // Nur die streng aufsteigende Hauptsequenz ab 1 behalten (Sicherung gegen Zahl-Zellen in Zitaten)
  const seq = [];
  let expected = 1;
  for (const a of anchors) {
    if (a.nr === expected) { seq.push(a); expected++; }
  }
  for (let i = 0; i < seq.length; i++) {
    const from = seq[i].afterPos;
    const to = i + 1 < seq.length ? seq[i + 1].pos : seg.length;
    const text = stripTags(seg.slice(from, to));
    // Befehlssatz = erster Satz bis zum ersten ":" (die Anweisung), Rest = Wortlaut/Details
    const ci = text.indexOf(':');
    const instruction = ci > 0 ? text.slice(0, ci + 1).trim() : text.slice(0, 160).trim();
    result.push({
      regulation,
      nr: seq[i].nr,
      instruction,
      full_text: text,
      chars: text.length,
    });
  }
  console.error(`${regulation}: ${seq.length} Änderungsbefehle (Anker gesamt: ${anchors.length})`);
}

writeFileSync(OUT, JSON.stringify(result, null, 2), 'utf-8');
console.error(`Geschrieben: ${OUT.pathname} (${result.length} Befehle)`);
