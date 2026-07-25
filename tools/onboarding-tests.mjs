#!/usr/bin/env node
// tools/onboarding-tests.mjs — personalisation is accepted only after JSON validation;
// invalid answers trigger a retry carrying a correction hint.
import { validatePersonalization, personalizeWithRetry } from '../app/onboarding.js';

let pass = 0, fail = 0;
const t = (name, cond) => { cond ? pass++ : (fail++, console.error(`  ✗ ${name}`)); };

const VALID = {
  level_endtitel: 'Bank-KI-Dompteur',
  relevanz_overrides: [{ ref: 'Anhang III Nr. 5 lit. b', stufe: 'kern' }],
  beispiel_einkleidungen: [{ intent_id: 'slot-1', text: 'Ein Kredit-Scoring-Modell der Regionalbank …' }],
  szenario_einkleidungen: [{ scenario_id: 'sz-p2-stimmungsradar', org: 'Regionalbank', rolle: 'Leitung Kreditrisiko', domaenenbegriff: 'Bonitätsdaten' }],
};
t('valide Personalisierung akzeptiert', validatePersonalization(VALID).ok === true);
t('kein Objekt → abgelehnt', validatePersonalization('quatsch').ok === false);
t('fehlender Endtitel → abgelehnt', validatePersonalization({ ...VALID, level_endtitel: '' }).ok === false);
t('ungültige Relevanz-Stufe → abgelehnt', validatePersonalization({ ...VALID, relevanz_overrides: [{ ref: 'Art. 6', stufe: 'superwichtig' }] }).ok === false);
t('ungültige ref → abgelehnt', validatePersonalization({ ...VALID, relevanz_overrides: [{ ref: 'Paragraf 12', stufe: 'kern' }] }).ok === false);
t('Oberflächen-Grenze: facts-Feld in Einkleidung → abgelehnt (§5.2)',
  validatePersonalization({ ...VALID, szenario_einkleidungen: [{ scenario_id: 's', org: 'X', rolle: 'Y', facts_override: ['neuer Fakt'] }] }).ok === false);
t('Oberflächen-Grenze: rubric-Feld → abgelehnt',
  validatePersonalization({ ...VALID, szenario_einkleidungen: [{ scenario_id: 's', org: 'X', rolle: 'Y', rubric_bonus: 2 }] }).ok === false);

// Retry mechanics: first answer invalid → retry with a hint → second answer valid
let calls = [];
const flaky = async payload => { calls.push(payload); return calls.length === 1 ? { kaputt: true } : VALID; };
const r1 = await personalizeWithRetry(flaky, { fachprofil: {}, lernprofil: {} });
t('Retry: invalide → 2. Versuch valide (attempts=2)', r1.ok === true && r1.attempts === 2);
t('Retry: Korrekturhinweis im 2. Aufruf enthalten', typeof calls[1].retry_hint === 'string' && calls[1].retry_hint.includes('invalide'));

// Dauerhaft invalide → sauberer Fehlschlag nach retries+1 Versuchen
const broken = async () => ({ nix: 1 });
const r2 = await personalizeWithRetry(broken, {}, { retries: 2 });
t('Dauerhaft invalide → ok:false nach 3 Versuchen mit Fehlerliste', r2.ok === false && r2.attempts === 3 && r2.errors.length > 0);

console.log(`\nonboarding-tests: ${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
