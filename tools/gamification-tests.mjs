#!/usr/bin/env node
// tools/gamification-tests.mjs — tests for points, levels, session and pacing logic.
import { applyEvent, levelFor, dayCounts, newBadges, badgeSicht, weekProgress, wochenpunkte, wochenzieleErreicht, lerntage, XP_RULES } from '../app/gamification.js';
import { feasibilityCheck, targetCurve, driftCheck, DAY_MS } from '../app/pacing.js';
import { createSession, canStartUnit, completeStep, blockCheck, marathonWarning, rotationHint } from '../app/session.js';
import { newCard, review } from '../app/engine-leitner.js';

let pass = 0, fail = 0;
const t = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ ${name} ${detail}`); }
};

// ---------- AC1: activity points and mastery stay strictly separate ----------
console.log('AC1 — XP/Mastery-Trennung');
const st = { xp: 0 };
const wrong = applyEvent(st, { kind: 'check_answered', level: 'B', correct: false, competency: 'K03' });
t('Falsche Antwort: XP JA (straffreier Lernraum)', wrong.xpGain === XP_RULES.check_answered.B && st.xp === 14);
t('Falsche Antwort: Mastery NEIN', wrong.masteryGain === null && !(st.mastery_events?.length));
const sameDay = applyEvent(st, { kind: 'check_answered', level: 'C', correct: true, competency: 'K03', delayedDays: 0 });
t('Richtig same-day: Mastery mit halbem Gewicht', sameDay.masteryGain.weight === 0.5 && sameDay.masteryGain.delayed === false);
const delayed = applyEvent(st, { kind: 'check_answered', level: 'C', correct: true, competency: 'K03', delayedDays: 3 });
t('Richtig verzögert: volles Gewicht', delayed.masteryGain.weight === 1 && delayed.masteryGain.delayed === true);
t('XP-Strom unabhängig kumuliert (14+20+20)', st.xp === 54);
t('Mastery-Strom getrennt gespeichert (2 Events)', st.mastery_events.length === 2);
t('C gibt mehr XP als A', XP_RULES.check_answered.C > XP_RULES.check_answered.A);
t('Level-Leiter: 1400 XP → Level 4 Anhang-III-Flüsterer', levelFor(1400).title === 'Anhang-III-Flüsterer');
t('Endtitel profilabhängig', levelFor(20000, 'KI-Spezialist ÖSVA').title === 'KI-Spezialist ÖSVA');

// Weekly-goal counting rules: token days do not count
t('Tag zählt: Review + 10 Fragen', dayCounts({ reviewDone: true, questions: 10 }) === true);
t('Tag zählt: Review + 1 Einheit', dayCounts({ reviewDone: true, units: 1 }) === true);
t('Tag zählt NICHT: nur eingeloggt', dayCounts({ reviewDone: false, questions: 30 }) === false);
t('Tag zählt NICHT: Review ohne Substanz', dayCounts({ reviewDone: true, questions: 4 }) === false);

// Badges
const bst = { stats: { units: 1, questions: 120 }, badges: [] };
const fresh = newBadges(bst);
t('Badges vergeben (Aktenkundig + Dreistellig)', fresh.length === 2 && bst.badges.includes('hundert'));
t('Badges idempotent', newBadges(bst).length === 0);

// ---------- AC2: Machbarkeits-Check ----------
console.log('AC2 — Machbarkeits-Check');
const NOW = Date.parse('2026-07-24T08:00:00Z');
const stoff = { totalUnits: 120, minutesPerUnit: 25, doneUnits: 0 };
// Machbar: 60 min/Tag, 6 Tage/Woche, Ziel in 39 Tagen, 80 Einheiten (Phase 1-5)
const okProfile = { minutesPerDay: 60, daysPerWeek: 6, milestones: [{ id: 'm1', label: '1.9. Kern', date: '2026-09-01', scope_units: 80 }] };
const okRes = feasibilityCheck(okProfile, stoff, NOW)[0];
t(`Machbares Ziel erkannt (braucht ${okRes.neededMinutesPerDay} min/Tag)`, okRes.feasible === true);
// Unmachbar: 15 min/Tag, 3 Tage/Woche, alles bis 1.9.
const badProfile = { minutesPerDay: 15, daysPerWeek: 3, milestones: [{ id: 'm1', label: '1.9. alles', date: '2026-09-01', scope_units: 120 }] };
const badRes = feasibilityCheck(badProfile, stoff, NOW)[0];
t('Unerreichbares Ziel → Warnung', badRes.feasible === false);
t('Warnung nennt konkrete Zahl (min/Tag)', /~\d+ min\/Tag/.test(badRes.message), badRes.message);
t('Zahl plausibel (>100 min/Tag nötig)', badRes.neededMinutesPerDay > 100, String(badRes.neededMinutesPerDay));
// Soll-Kurve monoton 0→1
const curve = targetCurve(okProfile, stoff, NOW);
t('Soll-Kurve startet 0, endet 1', curve[0].target === 0 && Math.abs(curve[curve.length - 1].target - 1) < 1e-9);
t('Soll-Kurve monoton', curve.every((p, i) => i === 0 || p.target >= curve[i - 1].target));
// Drift
const drift = driftCheck(okProfile, stoff, 0.05, NOW - 20 * DAY_MS, NOW);
t('Drift erkannt → 3 Entscheidungsoptionen (Tempo/Woche/Termin)', drift.onTrack === false && drift.options.length === 3);
t('Kein Fehlalarm bei Kurs', driftCheck(okProfile, stoff, 0.6, NOW - 20 * DAY_MS, NOW).onTrack === true);

// ---------- Session-Ritual + Intensiv ----------
console.log('Session-Ritual & Intensiv-Blöcke');
const cards = [];
const T0 = Date.parse('2026-07-20T00:00:00Z');
for (let i = 0; i < 6; i++) { const c = newCard(`c${i}`, {}, T0); review(c, { correct: true }, T0 + DAY_MS); cards.push(c); }
const sess = createSession({ cards }, T0 + 9 * DAY_MS);
t('Ritual startet mit Pflicht-Review', sess.step === 'review');
t('Einheiten gesperrt vor Review', canStartUnit(sess) === false);
completeStep(sess, 'review');
t('Nach Review: Einheiten frei', canStartUnit(sess) === true && sess.step === 'units');
completeStep(sess, 'units'); completeStep(sess, 'units');
t('Nach 2 Einheiten → Drill', sess.step === 'drill');
t('Drill schwächen-gewichtet 3+1+1', sess.drill.mix.weak === 3 && sess.drill.mix.random === 1 && sess.drill.mix.cBonus === 1);
completeStep(sess, 'drill');
t('Nach Drill → Abschluss-Karte', sess.step === 'wrapup');
const bc = blockCheck(sess, sess.started + 61 * 60_000);
t('Intensiv: Mini-Block nach 60 min', bc.due === true && bc.miniQuiz === 5);
t('Intensiv: kein Block direkt danach', blockCheck(sess, sess.started + 62 * 60_000).due === false);
t('Marathon-Warnung nach 4h', marathonWarning(sess, sess.started + 4.5 * 3_600_000).warn === true);
rotationHint(sess, 'mc', 1); rotationHint(sess, 'mc', 2);
t('Rotations-Banner nach 3. gleichem Format', rotationHint(sess, 'mc', 3).hint === true);
t('Rotations-Banner nur Vorschlag, reset bei Wechsel', rotationHint(sess, 'dnd', 4).hint === false);

// ---------- weekly goal: derived from dayStats, not from a second list ----------
// This whole block is new because the mechanism was dead: weekProgress read
// state.week.doneDays, which nothing in the application ever wrote. The top bar
// showed "0/5 days" forever and no test noticed, because none existed.
console.log('\nWochenziel — aus dayStats abgeleitet');
const tagKey = (verschiebung) => {
  const d = new Date(); d.setDate(d.getDate() + verschiebung);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const zaehlt = { reviewDone: true, questions: 12, units: 1, xp: 50 };
const zaehltNicht = { reviewDone: true, questions: 3, units: 0, xp: 10 };   // Alibi-Tag
const heuteDow = (new Date().getDay() + 6) % 7;                              // 0 = Montag
const inDieserWoche = (n) => Array.from({ length: n }, (_, i) => -Math.min(heuteDow, i));
const wochenStand = { week: { goalDays: 5 }, dayStats: {} };
for (const v of new Set(inDieserWoche(Math.min(3, heuteDow + 1)))) wochenStand.dayStats[tagKey(v)] = zaehlt;
const gezaehlt = Math.min(3, heuteDow + 1);
const wp = weekProgress(wochenStand, Date.now());
t(`Wochenziel zaehlt ${gezaehlt} Tage dieser Woche`, wp.done === gezaehlt, `→ ${wp.done}`);
t('Ziel aus dem Profil, nicht hartkodiert', wp.goal === 5);
wochenStand.dayStats[tagKey(-heuteDow - 3)] = zaehlt;                        // Vorwoche
t('Vorwoche zaehlt nicht in diese Woche', weekProgress(wochenStand, Date.now()).done === gezaehlt);
wochenStand.dayStats[tagKey(0)] = zaehltNicht;
t('Alibi-Tag zaehlt nicht', weekProgress(wochenStand, Date.now()).done <= gezaehlt);
t('Ohne dayStats: 0 von 5, kein Absturz', weekProgress({ week: {} }, Date.now()).done === 0);
const punkte = wochenpunkte(wochenStand, Date.now());
t('Sieben Wochenpunkte, Montag zuerst', punkte.length === 7 && punkte[0].kurz === 'Mo');
t('Kuenftige Tage sind als solche markiert',
  punkte.filter(p => p.zukunft).length === 6 - heuteDow, `→ ${punkte.filter(p => p.zukunft).length}`);

// ---------- badges: derived instead of counted ----------
console.log('\nBadges — abgeleitete Sicht');
const badgeStand = {
  unit_done: ['p1-e01'], badges: [], week: { goalDays: 1 }, dayStats: {},
  cards: Array.from({ length: 50 }, (_, i) => ({ id: 'c' + i, retention: i < 30 ? 'behalten' : 'gefestigt' })),
  events: [{ kind: 'boss_completed', passed: true, ts: Date.now() }],
};
for (let i = 0; i < 2; i++) badgeStand.dayStats[tagKey(-i)] = zaehlt;
const sicht = badgeSicht(badgeStand, Date.now());
t('units aus unit_done abgeleitet', sicht.stats.units === 1);
t('retained7 zaehlt behalten UND gefestigt', sicht.stats.retained7 === 50);
t('bossPassed aus den Ereignissen', sicht.stats.bossPassed === 1);
t('weeksMet aus den Lerntagen', sicht.stats.weeksMet >= 1, `→ ${sicht.stats.weeksMet}`);
const frisch = newBadges(badgeStand, Date.now()).map(b => b.id);
t('Badges werden dadurch ueberhaupt erreichbar', frisch.includes('erste-schritte') && frisch.includes('retention7'),
  `→ ${frisch.join(',')}`);
t('Zweiter Aufruf vergibt nichts doppelt', newBadges(badgeStand, Date.now()).length === 0);
t('Leerer Zustand vergibt kein Badge', newBadges({ badges: [] }, Date.now()).length === 0);
t('lerntage liefert sortierte Tagesschluessel',
  JSON.stringify(lerntage(badgeStand)) === JSON.stringify([...lerntage(badgeStand)].sort()));
t('wochenzieleErreicht bei Ziel 1 und 2 Tagen', wochenzieleErreicht(badgeStand, Date.now()) >= 1);

console.log(`\n${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
