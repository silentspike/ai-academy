#!/usr/bin/env node
// tools/build-release.mjs — Release-Paket-Builder (Plan §5.7):
// versioniertes ZIP (App + Assets + Content + Bridge + Doku) + Pflicht-Gates:
//   1. Schema-Validierung  2. legal-audit-Lauf  3. Privat-Begriffe-Scan
// Der Scan läuft ÜBER DEN PAKET-INHALT (nicht das Repo) — was ins ZIP geht, ist geprüft.
// Aufruf: node tools/build-release.mjs [--version vX.Y.Z] [--out dist/]
import { execSync } from 'node:child_process';
import { readFileSync, mkdirSync, rmSync, cpSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
const ROOT = new URL('..', import.meta.url).pathname;
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const VERSION = arg('--version', 'v0.9.0-dev');
const OUT = arg('--out', join(ROOT, 'dist'));

// Paket-Inhalt (Whitelist — data/, legal/, tests/, .git kommen NIE mit)
const INCLUDE = ['public', 'app', 'content', 'assets', 'bridge', 'tutor', 'tools', 'scripts', 'docs',
  'README.md', 'SETUP-AGENT.md', 'TROUBLESHOOT-AGENT.md', 'UPDATE-PROZESS.md', 'content/SCHEMA.md'];
// Gate-3-Muster, zweigeteilt:
//  (a) ÖFFENTLICH — verbotene Key-Umgebungsnamen. Das Produkt nutzt ausschließlich
//      Abo/OAuth über die CLI; ein API-Key-Pfad darf nie zurückkehren. Diese Regel ist
//      selbst kein Geheimnis und steht deshalb im Klartext.
const FORBIDDEN_KEY_ENVS = /ANTHROPIC_API_KEY|OPENAI_API_KEY|GEMINI_API_KEY/i;
//  (b) PRIVAT — projekt-/personenbezogene Begriffe. Die Liste steht NICHT im Repo:
//      In einem öffentlichen Repo würde der Schutzmechanismus sonst genau das verraten,
//      was er schützt. Quelle ist die Umgebungsvariable PRIVATE_TERMS_REGEX (in CI aus
//      einem Secret) oder die lokale, nicht versionierte Datei .private-terms.
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
// Gate 1+2: Validierung + legal-audit lauffähig
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
// Laufzeit-Reste aus dem Stage entfernen
rmSync(join(stage, 'public/.playwright-cli'), { recursive: true, force: true });
rmSync(join(stage, '.playwright-cli'), { recursive: true, force: true });
writeFileSync(join(stage, 'VERSION'), VERSION + '\n');

// Gate 3: Privat-Begriffe-Scan über den STAGE-Inhalt (Plan §5.1 Release-Scan)
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
      // Der Treffer wird OHNE die auslösende Zeile gemeldet, damit ein öffentliches
      // CI-Protokoll den geschützten Begriff nicht doch noch preisgibt.
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
