#!/usr/bin/env node
// tools/exam-tests.mjs — Unit-Tests Prüfungssystem (app/exam-core.js), DOM-frei.
import {
  buildChapterTest, buildExamA, gradeAnswer, evaluateTest, examGate,
  regimeKey, recordScore, nachschulungPlan, placementBuild, placementRecommend,
  buildChallengeTest, PASS_SCORE, hashSeed,
} from '../app/exam-core.js';
import { RETENTION } from '../app/competency.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const ROOT = new URL('..', import.meta.url).pathname;

const pool = JSON.parse(readFileSync(join(ROOT, 'content/questions-core.json'), 'utf-8')).questions;
const kompetenzen = JSON.parse(readFileSync(join(ROOT, 'content/competencies.json'), 'utf-8')).kompetenzen;

let pass = 0, fail = 0;
const t = (name, cond) => { cond ? pass++ : (fail++, console.error(`  ✗ ${name}`)); };

// ---- Kapiteltest-Bau
const ct = buildChapterTest('p2', pool, { salt: 'test1' });
t('Kapiteltest: Teil 1 hat 8 Fragen', ct.part1.length === 8);
t('Kapiteltest: Teil 2 hat 2 Fragen', ct.part2.length === 2);
t('Kapiteltest: alle Fragen approved + aus P2', [...ct.part1, ...ct.part2].every(q => q.status === 'approved_summative' && q.id.startsWith('p2-')));
t('Kapiteltest: Teil 2 nur Freitext/Fall (Quellenarbeit)', ct.part2.every(q => ['freetext', 'case'].includes(q.type)));
t('Kapiteltest: keine Frage doppelt', new Set([...ct.part1, ...ct.part2].map(q => q.id)).size === 10);
const ct2 = buildChapterTest('p2', pool, { salt: 'test1' });
t('Kapiteltest: deterministisch bei gleichem Salt', JSON.stringify(ct2.part1.map(q => q.id)) === JSON.stringify(ct.part1.map(q => q.id)));
const ct3 = buildChapterTest('p2', pool, { salt: 'retake2' });
t('Kapiteltest: anderer Salt → andere Auswahl', JSON.stringify(ct3.part1.map(q => q.id)) !== JSON.stringify(ct.part1.map(q => q.id)));
const ct4 = buildChapterTest('p2', pool, { salt: 'retake2', excludeIds: new Set(ct.part1.map(q => q.id)) });
t('Kapiteltest: excludeIds respektiert (Retake ohne verbrauchte Fragen)', ct4.part1.every(q => !ct.part1.some(x => x.id === q.id)));

// ---- Examen Teil A
const ex = buildExamA(pool, { salt: 'e1' });
t('Examen A: 40 Fragen', ex.questions.length === 40);
t('Examen A: Closed Book + 60 min', ex.mode === 'closed_book' && ex.minutes === 60);
t('Examen A: keine Duplikate', new Set(ex.questions.map(q => q.id)).size === 40);
t('Examen A: enthält Freitext', ex.questions.some(q => q.type === 'freetext'));
t('Examen A: alle approved', ex.questions.every(q => q.status === 'approved_summative'));

// ---- Deterministische Bewertung
const mcq = pool.find(q => ['mc', 'case'].includes(q.type) && q.critical_error);
const correctId = mcq.options.find(o => o.correct).id;
const criticalId = mcq.critical_error.option_ids[0];
t('gradeAnswer: richtig = 1', gradeAnswer(mcq, correctId).score === 1);
t('gradeAnswer: Critical-Option → critical', gradeAnswer(mcq, criticalId).critical === true);
const wrongNonCrit = mcq.options.find(o => !o.correct && !mcq.critical_error.option_ids.includes(o.id));
t('gradeAnswer: falsch-aber-nicht-fatal → kein critical', wrongNonCrit ? gradeAnswer(mcq, wrongNonCrit.id).critical === false : true);
t('gradeAnswer: freetext → null (LLM extern)', gradeAnswer({ type: 'freetext' }, 'x') === null);

// ---- evaluateTest: Critical erzwingt Fail trotz Punktzahl (AC3-Kern)
const fakeQs = [
  { id: 'a', competency: 'K04', type: 'mc' }, { id: 'b', competency: 'K03', type: 'mc' },
  { id: 'c', competency: 'K06', type: 'mc' }, { id: 'd', competency: 'K08', type: 'mc' },
];
const allGood = fakeQs.map(() => ({ score: 1, max: 1 }));
t('evaluateTest: 100 % ohne Critical = bestanden', evaluateTest({ questions: fakeQs, results: allGood, kompetenzen }).passed === true);
const withCrit = [{ score: 1, max: 1, critical: true }, ...allGood.slice(1)];
const evC = evaluateTest({ questions: fakeQs, results: withCrit, kompetenzen });
t('evaluateTest: Critical → nicht bestanden TROTZ 100 %', evC.passed === false && evC.reason === 'critical_error');

// ---- Kern-Mindestleistung
const kernFailQs = [
  { id: 'a', competency: 'K06' }, { id: 'b', competency: 'K06' }, { id: 'c', competency: 'K06' },
  ...Array.from({ length: 12 }, (_, i) => ({ id: 'x' + i, competency: 'K16' })),
];
const kernFailRes = [{ score: 0, max: 1 }, { score: 0, max: 1 }, { score: 1, max: 1 },
  ...Array.from({ length: 12 }, () => ({ score: 1, max: 1 }))];
