#!/usr/bin/env node
// tools/build-icons.mjs — erzeugt das eigene Duotone-Glow-Icon-Set (DESIGN-SYSTEM §6).
// SSOT ist die ICONS-Definition hier; das Skript erzwingt die Konstruktionsregeln
// (24er-ViewBox, stroke 1.6, round caps, .ico-line/.ico-fill-Klassen, currentColor).
// Aufruf: node tools/build-icons.mjs  → schreibt assets/icons/*.svg

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'icons');
mkdirSync(OUT, { recursive: true });

// Jedes Icon: { line: [SVG-Pfad/Elemente…], fill: [Duotone-Flächen…] } auf 24×24-Grid.
// p('M…') = path, c(cx,cy,r) = circle, r(x,y,w,h,rx) = rect, l(x1,y1,x2,y2) = line
const p = d => ({ t: 'path', d });
const c = (cx, cy, r_) => ({ t: 'circle', cx, cy, r: r_ });
const r = (x, y, w, h, rx = 2) => ({ t: 'rect', x, y, w, h, rx });
const l = (x1, y1, x2, y2) => ({ t: 'line', x1, y1, x2, y2 });

const ICONS = {
  // ---- Navigation (nav-) ----
  'nav-dashboard':   { line: [r(3,3,7,7), r(14,3,7,7), r(3,14,7,7), r(14,14,7,7)], fill: [r(14,3,7,7)] },
  'nav-lernen':      { line: [p('M4 19V6a2 2 0 0 1 2-2h13v15H6a2 2 0 0 0-2 2Z'), l(4,19,4,21), p('M19 19v2')], fill: [p('M4 19V6a2 2 0 0 1 2-2h13v3H7a3 3 0 0 0-3 3Z')] },
  'nav-karten':      { line: [r(4,6,13,13), p('M8 6V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-1')], fill: [r(4,6,13,13)] },
  'nav-pruefung':    { line: [r(5,3,14,18), l(9,8,15,8), l(9,12,15,12), p('M9 16h3')], fill: [r(5,3,14,4)] },
  'nav-examen':      { line: [c(12,9,5), p('M8.5 13 7 21l5-2.5L17 21l-1.5-8')], fill: [c(12,9,5)] },
  'nav-dialog':      { line: [p('M4 5h12a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H9l-4 4v-4H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z'), p('M20 9h1v9l-3-3h-4')], fill: [p('M4 5h12a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H9l-4 4v-4H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z')] },
  'nav-dashboard-radar': { line: [c(12,12,8), c(12,12,4.5), p('M12 12 17 7')], fill: [p('M12 12 17 7A8 8 0 0 1 20 12Z')] },
  'nav-einstellungen': { line: [c(12,12,3), p('M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3 1a7 7 0 0 0-2-1.2L14.2 3h-4l-.4 2.5a7 7 0 0 0-2 1.2l-2.3-1-2 3.4 2 1.5a7 7 0 0 0 0 2.4l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 2 1.2l.4 2.5h4l.4-2.5a7 7 0 0 0 2-1.2l2.3 1 2-3.4-2-1.5c.06-.4.1-.8.1-1.2Z')], fill: [c(12,12,3)] },
  'nav-erhaltung':   { line: [p('M4 12a8 8 0 0 1 14-5'), p('M18 3v4h-4'), p('M20 12a8 8 0 0 1-14 5'), p('M6 21v-4h4')], fill: [c(12,12,2.5)] },
  'nav-export':      { line: [p('M12 3v11'), p('M8 10l4 4 4-4'), p('M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2')], fill: [r(4,17,16,4)] },

  // ---- Status (st-) ----
  'st-check':        { line: [p('M4 12.5 9.5 18 20 6.5')], fill: [] },
  'st-x':            { line: [l(6,6,18,18), l(18,6,6,18)], fill: [] },
  'st-warn':         { line: [p('M12 3 22 20H2Z'), l(12,10,12,14.5), p('M12 17.2v.1')], fill: [p('M12 3 22 20H2Z')] },
  'st-info':         { line: [c(12,12,9), l(12,11,12,16), p('M12 7.8v.1')], fill: [c(12,12,9)] },
  'st-lock':         { line: [r(5,10,14,10), p('M8 10V7a4 4 0 0 1 8 0v3')], fill: [r(5,10,14,10)] },
  'st-unlock':       { line: [r(5,10,14,10), p('M8 10V7a4 4 0 0 1 7.7-1.5')], fill: [r(5,10,14,10)] },
  'st-star':         { line: [p('M12 3l2.7 5.6 6.1.8-4.5 4.2 1.1 6-5.4-3-5.4 3 1.1-6L3.2 9.4l6.1-.8Z')], fill: [p('M12 3l2.7 5.6 6.1.8-4.5 4.2 1.1 6-5.4-3-5.4 3 1.1-6L3.2 9.4l6.1-.8Z')] },
  'st-flamme':       { line: [p('M12 21a6 6 0 0 1-6-6c0-4.6 4.2-6.8 6-12 1.8 5.2 6 7.4 6 12a6 6 0 0 1-6 6Z'), p('M12 21a3 3 0 0 1-3-3c0-2 1.8-3 3-5 1.2 2 3 3 3 5a3 3 0 0 1-3 3Z')], fill: [p('M12 21a3 3 0 0 1-3-3c0-2 1.8-3 3-5 1.2 2 3 3 3 5a3 3 0 0 1-3 3Z')] },
  'st-uhr':          { line: [c(12,12,9), p('M12 7v5l3.5 2')], fill: [c(12,12,9)] },
  'st-kalender':     { line: [r(3,5,18,16), l(3,10,21,10), l(8,3,8,7), l(16,3,16,7)], fill: [r(3,5,18,5)] },
  'st-ziel':         { line: [c(12,12,9), c(12,12,5.5), c(12,12,2)], fill: [c(12,12,2)] },
  'st-xp':           { line: [p('M13 3 5 14h6l-1 7 8-11h-6Z')], fill: [p('M13 3 5 14h6l-1 7 8-11h-6Z')] },
  'st-glocke':       { line: [p('M12 4a6 6 0 0 1 6 6v3.5l1.8 3a.8.8 0 0 1-.7 1.2H4.9a.8.8 0 0 1-.7-1.2l1.8-3V10a6 6 0 0 1 6-6Z'), p('M10 20a2.2 2.2 0 0 0 4 0')], fill: [p('M12 4a6 6 0 0 1 6 6v3.5l1.8 3a.8.8 0 0 1-.7 1.2H4.9a.8.8 0 0 1-.7-1.2l1.8-3V10a6 6 0 0 1 6-6Z')] },
  'st-retention':    { line: [p('M3 6c3 0 3 9 7 9 3 0 3-4 5-4 2.5 0 3 3 6 3'), p('M17 10l4 4'), p('M21 10v4h-4')], fill: [p('M3 6c3 0 3 9 7 9 3 0 3-4 5-4 2.5 0 3 3 6 3v3H3Z')] },

  // ---- Aktionen (act-) ----
  'act-play':        { line: [p('M8 5v14l11-7Z')], fill: [p('M8 5v14l11-7Z')] },
  'act-pause':       { line: [r(6,5,4,14,1.5), r(14,5,4,14,1.5)], fill: [r(6,5,4,14,1.5), r(14,5,4,14,1.5)] },
  'act-weiter':      { line: [p('M5 12h14'), p('M13 6l6 6-6 6')], fill: [] },
  'act-zurueck':     { line: [p('M19 12H5'), p('M11 6l-6 6 6 6')], fill: [] },
  'act-retry':       { line: [p('M20 12a8 8 0 1 1-2.3-5.7'), p('M20 3v5h-5')], fill: [] },
  'act-edit':        { line: [p('M4 20l1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19l-4 1Z'), l(14.5,6.5,17.5,9.5)], fill: [p('M4 20l1-4 3 3Z')] },
  'act-notiz':       { line: [r(4,3,16,18), l(8,8,16,8), l(8,12,16,12), l(8,16,12,16)], fill: [r(4,3,16,4)] },
  'act-suche':       { line: [c(10.5,10.5,6.5), l(15.5,15.5,21,21)], fill: [c(10.5,10.5,6.5)] },
  'act-plus':        { line: [l(12,5,12,19), l(5,12,19,12)], fill: [] },
  'act-schliessen':  { line: [l(7,7,17,17), l(17,7,7,17)], fill: [] },
  'act-einspruch':   { line: [p('M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6Z'), p('M9.5 12l2 2 3.5-4')], fill: [p('M12 3 4 6v6c0 5 3.5 8 8 9Z')] },
  'act-import':      { line: [p('M12 14V3'), p('M8 7l4-4 4 4'), p('M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2')], fill: [r(4,17,16,4)] },

  // ---- Fachliche Symbole (fach-) ----
  'fach-pyramide':   { line: [p('M12 3 21 20H3Z'), l(7.2,12,16.8,12), l(5.2,16,18.8,16)], fill: [p('M12 3l3.3 6.2H8.7Z')] },
  'fach-verbot':     { line: [c(12,12,9), l(5.6,5.6,18.4,18.4)], fill: [c(12,12,9)] },
  'fach-paragraph':  { line: [p('M15.5 5.2A4.2 4.2 0 0 0 9 6a3.2 3.2 0 0 0 1.6 3.4l3.6 1.9A3.1 3.1 0 0 1 15.5 14a3.3 3.3 0 0 1-3.4 3'), p('M8.5 18.8A4.2 4.2 0 0 0 15 18a3.2 3.2 0 0 0-1.6-3.4L9.8 12.7A3.1 3.1 0 0 1 8.5 10a3.3 3.3 0 0 1 3.4-3')], fill: [c(12,12,1.4)] },
  'fach-waage':      { line: [l(12,4,12,20), l(5,7,19,7), p('M5 7 3 13a3 3 0 0 0 6 0Z'), p('M19 7l-2 6a3 3 0 0 0 6 0Z'), l(9,20,15,20)], fill: [p('M5 7 3 13a3 3 0 0 0 6 0Z'), p('M19 7l-2 6a3 3 0 0 0 6 0Z')] },
  'fach-schild':     { line: [p('M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6Z')], fill: [p('M12 3 4 6v6c0 5 3.5 8 8 9Z')] },
  'fach-doku':       { line: [p('M6 3h9l4 4v14H6Z'), p('M15 3v4h4'), l(9,12,15,12), l(9,16,15,16)], fill: [p('M15 3v4h4Z')] },
  'fach-siegel':     { line: [c(12,10,6), p('M8.5 15 7 21l5-2 5 2-1.5-6'), p('M10 10l1.5 1.5L14.5 8.5')], fill: [c(12,10,6)] },
  'fach-ki':         { line: [r(5,5,14,14,3), c(12,12,3.2), l(12,2,12,5), l(12,19,12,22), l(2,12,5,12), l(19,12,22,12), l(5,5,3,3), l(19,5,21,3), l(5,19,3,21), l(19,19,21,21)], fill: [c(12,12,3.2)] },
  'fach-behoerde':   { line: [p('M3 9 12 4l9 5'), l(3,9,21,9), l(5,9,5,17), l(9.7,9,9.7,17), l(14.3,9,14.3,17), l(19,9,19,17), l(3,17,21,17), l(2,20,22,20)], fill: [p('M3 9 12 4l9 5Z')] },
  'fach-timeline':   { line: [l(3,12,21,12), c(6,12,1.6), c(12,12,1.6), c(18,12,1.6), l(6,12,6,7), l(12,12,12,17), l(18,12,18,7)], fill: [c(12,12,1.6)] },
  'fach-rollen':     { line: [c(8,9,3.5), p('M2.5 20a5.5 5.5 0 0 1 11 0'), c(16.5,9.5,2.8), p('M14.5 19.5a4.5 4.5 0 0 1 7 -3')], fill: [c(8,9,3.5)] },
  'fach-fria':       { line: [r(5,4,14,17), p('M9 4h6v3H9Z'), p('M12 17s-3.2-2-3.2-4.2A1.8 1.8 0 0 1 12 11.5a1.8 1.8 0 0 1 3.2 1.3C15.2 15 12 17 12 17Z')], fill: [p('M9 4h6v3H9Z'), p('M12 17s-3.2-2-3.2-4.2A1.8 1.8 0 0 1 12 11.5a1.8 1.8 0 0 1 3.2 1.3C15.2 15 12 17 12 17Z')] },
  'fach-trophy':     { line: [p('M7 4h10v5a5 5 0 0 1-10 0Z'), p('M7 5H4a3 3 0 0 0 3 4.5'), p('M17 5h3a3 3 0 0 1-3 4.5'), l(12,14,12,17), p('M8 21h8'), p('M9 21v-2a3 3 0 0 1 6 0v2')], fill: [p('M7 4h10v5a5 5 0 0 1-10 0Z')] },
  'fach-badge':      { line: [c(12,12,8), p('M12 7.5l1.4 2.8 3.1.5-2.2 2.2.5 3.1-2.8-1.5-2.8 1.5.5-3.1-2.2-2.2 3.1-.5Z')], fill: [c(12,12,8)] },
  'fach-heatmap':    { line: [r(3,3,18,18), l(3,9,21,9), l(3,15,21,15), l(9,3,9,21), l(15,3,15,21)], fill: [r(9,3,6,6), r(3,15,6,6), r(15,9,6,6)] },
};

