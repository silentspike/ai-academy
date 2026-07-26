#!/usr/bin/env node
// tools/suche-tests.mjs — ranking of the search, without a browser.
import { suche } from '../app/topbar-tools.js';

let pass = 0, fail = 0;
const t = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ ${name} ${detail}`); }
};

const eintrag = (art, titel, text) => ({ art, titel, unter: '', ziel: '#/x', suchtext: (titel + ' ' + text).toLowerCase() });
const idx = [
  eintrag('artikel', 'Art. 6', 'Einstufungsvorschriften für Hochrisiko-KI-Systeme'),
  eintrag('artikel', 'Art. 60', 'Tests unter Realbedingungen'),
  eintrag('artikel', 'Art. 5', 'Verbotene Praktiken'),
  eintrag('einheit', 'Hochrisiko: Anhang III von innen', 'p3-e01 Art. 6 Anhang III'),
  eintrag('begriff', 'Hochrisiko-KI-System', 'System mit erheblichem Schadenspotenzial'),
  eintrag('begriff', 'Betreiber', 'Wer ein KI-System in eigener Verantwortung verwendet'),
];

console.log('Rangfolge');
t('Exakter Titel zuerst: "Art. 6" vor "Art. 60"', suche(idx, 'Art. 6')[0].titel === 'Art. 6',
  `→ ${suche(idx, 'Art. 6')[0]?.titel}`);
t('"Art. 60" findet sich selbst', suche(idx, 'Art. 60')[0].titel === 'Art. 60');
t('Einheit vor Begriff bei gleichem Rang',
  suche(idx, 'Hochrisiko').findIndex(x => x.art === 'einheit') < suche(idx, 'Hochrisiko').findIndex(x => x.art === 'begriff'));
t('Volltext trifft auch ohne Titelbezug', suche(idx, 'Schadenspotenzial')[0].titel === 'Hochrisiko-KI-System');
t('Ein Zeichen liefert nichts (zu unspezifisch)', suche(idx, 'A').length === 0);
t('Leere Eingabe liefert nichts', suche(idx, '   ').length === 0);
t('Kein Treffer bleibt leer statt zu raten', suche(idx, 'Kompressor').length === 0);
t('Gross- und Kleinschreibung egal', suche(idx, 'betreiber')[0].titel === 'Betreiber');
t('Regex-Zeichen in der Eingabe stürzen nicht ab', Array.isArray(suche(idx, 'Art. 6 (')));
t('Höchstens acht Treffer', suche(idx, 'e').length <= 8);

console.log(`\n${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
