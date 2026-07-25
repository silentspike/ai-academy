// A deterministic stand-in for the language-model CLI.
//
// It is a real executable on the PATH, not a mock inside the bridge. CLI
// detection, argument construction, the JSON envelope, session handling, timeout
// handling and JSON extraction therefore all run unchanged — which is where the
// actual failures have occurred.
//
// The answer is derived from the "Ausgabeformat" block of the prompt rather than
// hard-coded per endpoint: the prompt states the shape it expects, so a new
// prompt gets a fitting answer without touching this file.
import { readFileSync } from 'node:fs';

const NAME = process.env.E2E_STUB_NAME || 'claude';
const argv = process.argv.slice(2);

// Both CLIs take the prompt as the last positional argument — `-p` is a switch,
// not a carrier of the prompt. Reading the value after `-p` yields
// "--output-format" and everything downstream silently gets the wrong answer.
const MIT_WERT = new Set(['--output-format', '--model', '--system-prompt',
  '--disallowedTools', '--setting-sources', '--session-id', '--resume']);
let prompt = '';
for (let i = 0; i < argv.length; i++) {
  if (MIT_WERT.has(argv[i])) { i++; continue; }     // skip flag and its value
  if (argv[i].startsWith('-')) continue;
  prompt = argv[i];                                  // last free argument wins
}
if (!prompt) { try { prompt = readFileSync(0, 'utf8'); } catch { /* no stdin */ } }

/** Plausible value for a field the prompt asks for. */
function wert(feld) {
  const f = feld.toLowerCase();
  if (/^(score|punkte)$/.test(f)) return 0.85;
  if (/max_score/.test(f)) return 1;
  if (/verdict|urteil/.test(f)) return 'correct';
  if (/critical/.test(f)) return false;
  if (/uncertaint|unsicher/.test(f)) return [];
  if (/claims/.test(f)) return [{ text: 'Art. 6 Abs. 3', source_ids: ['art-6-abs-3'] }];
  if (/source_ids/.test(f)) return ['art-6-abs-3'];
  if (/say|reply|antwort/.test(f)) return 'Und wenn wir das Modell selbst nachtrainieren — ändert das etwas?';
  if (/pressure_point|prüfaspekt/.test(f)) return 'Zweckbestimmung';
  if (/expression|ausdruck/.test(f)) return 'nachbohrend';
  if (/feedback|begründung|erklärung/.test(f)) return 'Die Einstufung trägt: Zweckbestimmung genannt, Rolle bestimmt, Fundstelle belegt.';
  if (/summary|zusammenfassung/.test(f)) return 'Schwerpunkt heute: Rollenabgrenzung nach Art. 25.';
  if (/list|liste|steps|schritte|items/.test(f)) return [];
  return 'ok';
}

/** Reads the field names out of the example object in the prompt's format block. */
function ausAusgabeformat(text) {
  const block = text.split(/##\s*Ausgabeformat/i)[1];
  if (!block) return null;
  const start = block.indexOf('{');
  if (start < 0) return null;
  let tiefe = 0, ende = -1;
  for (let i = start; i < block.length; i++) {
    if (block[i] === '{') tiefe++;
    else if (block[i] === '}') { tiefe--; if (tiefe === 0) { ende = i; break; } }
  }
  if (ende < 0) return null;
  const roh = block.slice(start, ende + 1);
  const felder = [...roh.matchAll(/"([a-z_]+)"\s*:/gi)].map(m => m[1]);
  if (!felder.length) return null;
  return Object.fromEntries(felder.map(f => [f, wert(f)]));
}

const objekt = ausAusgabeformat(prompt) ?? {
  score: 0.85, max_score: 1, verdict: 'correct',
  feedback: 'Die Einstufung trägt: Zweckbestimmung genannt, Rolle bestimmt, Fundstelle belegt.',
  claims: [{ text: 'Art. 6 Abs. 3', source_ids: ['art-6-abs-3'] }],
  uncertainties: [], critical_error: false,
};

// A prompt without a format block wants prose (the coach path).
const willJson = /##\s*Ausgabeformat/i.test(prompt) || /JSON/.test(prompt);
let nutzlast = willJson ? JSON.stringify(objekt)
  : 'Guter Ansatz. Prüfe als Nächstes, wessen Daten verarbeitet werden — das entscheidet über Anhang III.';

// Failure modes seen in real operation, triggered by a marker in the prompt, so
// specs can exercise the recovery paths deliberately.
if (prompt.includes('E2E_FEHLER_TEXT_DANACH')) nutzlast += '\n\nHope that helps!';
else if (prompt.includes('E2E_FEHLER_ZWEI_OBJEKTE')) nutzlast += '\n' + JSON.stringify({ note: 'addendum' });
else if (prompt.includes('E2E_FEHLER_QUOTES')) nutzlast = nutzlast.replace('trägt:', 'trägt: "so" —');
else if (prompt.includes('E2E_FEHLER_TIMEOUT')) await new Promise(r => setTimeout(r, 120_000));

if (NAME === 'claude') {
  // What `claude -p --output-format json` returns; the bridge reads .result.
  process.stdout.write(JSON.stringify({
    type: 'result',
    subtype: 'success',
    is_error: false,
    result: nutzlast,
    session_id: 'e2e-' + Buffer.from(prompt.slice(0, 24)).toString('hex').slice(0, 12),
  }));
} else {
  process.stdout.write(nutzlast);
}
