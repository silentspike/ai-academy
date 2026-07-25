#!/usr/bin/env node
// tools/engine-tests.mjs — deterministische Engine-Tests (Task 6, AC1–AC4).
// Läuft ohne Browser: node tools/engine-tests.mjs
import { grade, trapQuota } from '../app/engine-quiz.js';
import { newCard, review, splitQueues, planAufhol, DAY_MS, startOfDay } from '../app/engine-leitner.js';
import { generateVariants, validateVariant } from '../app/variants.js';
import { createScenarioRun, recordUserTurn, advancePhase, buildPersonaPrompt, buildAssessmentPayload } from '../app/engine-dialog.js';
import { aggregateCompetencies, radarData, weakestCompetencies, RETENTION } from '../app/competency.js';
import { gradeAssignment, walkRoleSwitch } from '../app/engine-widgets.js';

let pass = 0, fail = 0;
const t = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ ${name} ${detail}`); }
};

// ---------- AC1: deterministische Bewertung aller Fragetypen ----------
console.log('AC1 — Quiz-Bewertung');
const mcq = { id: 'q1', type: 'mc', options: [{ id: 'a', correct: false }, { id: 'b', correct: true }] };
t('MC richtig', grade(mcq, { optionId: 'b' }).verdict === 'correct');
t('MC falsch', grade(mcq, { optionId: 'a' }).verdict === 'wrong');
t('MC unbekannte Option → invalid', grade(mcq, { optionId: 'x' }).verdict === 'invalid');

const multi = { id: 'q2', type: 'multi', options: [
  { id: 'a', correct: true }, { id: 'b', correct: true }, { id: 'c', correct: false }, { id: 'd', correct: false }] };
t('MULTI exakt → correct/1.0', (() => { const r = grade(multi, { optionIds: ['a', 'b'] }); return r.verdict === 'correct' && r.score === 1; })());
t('MULTI 1 Treffer 1 Fehlgriff → partial 0', (() => { const r = grade(multi, { optionIds: ['a', 'c'] }); return r.score === 0 && r.verdict === 'wrong'; })());
t('MULTI 2 Treffer 1 Fehlgriff → partial 0.5', (() => { const r = grade(multi, { optionIds: ['a', 'b', 'c'] }); return r.verdict === 'partial' && r.score === 0.5; })());

const caseq = { id: 'q3', type: 'case', trap: { is_trap: true, note: 'n' },
  critical_error: { option_ids: ['c'], reason: 'verbotene Praxis als zulässig', requires_complete_facts: true },
  options: [{ id: 'a', correct: true }, { id: 'c', correct: false }] };
t('CASE Critical-Error greift', grade(caseq, { optionId: 'c' }).critical_error?.reason.includes('verboten'));
t('CASE richtig ohne Critical', !grade(caseq, { optionId: 'a' }).critical_error);
t('CASE Trap-Kennzeichnung im Feedback', grade(caseq, { optionId: 'a' }).trap?.is_trap === true);
t('FREITEXT → pending_agent', grade({ id: 'q4', type: 'freetext' }, { text: 'x' }).verdict === 'pending_agent');

const quota = trapQuota([caseq, mcq, multi, { trap: { is_trap: false } }, {}, {}, {}, {}]);
t('Fangfragen-Quote ≤15 % erkannt', quota.withinCap === true && quota.traps === 1);

const dnd = { items: [{ id: 'i1', zone: 'z1' }, { id: 'i2', zone: 'z2' }] };
t('DND korrekt', gradeAssignment(dnd, new Map([['i1', 'z1'], ['i2', 'z2']])).verdict === 'correct');
t('DND teilweise', gradeAssignment(dnd, new Map([['i1', 'z1'], ['i2', 'z1']])).verdict === 'partial');

const steps = [
  { id: 's1', q: '', yes: 'RESULT:Anbieter', no: 's2' },
  { id: 's2', q: '', yes: 'RESULT:Anbieter', no: 'RESULT:Betreiber' }];
t('Rollenweiche ja → Anbieter', walkRoleSwitch(steps, new Map([['s1', true]])).result === 'Anbieter');
t('Rollenweiche nein/nein → Betreiber', walkRoleSwitch(steps, new Map([['s1', false], ['s2', false]])).result === 'Betreiber');

// ---------- AC2: Leitner — 7-Tage-Pause → Kern/Aufhol getrennt ----------
console.log('AC2 — Leitner Kern-/Aufholwarteschlange');
const T0 = startOfDay(Date.parse('2026-07-01T12:00:00Z'));
const cards = [];
for (let i = 0; i < 30; i++) cards.push(newCard(`c${i}`, { competency: `K${(i % 5) + 1}` }, T0));
// Tag 1: alle richtig-sicher beantworten → Box 2, fällig T0+1+3
let now = T0 + DAY_MS;
for (const c of cards) review(c, { correct: true, confidence: 'sicher' }, now);
// 10 Karten am Folgetag nochmal (Box 3 → +7 Tage), Rest ruht
now = T0 + 2 * DAY_MS;
for (const c of cards.slice(0, 10)) review(c, { correct: true, confidence: 'sicher' }, now);
// 7 Tage Pause: heute = T0+9
now = T0 + 9 * DAY_MS;
const q = splitQueues(cards, now);
// slice(0,10): due T0+2+7=T0+9 → HEUTE fällig → Kern. Rest: due T0+1+3=T0+4 → 5 Tage überfällig → Aufhol
t('Kern = regulär heute fällige (10)', q.kern.length === 10, `got ${q.kern.length}`);
t('Aufhol = Pausen-Rückstand (20)', q.aufhol.length === 20, `got ${q.aufhol.length}`);
t('Nichts verfällt (30 gesamt)', q.kern.length + q.aufhol.length === 30);
const plan = planAufhol(q.aufholMeta, { perDay: 8 });
t('Aufhol über Tage verteilt (8/Tag → 3 Tage)', plan.plan.length === 3 && plan.today.length === 8);
t('Aufhol-Priorität: überfälligste zuerst', plan.today.every(c => q.aufholMeta.find(m => m.card === c).overdueDays >= 5));

// Retention-Stufen: Same-Day erhöht nie (#33), 1d/7d/21d-Kette
const rc = newCard('r1', {}, T0);
review(rc, { correct: true }, T0 + 1000);
t('Same-Day → bleibt "gelernt"', rc.retention === RETENTION.GELERNT);
review(rc, { correct: true }, T0 + DAY_MS);
t('Folgetag → vorläufig behalten', rc.retention === RETENTION.BESTAETIGT_1D);
review(rc, { correct: true }, T0 + 8 * DAY_MS);
t('+7 Tage → behalten', rc.retention === RETENTION.BEHALTEN_7D);
review(rc, { correct: false }, T0 + 9 * DAY_MS);
t('Fehler → zurück auf gelernt + Box 1', rc.retention === RETENTION.GELERNT && rc.box === 1);

// ---------- AC3: Szenario-Engine gibt dem LLM NUR freigegebene Fakten ----------
console.log('AC3 — Szenario-Engine Informationsfreigabe');
const scenario = {
  id: 'sz1', title: 'Chatbot-Anfrage',
  persona: { archetype: 'Drängler', name: 'M. Leiter', role: 'Leitung Leistungsabteilung', expressions: { neutral: 'n.png' } },
  facts: [
    { id: 'f0', text: 'Die Abteilung will einen Chatbot für Versichertenanfragen.', released_at_phase: 0 },
    { id: 'f1', text: 'GEHEIM-PHASE1: Der Chatbot soll auch Leistungsansprüche vorprüfen.', released_at_phase: 1 },
    { id: 'f2', text: 'GEHEIM-PHASE2: Später sollen Mitarbeiterleistungen ausgewertet werden.', released_at_phase: 2 }
  ],
  phases: [
    { id: 'p0', goal: 'Zweck klären', opening_hint: 'Du willst schnell ein Ergebnis.' },
    { id: 'p1', goal: 'Anspruchsprüfung offenlegen', opening_hint: 'Du rückst mit dem echten Zweck heraus.' },
    { id: 'p2', goal: 'Falle', opening_hint: 'Du schlägst die Mitarbeiter-Auswertung vor.' }
  ],
  goals: [
    { id: 'g1', text: 'Nach Zweckbestimmung fragen', competency: 'K02', matcher: 'zweck' },
    { id: 'g2', text: 'Anhang III Nr. 4 erkennen', competency: 'K03', matcher: 'anhang' }
  ],
  rubric_id: 'rub-sz1'
};
const run = createScenarioRun(scenario, Date.parse('2026-07-24'));
recordUserTurn(scenario, run, 'Was genau ist die Zweckbestimmung?', Date.parse('2026-07-24'));
let prompt = buildPersonaPrompt(scenario, run);
t('Phase 0: Fakt f0 enthalten', prompt.includes('Chatbot für Versichertenanfragen'));
t('Phase 0: f1 NICHT enthalten', !prompt.includes('GEHEIM-PHASE1'));
t('Phase 0: f2 NICHT enthalten', !prompt.includes('GEHEIM-PHASE2'));
t('Rubrik nie im Persona-Prompt', !prompt.includes('rub-sz1'));
t('Prüfziele nie im Persona-Prompt', !prompt.includes('Anhang III Nr. 4 erkennen'));
t('Anti-Fabulier-Regel enthalten', prompt.includes('Erfinde KEINE neuen Tatsachen'));
advancePhase(scenario, run);
prompt = buildPersonaPrompt(scenario, run);
t('Phase 1: f1 jetzt freigegeben', prompt.includes('GEHEIM-PHASE1'));
t('Phase 1: f2 weiter gesperrt', !prompt.includes('GEHEIM-PHASE2'));
t('Ziel-Treffer deterministisch erkannt (g1)', run.goals_hit.includes('g1'));
const payload = buildAssessmentPayload(scenario, run);
t('Bewertungs-Payload: Transcript + Rubrik-ID, keine Fakten', payload.rubric_id === 'rub-sz1' && !JSON.stringify(payload).includes('GEHEIM-PHASE2'));

// ---------- AC4: Varianten-Engine ≥3 valide Varianten aus 1 Faktensatz ----------
console.log('AC4 — Varianten-Engine');
const fact = {
  id: 'fakt-frist-anhang3', kind: 'frist', subject: 'dem Geltungsbeginn für Anhang-III-Hochrisiko',
  statement: 'Geltungsbeginn der Hochrisiko-Pflichten für Anhang-III-Systeme',
  correct: '2. Dezember 2027',
  distractor_pool: ['2. August 2026', '2. August 2027', '2. Februar 2027', '2. August 2028', '2. Dezember 2026'],
  invertible: true,
  negation: 'Die Anhang-III-Pflichten gelten unverändert seit dem 2. August 2026.',
  distractor_truths: [
    'Der Geltungsbeginn wurde durch die VO 2026/1744 verschoben.',
    'Für Anhang-I-Hochrisiko gilt der 2. August 2028.',
    'Behörden-Altsysteme haben eine Übergangsfrist bis 2. August 2030.'
  ],
  competency: 'K07', level: 'A',
  legal_basis: [{ ref: 'Art. 113 idF VO 2026/1744' }], legal_status: 'konsolidiert-2026-07-27'
};
const { variants, stats } = generateVariants(fact, { count: 4 });
t(`≥3 einzigartige Varianten (got ${stats.unique})`, stats.unique >= 3);
t('Rotation UND Inversion vorhanden', stats.rotations >= 1 && stats.inversions >= 1);
let allValid = true;
for (const v of variants) {
  const val = validateVariant(v);
  if (!val.ok) { allValid = false; console.error('   invalid:', v.id, val.errors); }
}
t('Alle Varianten valide (1 richtige, keine Duplikate, nie summativ)', allValid);
t('Deterministisch (gleicher Seed → gleiche IDs)', JSON.stringify(generateVariants(fact, { count: 4 }).variants.map(v => v.id)) === JSON.stringify(variants.map(v => v.id)));
t('Inversion als Fangfrage gekennzeichnet', variants.some(v => v.trap.is_trap && v.options.some(o => o.correct && o.text.includes('unverändert'))));

// ---------- Kompetenz-Aggregation (Unterbau AC1/Radar) ----------
console.log('Kompetenzmodell');
const events = [
  { competency: 'K03', level: 'A', correct: true, confidence: 'sicher' },
  { competency: 'K03', level: 'A', correct: true, confidence: 'sicher' },
  { competency: 'K03', level: 'C', correct: false, confidence: 'sicher' },
  { competency: 'K03', level: 'C', correct: false, confidence: 'unsicher' },
  { competency: 'K01', level: 'A', correct: true, confidence: 'sicher' }
];
const agg = aggregateCompetencies(events);
t('K3-C rot bei K3-A grün erkannt (weakest=C)', agg.get('K03').weakest === 'C');
t('sicher-und-falsch gezählt', agg.get('K03').sureButWrong === 1);
const radar = radarData([{ id: 'K01' }, { id: 'K02' }, { id: 'K03' }], agg, 3);
t('Radar-Achse gebündelt K01–K03', radar[0].label === 'K01–K03' && radar[0].value > 0);
t('Schwächste Kompetenz gerankt', weakestCompetencies(agg, 1)[0]?.id === 'K03');

console.log(`\n${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
