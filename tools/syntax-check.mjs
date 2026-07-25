#!/usr/bin/env node
// tools/syntax-check.mjs — parses every source file in one process.
//
// Spawning `node --check` per file costs roughly 150 ms of process start each,
// which dominated the check entirely (38 files, over two seconds). Parsing them
// in a single process with the VM module removes that cost: the source is parsed,
// never evaluated, so nothing runs and nothing is imported.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';

const ROOT = new URL('..', import.meta.url).pathname;
const VERZEICHNISSE = ['app', 'bridge', 'tutor', 'tools', 'scripts', 'tests'];

function dateien(dir) {
  let out = [];
  for (const f of readdirSync(dir)) {
    if (f === 'node_modules' || f.startsWith('.')) continue;
    const p = join(dir, f);
    if (statSync(p).isDirectory()) out = out.concat(dateien(p));
    else if (/\.(mjs|js)$/.test(f)) out.push(p);
  }
  return out;
}

const alle = VERZEICHNISSE.flatMap(d => {
  try { return dateien(join(ROOT, d)); } catch { return []; }
});

const fehler = [];
for (const f of alle) {
  const quelle = readFileSync(f, 'utf8');
  try {
    // Modules and scripts need different parsers. Anything with import or export
    // at the top level is a module.
    if (/^\s*(import|export)\b/m.test(quelle)) new vm.SourceTextModule(quelle, { identifier: f });
    else new vm.Script(quelle, { filename: f });
  } catch (e) {
    fehler.push(`${f.replace(ROOT, '')}: ${e.message}`);
  }
}

console.log(`syntax: ${alle.length} files checked, ${fehler.length} with errors`);
for (const f of fehler) console.error('  ✗ ' + f);
process.exit(fehler.length ? 1 : 0);