// Präsentationsattribute statt <style>-Klassen: funktioniert identisch inline,
// im Sprite (<use>) und in <img> — currentColor wird bei Inline/<use> vom Kontext
// geerbt (DESIGN-SYSTEM §6: Farbe IMMER vom Kontext).
function el(e, mode) {
  const a = v => String(Math.round(v * 100) / 100);
  const common = mode === 'line'
    ? 'stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" fill="none"'
    : 'fill="currentColor" opacity=".18" stroke="none"';
  if (e.t === 'path') return `<path ${common} d="${e.d}"/>`;
  if (e.t === 'circle') return `<circle ${common} cx="${a(e.cx)}" cy="${a(e.cy)}" r="${a(e.r)}"/>`;
  if (e.t === 'rect') return `<rect ${common} x="${a(e.x)}" y="${a(e.y)}" width="${a(e.w)}" height="${a(e.h)}" rx="${a(e.rx)}"/>`;
  if (e.t === 'line') return `<line ${common} x1="${a(e.x1)}" y1="${a(e.y1)}" x2="${a(e.x2)}" y2="${a(e.y2)}"/>`;
  throw new Error('unknown element ' + e.t);
}

let count = 0;
const symbols = [];
for (const [name, def] of Object.entries(ICONS)) {
  const body = (def.fill || []).map(e => el(e, 'fill')).join('') + (def.line || []).map(e => el(e, 'line')).join('');
  writeFileSync(join(OUT, `icon-${name}.svg`),
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`);
  symbols.push(`<symbol id="icon-${name}" viewBox="0 0 24 24">${body}</symbol>`);
  count++;
}
// Sprite für Inline-Nutzung: <svg class="ico"><use href="/assets/icons/sprite.svg#icon-…"/></svg>
writeFileSync(join(OUT, 'sprite.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" style="display:none">${symbols.join('')}</svg>`);
console.log(`${count} Icons + sprite.svg geschrieben (Duotone-Glow, 24×24, stroke 1.6, currentColor)`);
