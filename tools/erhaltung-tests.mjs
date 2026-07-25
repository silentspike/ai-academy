#!/usr/bin/env node
// tools/erhaltung-tests.mjs — maintenance mode and user-authored cards in spaced repetition.
import { maintenanceActive, maintenancePlan, markScenarioDone, WEEK_MS } from '../app/erhaltung.js';
import { newCard, review, splitQueues, DAY_MS, MAX_BOX } from '../app/engine-leitner.js';

let pass = 0, fail = 0;
const t = (n, c) => { c ? pass++ : (fail++, console.error(`  ✗ ${n}`)); };
const NOW = Date.parse('2026-07-25T09:00:00Z');
const scenarios = [{ id: 'sz-p2-stimmungsradar' }, { id: 'sz-p3-reha-triage' }];

// ---- AC1: Aktivierung NUR nach bestandenem Examen
t('inaktiv ohne Examens-Antritte', maintenancePlan({ examAttempts: [] }, scenarios, NOW).active === false);
t('inaktiv nach NICHT bestandenem Antritt', maintenancePlan({ examAttempts: [{ passed: false }] }, scenarios, NOW).active === false);
const st = { examAttempts: [{ passed: true }], cards: [] };
for (let i = 0; i < 30; i++) st.cards.push({ ...newCard('k' + i, {}, NOW - 40 * DAY_MS), due: NOW - (i % 3) * DAY_MS, last_reviewed: NOW - (30 - i) * DAY_MS });
const plan = maintenancePlan(st, scenarios, NOW);
t('aktiv nach bestandenem Examen', plan.active === true);
t('Tagesdosis 5-10 Karten', plan.cards.length >= 5 && plan.cards.length <= 10);
t('Wochen-Szenario initial fällig', plan.szenarioDue === true && typeof plan.szenarioId === 'string');
markScenarioDone(st, NOW);
t('nach Szenario: erst in 7 Tagen wieder fällig', maintenancePlan(st, scenarios, NOW + 2 * DAY_MS).szenarioDue === false
  && maintenancePlan(st, scenarios, NOW + WEEK_MS).szenarioDue === true);

// ---- AC2: a user-created card runs the full spaced-repetition cycle
let card = newCard('custom-1', { custom: true, front: 'Meine Frage', back: 'Meine Antwort', competency: 'K06' }, NOW);
t('eigene Karte: startet in Box 1, fällig ab morgen (Same-Day zählt nie)', card.box === 1 && card.due > NOW && card.due <= NOW + DAY_MS);
card = review(card, { correct: true, confidence: 'sicher' }, NOW);
t('richtig → Box 2, fällig in ~3 Tagen', card.box === 2 && card.due > NOW + 2 * DAY_MS);
card = review(card, { correct: true, confidence: 'sicher' }, NOW + 3 * DAY_MS);
card = review(card, { correct: true, confidence: 'sicher' }, NOW + 10 * DAY_MS);
t('zwei weitere Treffer → Box 4', card.box === 4);
card = review(card, { correct: false, confidence: 'sicher' }, NOW + 24 * DAY_MS);
t('Fehler wirft zurück (sicher-und-falsch bleibt erfasst)', card.box < 4 && card.retention === 'gelernt');
const q = splitQueues([{ ...card, due: NOW - DAY_MS }], NOW);
t('eigene Karte landet in den regulären Warteschlangen', (q.kern.length + q.aufhol.length) === 1);
for (let i = 0; i < 8; i++) card = review(card, { correct: true, confidence: 'sicher' }, NOW + (30 + i * 31) * DAY_MS);
t('Langzeit: erreicht MAX_BOX + „gefestigt"', card.box === MAX_BOX && card.retention === 'gefestigt');

console.log(`\nerhaltung-tests: ${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
