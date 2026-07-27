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
import { isFrontierModel } from '../app/llm-adapter.js';

/**
 * loeseModellAuf lives in bridge.mjs, which starts a server on import — so the
 * function is lifted out of the source rather than imported. Ugly, and better
 * than either starting a server in a unit test or not testing the thing at all.
 */
function ladeModellAufloesung() {
  const src = readFileSync(join(ROOT, 'bridge/bridge.mjs'), 'utf8');
  const start = src.indexOf('export function loeseModellAuf');
  const ende = src.indexOf('\n}', src.indexOf('return ersatz;')) + 2;
  return new Function('logLine', src.slice(start, ende).replace('export function', 'return function'))(() => {});
}

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

console.log('\nFrontier-Gate');
// The bridge asks for an alias so it cannot get stuck on a superseded version.
// The gate read the alias as an unknown model and locked every summative
// function — the entire examination system, over a naming convention. Caught by
// the exam specs, not by anything here, which is why it is here now.
for (const m of ['opus', 'sonnet', 'fable', 'claude-opus-5', 'claude-opus-4-8', 'claude-sonnet-5', 'gpt-5', 'codex']) {
  t(`\u201e${m}\u201c gilt als unterstuetzt`, isFrontierModel(m) === true);
}
for (const m of ['claude-haiku-4-5-20251001', 'haiku', 'llama-3', 'mistral-large', 'gemini-2', '', null, 'opus-lite']) {
  t(`\u201e${m}\u201c gilt NICHT als unterstuetzt`, isFrontierModel(m) === false);
}

console.log('\nTestinstanz');
{
  const pfad = join(ROOT, 'test-instanz.sh');
  t('test-instanz.sh vorhanden', existsSync(pfad));
  const inhalt = existsSync(pfad) ? readFileSync(pfad, 'utf8') : '';
  t('ist ausfuehrbar', existsSync(pfad) && (statSync(pfad).mode & 0o111) !== 0);
  t('startet mit eigenem Store', /--store "\$STORE"/.test(inhalt));
  t('waehlt einen freien Port', /--port 0/.test(inhalt));
  t('erzeugt ein eigenes Kopplungsmerkmal', /BRIDGE_TOKEN="\$TOKEN"/.test(inhalt));
  t('verweigert den echten Lernstand als Ziel', /ABBRUCH/.test(inhalt) && /ECHT/.test(inhalt));
  t('kennt --zuruecksetzen', /--zuruecksetzen/.test(inhalt));
  try {
    execFileSync('bash', ['-n', pfad], { stdio: 'pipe' });
    t('syntaktisch gueltig', true);
  } catch (e) { t('syntaktisch gueltig', false, String(e.stderr).slice(0, 120)); }
  // The guard is the part that matters — a test instance pointed at the real
  // record would be worse than no test instance.
  for (const ziel of [join(ROOT, 'data'), ROOT]) {
    try {
      execFileSync('bash', [pfad, '--store', ziel], { stdio: 'pipe', timeout: 10000 });
      t(`weist ${ziel} zurueck`, false, 'kein Abbruch');
    } catch (e) {
      t(`weist ${ziel} zurueck`, String(e.stdout ?? '').includes('ABBRUCH') || String(e.stderr ?? '').includes('ABBRUCH'),
        String(e.stderr ?? e.stdout ?? '').slice(0, 80));
    }
  }
  const gi = readFileSync(join(ROOT, '.gitignore'), 'utf8');
  t('data-test/ ist von der Versionierung ausgenommen', /^data-test\/$/m.test(gi));
}

console.log('\nRelease-Paket');
const rel = readFileSync(join(ROOT, '.github/workflows/release.yml'), 'utf8');
for (const datei of ['start.sh', 'start.command', 'start.bat']) {
  t(`${datei} ist im Release-Paket`, rel.includes(datei));
}
t('start.command behält im Paket das Ausführungsrecht', /chmod \+x[^\n]*start\.command/.test(rel));

console.log('\nModell-Auflösung');
// The CLI reports more than one model per call: it runs its own small steps on a
// light model, and in a short grading call that helper can account for more
// output tokens than the answer. Taking the first key logged Haiku as the grader
// of an Opus run; "most tokens" would have been wrong in the same way.
const loese = ladeModellAufloesung();
const zweiModelle = { 'claude-haiku-4-5-20251001': { outputTokens: 22 }, 'claude-opus-5': { outputTokens: 8 } };
t('Hilfsmodell mit mehr Tokens gewinnt nicht', loese(zweiModelle, 'opus') === 'claude-opus-5',
  `→ ${loese(zweiModelle, 'opus')}`);
t('Einzelnes Modell wird durchgereicht', loese({ 'claude-opus-5': { outputTokens: 8 } }, 'opus') === 'claude-opus-5');
t('Zwei Opus-Fassungen: die arbeitende gewinnt',
  loese({ 'claude-opus-4-8': { outputTokens: 5 }, 'claude-opus-5': { outputTokens: 40 } }, 'opus') === 'claude-opus-5');
t('Voller Name trifft sich selbst', loese({ 'claude-opus-5': { outputTokens: 8 } }, 'claude-opus-5') === 'claude-opus-5');
t('Antwort von einem ganz anderen Modell wird gemeldet, nicht verschwiegen',
  loese({ 'claude-sonnet-5': { outputTokens: 30 } }, 'opus') === 'claude-sonnet-5');
t('Ohne Angabe null statt Rateversuch', loese({}, 'opus') === null);