const evK = evaluateTest({ questions: kernFailQs, results: kernFailRes, kompetenzen });
t('evaluateTest: Kern-Kompetenz < 50 % → Fail trotz 87 % Gesamt', evK.passed === false && evK.reason === 'kern_mindestleistung' && evK.kernFails.includes('K06'));

// ---- Examens-Gate (AC2-Kern)
const now = Date.parse('2026-07-25T10:00:00Z');
const kernIds = kompetenzen.filter(k => k.kern).map(k => k.id);
const goodCards = kernIds.map(k => ({ meta: { competency: k }, retention: RETENTION.BEHALTEN_7D }));
const passedTests = Object.fromEntries(Array.from({ length: 9 }, (_, i) => ['p' + (i + 1), { passed: true }]));
const g1 = examGate({ chapterTests: {} }, { kompetenzen, cards: goodCards, nowMs: now });
t('Gate: ohne Kapiteltests gesperrt (9 Gründe)', !g1.allowed && g1.reasons.length === 9);
const g2 = examGate({ chapterTests: passedTests }, { kompetenzen, cards: [], nowMs: now });
t('Gate: ohne Retention „behalten" gesperrt', !g2.allowed && g2.reasons.length === kernIds.length);
const g3 = examGate({ chapterTests: passedTests }, { kompetenzen, cards: goodCards, nowMs: now });
t('Gate: alles erfüllt → offen', g3.allowed === true);
const g4 = examGate({ chapterTests: passedTests, examAttempts: [{ day: '2026-07-25' }] }, { kompetenzen, cards: goodCards, nowMs: now });
t('Gate: 2. Antritt am selben Tag gesperrt', g4.allowed === false && g4.reasons[0].includes('1/Kalendertag'));
const gelernt = kernIds.map(k => ({ meta: { competency: k }, retention: RETENTION.GELERNT }));
t('Gate: Same-Day-„gelernt" reicht NICHT (Intensivtag-Regel)', examGate({ chapterTests: passedTests }, { kompetenzen, cards: gelernt, nowMs: now }).allowed === false);

// ---- Score-Serien
const series = {};
const k1 = regimeKey({ rechtsstand: '2026-07-27', contentVersion: 'c1', promptsVersion: '1.1.2', model: 'opus' });
const k2 = regimeKey({ rechtsstand: '2026-07-27', contentVersion: 'c1', promptsVersion: '1.2.0', model: 'opus' });
recordScore(series, k1, { pct: 0.85, ts: 1 });
recordScore(series, k1, { pct: 0.75, ts: 2 });
recordScore(series, k1, { pct: 0.9, ts: 3 });
recordScore(series, k2, { pct: 0.6, ts: 4 });
t('Serien: first/latest/best korrekt', series[k1].first.pct === 0.85 && series[k1].latest.pct === 0.9 && series[k1].best.pct === 0.9);
t('Serien: Promptwechsel = getrennte Serie, kein best-Mix', series[k2].best.pct === 0.6 && Object.keys(series).length === 2);

// ---- Nachschulung
const szenarien = JSON.parse(readFileSync(join(ROOT, 'content/scenarios.json'), 'utf-8')).scenarios;
const np = nachschulungPlan({ perCompetency: { K06: 0.3, K16: 0.9 }, kernFails: ['K06'] },
  { pool, units: [{ id: 'p2-e02', competencies: ['K06'] }], scenarios: szenarien });
t('Nachschulung: nur schwache Kompetenz, mit Einheiten + Fragen + 100 %-Pflicht',
  np.length === 1 && np[0].competency === 'K06' && np[0].units.includes('p2-e02') && np[0].questions.length === 6 && np[0].passRequired === 1);
t('Nachschulung: enthält 1 Kurzszenario (#16)', typeof np[0].szenario === 'string' && np[0].szenario.startsWith('sz-'));

// ---- Placement
const pl = placementBuild(pool, { salt: 'p1' });
t('Placement: 20 Fragen quer über Phasen', pl.length === 20 && new Set(pl.map(q => q.id.split('-')[0])).size >= 8);
const plRes = pl.map(q => ({ correct: q.id.startsWith('p2-') }));    // nur P2 gekonnt
const rec = placementRecommend(pl, plRes);
t('Placement: NUR Empfehlungen (challenge_moeglich für starke Phase)', rec.p2?.empfehlung === 'challenge_moeglich' && rec.p1?.empfehlung !== 'challenge_moeglich');
const chall = buildChallengeTest({ id: 'p2-e01', competencies: ['K04'] }, pool, {});
t('Challenge: 6 Fragen der Einheiten-Kompetenz, 80 %-Hürde', chall.questions.length === 6 && chall.questions.every(q => q.competency === 'K04') && chall.passRequired === 0.8);

// ---- Seed-Stabilität
const r1 = hashSeed('x'); const r2 = hashSeed('x');
t('hashSeed deterministisch', r1() === r2());

console.log(`\nexam-tests: ${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
