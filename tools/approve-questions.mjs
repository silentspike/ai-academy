#!/usr/bin/env node
// tools/approve-questions.mjs — setzt source_linked → approved_summative NUR wenn
// pass 1 (check-questions) is green. Usage: node tools/approve-questions.mjs <protocol-anchor>
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const ROOT = new URL('..', import.meta.url).pathname;
const anchor = process.argv[2];
if (!anchor) { console.error('Protokoll-Anker fehlt'); process.exit(1); }
try { execSync('node ' + join(ROOT, 'tools/check-questions.mjs'), { stdio: 'inherit' }); }
catch { console.error('ABBRUCH: Durchgang 1 nicht grün — keine Freigabe.'); process.exit(1); }
const p = join(ROOT, 'content/questions-core.json');
const d = JSON.parse(readFileSync(p, 'utf8'));
let n = 0;
for (const q of d.questions) if (q.status === 'source_linked') {
  q.status = 'approved_summative';
  q.review_protocol = `eigenpruefung#${anchor}`;
  for (const cl of q.legal_basis) cl.verified = `eigenpruefung-${anchor}`;
  n++;
}
writeFileSync(p, JSON.stringify(d, null, 1));
console.log(`${n} Fragen freigegeben (${anchor}); approved gesamt: ${d.questions.filter(q => q.status === 'approved_summative').length}`);
