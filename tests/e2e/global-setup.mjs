// Runs once before the suite.
//
// The substitute CLI itself lives in tests/e2e/stub-cli/ as a versioned file and
// is put on the bridge's PATH by playwright.config.mjs. All that is left here is
// the store directory for the run.

import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(new URL('../..', import.meta.url).pathname);

export default async function globalSetup() {
  // Deliberately created, not wiped: locally the web server may be reused across
  // runs, and pulling the directory out from under a live process produced a very
  // confusing 500. Each test sets its own state anyway, so a leftover store from
  // the previous run carries no meaning.
  for (const unter of ['', 'store', 'log', 'profiles']) {
    mkdirSync(join(ROOT, '.tmp-e2e-store', unter), { recursive: true });
  }

  // Direct calls from specs (not through the bridge) should find it too.
  process.env.PATH = `${join(ROOT, 'tests', 'e2e', 'stub-cli')}:${process.env.PATH}`;
}
