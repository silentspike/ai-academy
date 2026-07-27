// tools/plattform-start.mjs — starts the bridge the way a recipient does, and
// checks that it answers.
//
// Written in Node rather than in shell because that is the point: the thing this
// verifies is that the product runs on macOS and Windows, and a bash script
// cannot run on Windows. The owner of this project has neither machine — GitHub
// runners are the only place these two platforms exist for it, so this file is
// what those runners execute.
//
// What it covers, in the order the failures actually happen:
//   1. the start script for this platform is present and correctly formed
//   2. the browser command for this platform is the right one
//   3. the bridge starts, on a free port, with a fresh store
//   4. it answers /api/health and serves the application
//   5. the learning state survives a write and a read — the path handling that
//      differs between platforms sits exactly here
//   6. it shuts down when asked

import { spawn } from 'node:child_process';
import { existsSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { browserBefehl } from '../bridge/browser-oeffnen.mjs';

const PORT = Number(process.env.PLATTFORM_PORT || 8933);
const STORE = '.store-plattform';
const BASIS = `http://127.0.0.1:${PORT}`;
const schritte = [];
let fehler = 0;

const pruefe = (name, ok, detail = '') => {
  schritte.push({ name, ok, detail });
  if (!ok) fehler++;
  console.log(`${ok ? 'OK  ' : 'FEHL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

// ---- 1. Startskript dieser Plattform ---------------------------------------
const SKRIPT = { darwin: 'start.command', win32: 'start.bat' }[process.platform] ?? 'start.sh';
pruefe(`Startskript ${SKRIPT} vorhanden`, existsSync(SKRIPT));
if (existsSync(SKRIPT)) {
  const inhalt = readFileSync(SKRIPT, 'utf-8');
  // Every start script has to reach the same entry point; a package whose
  // Windows script points somewhere else is a package that only looks complete.
  pruefe(`${SKRIPT} startet bridge/bridge.mjs`, /bridge[\\/]bridge\.mjs/.test(inhalt));
  pruefe(`${SKRIPT} prüft die Node-Version`, /process\.versions\.node/.test(inhalt));
  if (process.platform !== 'win32') {
    // A .command without the executable bit does nothing when double-clicked in
    // the Finder, and the failure is silent.
    pruefe(`${SKRIPT} ist ausführbar`, (statSync(SKRIPT).mode & 0o111) !== 0,
      '0' + (statSync(SKRIPT).mode & 0o777).toString(8));
  }
}

// ---- 2. Browser-Befehl dieser Plattform ------------------------------------
const erwartet = { darwin: 'open', win32: 'cmd' }[process.platform] ?? 'xdg-open';
const befehl = browserBefehl(process.platform);
pruefe(`Browser-Befehl für ${process.platform}`, befehl.exe === erwartet, `${befehl.exe} ${befehl.args.join(' ')}`);

// ---- 3. Bridge starten -----------------------------------------------------
rmSync(STORE, { recursive: true, force: true });
const bridge = spawn(process.execPath, ['bridge/bridge.mjs', '--no-llm', '--port', String(PORT), '--store', STORE],
  { stdio: ['ignore', 'pipe', 'pipe'] });
let ausgabe = '';
bridge.stdout.on('data', d => { ausgabe += d; });
bridge.stderr.on('data', d => { ausgabe += d; });

const warte = ms => new Promise(r => setTimeout(r, ms));
let token = null;
try {
  let da = false;
  for (let i = 0; i < 40 && !da; i++) {
    await warte(500);
    try { da = (await fetch(`${BASIS}/api/health`)).ok; } catch { /* noch nicht oben */ }
  }
  pruefe('Bridge antwortet auf /api/health', da, `nach höchstens 20 s${da ? '' : `\n${ausgabe}`}`);

  if (da) {
    // ---- 4. Anwendung wird ausgeliefert -----------------------------------
    const seite = await (await fetch(`${BASIS}/`)).text();
    pruefe('Anwendung wird ausgeliefert', seite.includes('AI-Act-Akademie'));
    // Token injection happens while serving; without it every call from the
    // page is refused with 403.
    const treffer = seite.match(/BRIDGE_TOKEN\s*=\s*'([^']+)'/);
    token = treffer?.[1] ?? null;
    pruefe('Pairing-Token in die Seite eingesetzt', !!token && token !== '__BRIDGE_TOKEN__');

    const selbst = await (await fetch(`${BASIS}/selfcheck.html`)).text();
    pruefe('Selbstprüfung bekommt ebenfalls ein Token',
      /BRIDGE_TOKEN\s*=\s*'(?!__BRIDGE_TOKEN__)[^']+'/.test(selbst));

    // ---- 5. Lernstand schreiben und zurücklesen ---------------------------
    // The place where platforms differ: path separators, atomic rename, file
    // locking. A store that silently fails to write loses a learning day.
    if (token) {
      const kopf = { 'Content-Type': 'application/json', 'X-Bridge-Token': token };
      const probe = { state: { xp: 4711, cards: [], plattform: process.platform } };
      const put = await fetch(`${BASIS}/api/progress`, { method: 'PUT', headers: kopf, body: JSON.stringify(probe) });
      pruefe('Lernstand geschrieben', put.ok, `HTTP ${put.status}`);
      const zurueck = await (await fetch(`${BASIS}/api/progress`, { headers: kopf })).json();
      pruefe('Lernstand zurückgelesen', zurueck?.state?.xp === 4711, JSON.stringify(zurueck?.state ?? null));
      pruefe('Store-Datei liegt auf der Platte', existsSync(join(STORE, 'store', 'progress.json')));
    }
  }
} finally {
  // ---- 6. Beenden ----------------------------------------------------------
  bridge.kill();
  await warte(700);
  pruefe('Bridge beendet sich', bridge.killed || bridge.exitCode !== null,
    `exitCode ${bridge.exitCode}`);
  // Windows keeps a handle for a moment after the process is gone; failing to
  // remove a temporary directory is not a finding about the product.
  try { rmSync(STORE, { recursive: true, force: true }); } catch { /* Aufräumen ist nicht die Prüfung */ }
}

console.log(`\n${schritte.length - fehler}/${schritte.length} auf ${process.platform} (${process.arch}), Node ${process.versions.node}`);
process.exit(fehler ? 1 : 0);
