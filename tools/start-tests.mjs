#!/usr/bin/env node
// tools/start-tests.mjs — the start path across platforms.
//
// The Mac and Windows runs are an acceptance point for the owner; what can be
// checked here is everything that is not the operating system itself: the
// platform mapping, the shell syntax, the executable bit, and that the release
// package carries all three scripts.

import { readFileSync, existsSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { browserBefehl } from '../bridge/browser-oeffnen.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const t = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ ${name} ${detail}`); }
};

console.log('Plattform-Zuordnung');
t('macOS öffnet mit open', browserBefehl('darwin').exe === 'open');
t('Windows über cmd /c start', JSON.stringify(browserBefehl('win32')) === JSON.stringify({ exe: 'cmd', args: ['/c', 'start', ''] }));
t('Windows: leerer Fenstertitel vor der URL', browserBefehl('win32').args[2] === '');
t('Linux öffnet mit xdg-open', browserBefehl('linux').exe === 'xdg-open');
t('Unbekannte Plattform fällt auf xdg-open zurück', browserBefehl('sunos').exe === 'xdg-open');
t('Kein Argument enthält Shell-Metazeichen',
  ['darwin', 'win32', 'linux'].every(p => browserBefehl(p).args.every(a => !/[;&|`$<>]/.test(a))));

console.log('\nStart-Skripte');
for (const [datei, ausfuehrbar] of [['start.sh', true], ['start.command', true], ['start.bat', false]]) {
  const pfad = join(ROOT, datei);
  t(`${datei} vorhanden`, existsSync(pfad));
  if (!existsSync(pfad)) continue;
  const inhalt = readFileSync(pfad, 'utf8');
  t(`${datei} startet die Bridge mit --open`, /bridge[\\/]bridge\.mjs.*--open/.test(inhalt));
  t(`${datei} prüft auf Node`, /node/i.test(inhalt) && /(command -v node|where node)/.test(inhalt));
  t(`${datei} nennt eine Mindestversion`, /20/.test(inhalt));
  if (ausfuehrbar) {
    t(`${datei} ist ausführbar`, (statSync(pfad).mode & 0o111) !== 0,
      `mode ${(statSync(pfad).mode & 0o777).toString(8)}`);
  }
}

// The Finder starts a .command from the home directory, not from the folder the
// file is in — without the cd the bridge would look for public/ in the wrong place.
for (const datei of ['start.sh', 'start.command']) {
  const inhalt = readFileSync(join(ROOT, datei), 'utf8');
  t(`${datei} wechselt zuerst ins eigene Verzeichnis`, /cd "\$\(dirname "\$0"\)"/.test(inhalt));
  try {
    execFileSync('bash', ['-n', join(ROOT, datei)], { stdio: 'pipe' });
    t(`${datei} ist syntaktisch gültig`, true);
  } catch (e) { t(`${datei} ist syntaktisch gültig`, false, String(e.stderr).slice(0, 120)); }
}
const bat = readFileSync(join(ROOT, 'start.bat'), 'utf8');
t('start.bat wechselt ins eigene Verzeichnis', /cd \/d "%~dp0"/.test(bat));
t('start.bat hält das Fenster bei fehlendem Node offen', /pause/.test(bat));

console.log('\nRelease-Paket');
const rel = readFileSync(join(ROOT, '.github/workflows/release.yml'), 'utf8');
for (const datei of ['start.sh', 'start.command', 'start.bat']) {
  t(`${datei} ist im Release-Paket`, rel.includes(datei));
}
t('start.command behält im Paket das Ausführungsrecht', /chmod \+x[^\n]*start\.command/.test(rel));

console.log(`\n${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
