// Minimal reporter: records per-spec duration so slow drift becomes visible.
// The contact-sheet and anomaly reporting is added in a later step.
import { writeFileSync, mkdirSync } from 'node:fs';

export default class Reporter {
  constructor() { this.zeiten = []; }
  onTestEnd(test, result) {
    this.zeiten.push({ titel: test.titlePath().slice(1).join(' › '), datei: test.location.file.split('/').pop(),
                       status: result.status, ms: result.duration });
  }
  onEnd(result) {
    mkdirSync('test-results', { recursive: true });
    const gesamt = this.zeiten.reduce((a, z) => a + z.ms, 0);
    writeFileSync('test-results/timing.json', JSON.stringify({ status: result.status, gesamtMs: gesamt, tests: this.zeiten }, null, 1));
    const langsam = [...this.zeiten].sort((a, b) => b.ms - a.ms).slice(0, 3);
    console.log(`\n  total ${(gesamt / 1000).toFixed(1)} s across ${this.zeiten.length} tests`);
    for (const l of langsam) console.log(`    slowest: ${(l.ms / 1000).toFixed(1)} s  ${l.titel}`);
  }
}
