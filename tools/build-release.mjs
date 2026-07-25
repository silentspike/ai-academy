#!/usr/bin/env node
// tools/build-release.mjs — Release-Paket-Builder (Plan §5.7):
// versioniertes ZIP (App + Assets + Content + Bridge + Doku) + Pflicht-Gates:
//   1. Schema-Validierung  2. legal-audit-Lauf  3. Privat-Begriffe-Scan
// The scan runs OVER THE PACKAGE CONTENT, not the repository — what ships is what was checked.
// Aufruf: node tools/build-release.mjs [--version vX.Y.Z] [--out dist/]
import { execSync } from 'node:child_process';
import { readFileSync, mkdirSync, rmSync, cpSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
const ROOT = new URL('..', import.meta.url).pathname;
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const VERSION = arg('--version', 'v0.9.0-dev');
const OUT = arg('--out', join(ROOT, 'dist'));

// Package content (allowlist — data/, legal/, tests/ and .git never ship)
const INCLUDE = ['public', 'app', 'content', 'assets', 'bridge', 'tutor', 'tools', 'scripts', 'docs',
  'README.md', 'SETUP-AGENT.md', 'TROUBLESHOOT-AGENT.md', 'UPDATE-PROZESS.md', 'content/SCHEMA.md'];
// Gate-3-Muster, zweigeteilt:
//  (a) PUBLIC — forbidden key environment names. The product uses subscription
//      sign-in through the CLI only; an API key path must never return. The rule is
//      itself no secret and therefore stands in clear text.
const FORBIDDEN_KEY_ENVS = /ANTHROPIC_API_KEY|OPENAI_API_KEY|GEMINI_API_KEY/i;
//  (b) PRIVATE — project and person specific terms. The list is NOT in the repository:
//      in a public repository the guard would otherwise reveal exactly what it
//      protects. The source is the environment variable PRIVATE_TERMS_REGEX (from a
//      secret in CI) or the local, unversioned file .private-terms.
function loadPrivateTerms() {
  const env = process.env.PRIVATE_TERMS_REGEX?.trim();
  if (env) return new RegExp(env, 'i');
  try {
    const s = readFileSync(join(ROOT, '.private-terms'), 'utf-8').trim();
    if (s) return new RegExp(s, 'i');
  } catch { /* Datei fehlt — unten wird gewarnt */ }
  return null;
}
const PRIVATE_TERMS = loadPrivateTerms();

console.log(`Release-Build ${VERSION}`);
// Gates 1 and 2: validation and legal audit must run
execSync('node tools/validate-content.mjs', { cwd: ROOT, stdio: 'inherit' });
execSync('node tools/legal-audit.mjs "Art. 6" > /dev/null', { cwd: ROOT, stdio: 'inherit', shell: '/bin/bash' });
console.log('Gates 1+2 (Schema, legal-audit) grün');

// Stage
const stage = join(OUT, `ai-act-akademie-${VERSION}`);
rmSync(stage, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });
for (const item of INCLUDE) {
  try { cpSync(join(ROOT, item), join(stage, item), { recursive: true, dereference: true }); }
  catch (e) { if (item === 'README.md') console.warn('README.md fehlt noch (Task 11)'); else throw e; }
}
// Remove runtime leftovers from the staging directory
rmSync(join(stage, 'public/.playwright-cli'), { recursive: true, force: true });
rmSync(join(stage, '.playwright-cli'), { recursive: true, force: true });
writeFileSync(join(stage, 'VERSION'), VERSION + '\n');

// Gate 3: protected-term scan over the STAGED content
const hits = [];
(function scan(dir) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) { scan(p); continue; }
    if (!/\.(json|js|mjs|html|css|md|sh|bat|service)$/.test(f)) continue;
    if (f === 'build-release.mjs') continue;             // definiert selbst das Scan-Muster
    const lines = readFileSync(p, 'utf-8').split('\n');
    lines.forEach((l, i) => {
      const treffer = FORBIDDEN_KEY_ENVS.test(l) || (PRIVATE_TERMS && PRIVATE_TERMS.test(l));
      // The hit is reported WITHOUT the offending line so that a public
      // pipeline log does not leak the protected term after all.
      if (treffer) hits.push(`${p.replace(stage + '/', '')}:${i + 1}`);
    });
  }
})(stage);
if (hits.length) {
  console.error(`RELEASE ABGEBROCHEN — ${hits.length} Treffer (Fundstellen, Inhalt bewusst nicht protokolliert):`);
  hits.slice(0, 10).forEach(h => console.error('  ' + h));
  rmSync(stage, { recursive: true, force: true });
  process.exit(1);
}
if (!PRIVATE_TERMS) {
  console.warn('Gate 3: nur Key-Env-Prüfung gelaufen — PRIVATE_TERMS_REGEX/.private-terms fehlt.');
} else {
  console.log('Gate 3 (Key-Envs + private Begriffe über Paket-Inhalt): sauber');
}

// ZIP
const zip = join(OUT, `ai-act-akademie-${VERSION}.zip`);
rmSync(zip, { force: true });
execSync(`cd ${JSON.stringify(OUT)} && zip -qr ${JSON.stringify(zip)} ${JSON.stringify(`ai-act-akademie-${VERSION}`)}`, { shell: '/bin/bash' });
const mb = (statSync(zip).size / 1048576).toFixed(1);
console.log(`Paket: ${zip} (${mb} MB)`);
console.log('Release-Checkliste (manuell, Plan §5.7): ZIP in leerem Verzeichnis entpacken → node bridge/bridge.mjs → Self-Check grün in Chrome UND Firefox.');