// ---------- Pfad-Wache: die Plattform-Verzweigung, ohne die Plattform ----------
// The static guard compared `resolve(fp).startsWith(root + '/')`. A hard-coded
// slash is a Unix assumption; on Windows the resolved path uses backslashes, the
// comparison failed for every file, and the bridge served nothing while
// /api/health answered cheerfully. Found by the first run of the platform job on
// windows-latest — and reproducible here only by testing the mapping itself.
console.log('Pfad-Wache (posix und win32)');
{
  const { liegtInnerhalb } = await import('../bridge/pfad-wache.mjs');
  const posix = (await import('node:path')).posix;
  const win32 = (await import('node:path')).win32;
  const p = (w, z) => liegtInnerhalb(w, z, posix.relative, posix.isAbsolute, posix.sep);
  const w = (a, z) => liegtInnerhalb(a, z, win32.relative, win32.isAbsolute, win32.sep);

  t('posix: Datei unter der Wurzel', p('/srv/public', '/srv/public/index.html'));
  t('posix: Wurzel selbst', p('/srv/public', '/srv/public'));
  t('posix: Geschwister mit gleichem Präfix bleibt draußen', !p('/srv/public', '/srv/publicX/geheim'));
  t('posix: Traversal bleibt draußen', !p('/srv/public', '/srv/data/progress.json'));

  t('win32: Datei unter der Wurzel', w('D:\\a\\repo\\public', 'D:\\a\\repo\\public\\index.html'));
  t('win32: Wurzel selbst', w('D:\\a\\repo\\public', 'D:\\a\\repo\\public'));
  t('win32: Geschwister mit gleichem Präfix bleibt draußen', !w('D:\\a\\repo\\public', 'D:\\a\\repo\\publicX\\geheim'));
  t('win32: Traversal bleibt draußen', !w('D:\\a\\repo\\public', 'D:\\a\\repo\\data\\progress.json'));
  t('win32: andere Platte bleibt draußen', !w('D:\\a\\repo\\public', 'C:\\Windows\\system32\\drivers\\etc\\hosts'));
}

// ---------- Quellenprüfung: das Modell ist nie selbst Rechtsquelle ----------
// Die Prompts verlangen claims + source_ids seit jeher — geprüft hat sie niemand.
// Ein Modell, das „Art. 6 Abs. 7" erfindet, erzeugt einen Satz, der genau so
// aussieht wie einer, der auf dem Amtsblatt ruht.
console.log('Quellenprüfung (Rang 8 der Quellenhierarchie)');
{
  const { normalisiereRef, baueRegister, pruefeClaim, pruefeAntwort } =
    await import('../app/quellenpruefung.js');

  t('drei Schreibweisen derselben Fundstelle fallen zusammen',
    normalisiereRef('Art. 6 Abs. 3 lit. a') === normalisiereRef('art-6-abs-3-lit-a') &&
    normalisiereRef('Artikel 6 Absatz 3 Buchstabe a') === normalisiereRef('Art. 6 Abs. 3 lit. a'));
  t('Fassungs-Zusatz ist nicht Teil der Identität',
    normalisiereRef('Art. 113 Abs. 3 lit. a idF 2026/1744') === normalisiereRef('Art. 113 Abs. 3 lit. a'));
  t('verschiedene Absätze bleiben verschieden',
    normalisiereRef('Art. 6 Abs. 3') !== normalisiereRef('Art. 6 Abs. 7'));

  const reg = baueRegister([
    { legal_basis: [{ ref: 'Art. 6 Abs. 3', instrument: 'VO 2024/1689 idF 2026/1744' }] },
    { blocks: [{ legal_basis: [{ ref: 'Art. 50 Abs. 1' }] }] },
  ]);
  t('Register liest auch die Fundstellen der Blöcke', reg.size === 2);

  t('belegte Behauptung geht durch',
    pruefeClaim({ source_ids: ['art-6-abs-3'] }, reg).status === 'belegt');
  t('erfundene Fundstelle wird gefangen',
    pruefeClaim({ source_ids: ['Art. 6 Abs. 7'] }, reg).status === 'unbelegt');
  t('Behauptung ganz ohne Fundstelle ist ein eigener Befund',
    pruefeClaim({ text: 'Art. 6 gilt seit gestern' }, reg).status === 'ohne-quelle');
  t('eine erfundene unter mehreren genügt für den Befund',
    pruefeClaim({ source_ids: ['art-6-abs-3', 'Art. 6 Abs. 7'] }, reg).status === 'unbelegt');

  const antwort = pruefeAntwort({ claims: [
    { text: 'a', source_ids: ['Art. 6 Abs. 3'] },
    { text: 'b', source_ids: ['Art. 99 Abs. 12'] },
  ] }, reg);
  t('Antwort mit einer erfundenen Fundstelle gilt nicht als belegt', antwort.alleBelegt === false);
  t('nur die beanstandete Aussage wird beanstandet',
    antwort.beanstandet.length === 1 && antwort.beanstandet[0].text === 'b');
  t('ohne Behauptungen kein Gütesiegel',
    pruefeAntwort({ claims: [] }, reg).alleBelegt === false);

  // Negativkontrolle: gegen ein LEERES Register muss auch die richtige
  // Fundstelle durchfallen — sonst prüft die Prüfung nichts.
  t('Negativkontrolle: leeres Register beanstandet auch Korrektes',
    pruefeClaim({ source_ids: ['Art. 6 Abs. 3'] }, new Map()).status === 'unbelegt');
}

console.log(`\n${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
