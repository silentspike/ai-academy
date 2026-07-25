// Runs once before the suite.
//
// Two jobs: put a deterministic substitute for the language model on the PATH,
// and generate the state fixtures the specs jump into.
//
// The substitute is a CLI, not a mock inside the bridge. That way the real bridge
// code runs unchanged — including CLI detection, argument construction, timeout
// handling and JSON extraction, which is where the actual failures have occurred.

import { mkdirSync, rmSync, writeFileSync, chmodSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(new URL('../..', import.meta.url).pathname);

export default async function globalSetup() {
  // 1. Substitute CLI on the PATH, ahead of any real installation.
  const stubDir = join(ROOT, '.tmp-e2e-bin');
  rmSync(stubDir, { recursive: true, force: true });
  mkdirSync(stubDir, { recursive: true });

  for (const name of ['claude', 'codex']) {
    const p = join(stubDir, name);
    writeFileSync(p, `#!/usr/bin/env node\nprocess.argv[1] = ${JSON.stringify(join(stubDir, 'stub.mjs'))};\nawait import(${JSON.stringify(join(stubDir, 'stub.mjs'))});\n`);
    chmodSync(p, 0o755);
  }
  writeFileSync(join(stubDir, 'stub.mjs'), STUB_QUELLE);

  process.env.PATH = `${stubDir}:${process.env.PATH}`;
  process.env.E2E_STUB_DIR = stubDir;

  // 2. Store directory for the run.
  //
  // Deliberately created, not wiped: locally the web server may be reused across
  // runs, and pulling the directory out from under a live process produced a very
  // confusing 500. Each test sets its own state anyway, so a leftover store from
  // the previous run carries no meaning.
  for (const unter of ['', 'store', 'log', 'profiles']) {
    mkdirSync(join(ROOT, '.tmp-e2e-store', unter), { recursive: true });
  }

  return async () => {
    rmSync(stubDir, { recursive: true, force: true });
  };
}

// The substitute answers in the schema the prompt builders expect. It also
// reproduces the four failure modes seen in real operation, selected by a marker
// in the prompt, so the specs can exercise the recovery paths on purpose.
const STUB_QUELLE = `
import { readFileSync } from 'node:fs';

const argv = process.argv.slice(2);
let prompt = '';
const pIdx = argv.indexOf('-p');
if (pIdx >= 0 && argv[pIdx + 1]) prompt = argv[pIdx + 1];
if (!prompt) { try { prompt = readFileSync(0, 'utf8'); } catch { /* no stdin */ } }

const antwort = {
  score: 0.85,
  max_score: 1,
  verdict: 'correct',
  feedback: 'Die Einstufung trägt: Zweckbestimmung genannt, Rolle bestimmt, Fundstelle belegt.',
  claims: [{ text: 'Art. 6 Abs. 3', source_ids: ['art-6-abs-3'] }],
  uncertainties: [],
  critical_error: false,
  reply: 'Und wenn wir das Modell selbst nachtrainieren — ändert das etwas?',
  expression: 'nachbohrend',
};

// Deliberate failure modes, triggered by a marker anywhere in the prompt.
if (prompt.includes('E2E_FEHLER_TEXT_DANACH')) {
  process.stdout.write(JSON.stringify(antwort) + '\\n\\nHope that helps!');
} else if (prompt.includes('E2E_FEHLER_ZWEI_OBJEKTE')) {
  process.stdout.write(JSON.stringify(antwort) + '\\n' + JSON.stringify({ note: 'addendum' }));
} else if (prompt.includes('E2E_FEHLER_QUOTES')) {
  process.stdout.write(JSON.stringify(antwort).replace('trägt:', 'trägt: "so" —'));
} else if (prompt.includes('E2E_FEHLER_TIMEOUT')) {
  await new Promise(r => setTimeout(r, 120000));
} else {
  process.stdout.write(JSON.stringify(antwort));
}
`;
