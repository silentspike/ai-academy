#!/usr/bin/env node
// tools/budget-gate.mjs — turns the reporter's budget finding into an exit code.
//
// A reporter cannot fail a Playwright run, so the check lives here: CI calls it
// after the tests. Without it a spec can quietly grow until it dominates the
// run, which is how the sweep got to ten minutes before anyone noticed.
import { readFileSync, existsSync } from 'node:fs';

const verletzt = 'test-results/budget-verletzt.json';
if (!existsSync(verletzt)) {
  if (existsSync('test-results/timing.json')) {
    const t = JSON.parse(readFileSync('test-results/timing.json', 'utf8'));
    const groesste = t.dateien?.[0];
    console.log(`Zeitbudget eingehalten — größter Anteil: ${groesste?.datei} ` +
      `${Math.round((groesste?.anteil ?? 0) * 100)} % von ${(t.gesamtMs / 1000).toFixed(1)} s`);
  } else {
    console.log('Keine Zeitmessung vorhanden — nichts zu prüfen.');
  }
  process.exit(0);
}

const ueber = JSON.parse(readFileSync(verletzt, 'utf8'));
console.error('Zeitbudget überschritten:');
for (const d of ueber) {
  console.error(`  ${d.datei}: ${Math.round(d.anteil * 100)} % (${(d.ms / 1000).toFixed(1)} s)`);
}
process.exit(1);
