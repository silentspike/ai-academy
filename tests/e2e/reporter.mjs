// Timing reporter with a budget gate.
//
// Records how long each spec takes and fails the run when a single spec eats an
// unreasonable share of it. The reason is concrete: this suite got slower three
// times during construction — once from a print dialog that blocked for four
// minutes, once from a per-element round trip that made the sweep quadratic. Both
// were only noticed because someone looked at the clock.
import { writeFileSync, mkdirSync } from 'node:fs';

// The share a single spec may take. Deliberately loose, because the gate is
// meant to catch a spec running away — the sweep at ten minutes against four
// minutes of everything else — not a shift from 50 % to 55 %. With sharding a
// run holds only a handful of specs, so a high share is normal and a tight
// threshold would fire on ordinary distribution: it did, at 55.2 % against 55 %.
const ANTEIL_MAX = Number(process.env.E2E_BUDGET_ANTEIL || 0.75);
const MINDESTLAUF_MS = Number(process.env.E2E_BUDGET_AB_MS || 60_000);

export default class Reporter {
  constructor() { this.zeiten = []; }

  onTestEnd(test, result) {
    this.zeiten.push({
      titel: test.titlePath().slice(1).join(' › '),
      datei: test.location.file.split('/').pop(),
      status: result.status,
      ms: result.duration,
    });
  }

  onEnd(result) {
    mkdirSync('test-results', { recursive: true });
    const gesamt = this.zeiten.reduce((a, z) => a + z.ms, 0);

    const jeDatei = new Map();
    for (const z of this.zeiten) jeDatei.set(z.datei, (jeDatei.get(z.datei) ?? 0) + z.ms);
    const dateien = [...jeDatei.entries()]
      .map(([datei, ms]) => ({ datei, ms, anteil: gesamt ? ms / gesamt : 0 }))
      .sort((a, b) => b.ms - a.ms);

    writeFileSync('test-results/timing.json', JSON.stringify({
      status: result.status, gesamtMs: gesamt, dateien, tests: this.zeiten,
    }, null, 1));

    console.log(`\n  total ${(gesamt / 1000).toFixed(1)} s across ${this.zeiten.length} tests`);
    for (const d of dateien.slice(0, 3)) {
      console.log(`    ${(d.ms / 1000).toFixed(1)} s (${Math.round(d.anteil * 100)} %)  ${d.datei}`);
    }

    // Only meaningful once the run has some length AND covers several specs. A
    // shard that happens to hold one file is trivially 100 % of its own time —
    // that says nothing about a spec growing out of proportion, which is the
    // thing being watched.
    if (gesamt < MINDESTLAUF_MS || dateien.length < 3) return;
    const ueber = dateien.filter(d => d.anteil > ANTEIL_MAX);
    if (ueber.length) {
      for (const d of ueber) {
        console.error(`\n  ::error::${d.datei} needs ${Math.round(d.anteil * 100)} % of the run ` +
          `(${(d.ms / 1000).toFixed(1)} s of ${(gesamt / 1000).toFixed(1)} s), budget is ${Math.round(ANTEIL_MAX * 100)} %.`);
      }
      // Playwright has no way for a reporter to fail the run, so this is stated
      // as loudly as a reporter can. The CI step below turns it into an exit code.
      writeFileSync('test-results/budget-verletzt.json', JSON.stringify(ueber, null, 1));
    }
  }
}
