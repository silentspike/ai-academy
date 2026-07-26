// bridge/browser-oeffnen.mjs — open the address in the default browser.
//
// Its own file so it can be imported and tested without starting a server: the
// three platform branches are exactly the part that cannot be exercised on the
// machine this is built on, so at least the mapping is checked rather than
// assumed. Dependency-free, like the rest of the bridge.

import { spawn } from 'node:child_process';

/**
 * Fixed executable per platform, URL as an argument, never a shell — the same
 * rule the CLI allowlist follows (threat T8).
 *
 * Windows: `start` is a cmd builtin, not a program, and its first quoted
 * argument is taken as the window title — hence the empty string before the URL.
 */
export function browserBefehl(plattform) {
  if (plattform === 'darwin') return { exe: 'open', args: [] };
  if (plattform === 'win32') return { exe: 'cmd', args: ['/c', 'start', ''] };
  return { exe: 'xdg-open', args: [] };
}

/**
 * Opens the URL. Failure is reported, never fatal: the address is on screen and
 * can be opened by hand — an unopenable browser must not stop the server.
 */
export function oeffneBrowser(url, { plattform = process.platform, melde = console.log } = {}) {
  const { exe, args } = browserBefehl(plattform);
  try {
    const kind = spawn(exe, [...args, url], { stdio: 'ignore', detached: true });
    kind.on('error', (e) => melde(`Browser nicht automatisch geöffnet (${e.code}) — Adresse oben von Hand öffnen.`));
    kind.unref();
    return true;
  } catch (e) {
    melde(`Browser nicht automatisch geöffnet (${e.message}) — Adresse oben von Hand öffnen.`);
    return false;
  }
}
