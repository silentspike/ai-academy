#!/usr/bin/env node
// tools/fuzz-extract-json.mjs — property-based fuzzing of the JSON extractor.
//
// extractJson is the most exposed parser in the product: it receives whatever a
// language model happens to emit. Four real failure modes have already occurred
// in operation (text after the object, two objects, unescaped quotes inside
// strings, raw line breaks). This harness generates malformed variants around a
// valid payload and asserts the only two acceptable outcomes: either a correct
// parse, or a clean throw. What must never happen is a silent wrong result, a
// hang, or a crash of a different kind.
//
// Deterministic: the generator is seeded, so a failure is reproducible via
//   node tools/fuzz-extract-json.mjs --seed <n> --runs <n>
import { extractJson } from '../tutor/prompts.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const RUNS = parseInt(arg('--runs', '2000'), 10);
let seed = parseInt(arg('--seed', '20260725'), 10);

// xorshift32 — small, deterministic, dependency-free
const rnd = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; };
const pick = a => a[Math.floor(rnd() * a.length)];
const int = n => Math.floor(rnd() * n);

const BASIS = () => ({
  score: +(rnd()).toFixed(2),
  verdict: pick(['correct', 'partial', 'wrong']),
  feedback: pick(['Kurz.', 'Mit "Anführung" drin.', 'Zeile eins\nZeile zwei', 'Ümläute und ß']),
  claims: [{ text: 'Art. 6 Abs. 3', source_ids: ['art-6-abs-3'] }],
});

// Each mutator returns [payload, mustParse]. mustParse=true means the extractor
// is expected to recover the object; false means throwing is acceptable too.
const MUTATOREN = [
  o => [JSON.stringify(o), true],
  o => ['```json\n' + JSON.stringify(o) + '\n```', true],
  o => ['Here is my assessment:\n' + JSON.stringify(o), true],
  o => [JSON.stringify(o) + '\n\nLet me know if you need more.', true],
  o => [JSON.stringify(o) + '\n' + JSON.stringify({ note: 'addendum' }), true],
  o => [JSON.stringify(o).replace('"feedback":"', '"feedback":"unescaped " quote '), false],
  o => [JSON.stringify(o).replace('Kurz.', 'line\nbreak'), false],
  o => [JSON.stringify(o).slice(0, Math.max(1, int(JSON.stringify(o).length))), false],
  o => ['   \n\t' + JSON.stringify(o) + '   \n', true],
  o => [JSON.stringify(o).replace(/}$/, ',}'), false],
  o => ['{'.repeat(1 + int(4)) + JSON.stringify(o), false],
  o => [JSON.stringify(o).replace(/"/g, "'"), false],
  o => ['', false],
  o => [pick(['null', 'undefined', '[]', '42', 'not json at all']), false],
];

let ok = 0, geworfen = 0, fehler = [];
for (let i = 0; i < RUNS; i++) {
  const objekt = BASIS();
  const mutator = pick(MUTATOREN);
  const [text, mussParsen] = mutator(objekt);
  let ergebnis, wurf = null;
  const start = Date.now();
  try { ergebnis = extractJson(text); } catch (e) { wurf = e; }
  const dauer = Date.now() - start;

  if (dauer > 1000) fehler.push(`run ${i}: took ${dauer} ms — possible pathological backtracking`);
  if (wurf) {
    if (mussParsen) fehler.push(`run ${i}: threw on a payload that must parse: ${String(wurf.message).slice(0, 60)}`);
    else geworfen++;
    continue;
  }
  if (ergebnis === null || typeof ergebnis !== 'object') {
    fehler.push(`run ${i}: returned ${JSON.stringify(ergebnis)} instead of an object or a throw`);
    continue;
  }
  if (mussParsen && ergebnis.verdict !== objekt.verdict) {
    fehler.push(`run ${i}: parsed but the verdict differs — silent wrong result`);
    continue;
  }
  ok++;
}

console.log(`fuzz extractJson: ${RUNS} runs (seed ${arg('--seed', '20260725')})`);
console.log(`  parsed: ${ok} · threw cleanly: ${geworfen} · defects: ${fehler.length}`);
for (const f of fehler.slice(0, 10)) console.error('  ✗ ' + f);
process.exit(fehler.length ? 1 : 0);
