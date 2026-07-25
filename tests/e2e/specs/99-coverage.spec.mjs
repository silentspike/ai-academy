import { test, expect } from '../harness.mjs';
import { auswertung } from '../coverage.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';

// The evaluation, deliberately last in alphabetical order so the recording specs
// have run. It is the point of the whole approach: not "did the cases pass" but
// "was everything on screen actually operated". The July acceptance run missed
// eleven gaps because the checklist did not mention them; a checklist can only
// ever verify what someone thought to write down.

test.describe('coverage', () => {
  test('every recorded control was operated, and none was unreachable', async () => {
    const a = auswertung();

    // The recording specs must have run — an empty file would make this test pass
    // while proving nothing at all.
    expect(a.routen, 'no coverage was recorded; the recording specs did not run')
      .toBeGreaterThan(4);
    expect(a.gefunden, 'no operable elements were found at all').toBeGreaterThan(20);

    mkdirSync('test-results', { recursive: true });
    writeFileSync('test-results/coverage-report.md', bericht(a));

    // An element that cannot be clicked because something covers it is the defect
    // class this suite exists for. It is never acceptable.
    expect(a.unerreichbar, `unreachable controls:\n  ${a.unerreichbar.join('\n  ')}`).toEqual([]);

    // Three categories, kept apart on purpose:
    //   operated        — clicked for real
    //   checked only    — reachable, but not clickable in a run (the other three
    //                     options of a question, once one has been chosen)
    //   neither         — a genuine gap in the simulation
    const abgedeckt = a.betaetigt + a.nurGeprueft.length;
    const quote = a.gefunden ? abgedeckt / a.gefunden : 0;
    // A handful of controls cannot be measured passively — the layout is being
    // rebuilt, or the element sits inside a construct the stack check cannot
    // resolve without the settling time a real click gets. The sweep operates
    // each of them for real, which is the statement that counts.
    const messbar = a.gefunden - (a.offen.length ? 0 : 0);
    console.log(`Coverage: ${a.betaetigt} operated + ${a.nurGeprueft.length} checked ` +
      `= ${abgedeckt}/${a.gefunden} controls across ${a.routen} routes (${Math.round(quote * 100)} %)`);
    if (a.offen.length) console.log('Neither operated nor checked:\n  ' + a.offen.join('\n  '));

    // Every control has to be reached one way or the other. Anything left over is
    // something on screen this suite never touched — the gap the July acceptance
    // run had eleven of.
    expect(a.offen, `controls neither operated nor checked:\n  ${a.offen.join('\n  ')}`).toEqual([]);
    expect(messbar).toBeGreaterThan(0);
    expect(quote, `only ${Math.round(quote * 100)} % of controls were operated or checked`)
      .toBeGreaterThan(0.95);
  });
});

function bericht(a) {
  const zeilen = [
    '# Click coverage',
    '',
    `- routes recorded: **${a.routen}**`,
    `- operable elements found: **${a.gefunden}**`,
    `- operated: **${a.betaetigt}** (${a.gefunden ? Math.round(a.betaetigt / a.gefunden * 100) : 0} %)`,
    `- reachability checked only: **${a.nurGeprueft.length}**`,
    `- unreachable: **${a.unerreichbar.length}**`,
    '',
  ];
  if (a.unerreichbar.length) {
    zeilen.push('## Unreachable', '', ...a.unerreichbar.map(u => `- ${u}`), '');
  }
  if (a.offen.length) {
    zeilen.push('## Neither operated nor checked', '',
      'Each line is a control a user can see and this suite never touched.', '',
      ...a.offen.map(o => `- ${o}`), '');
  }
  if (a.nurGeprueft.length) {
    zeilen.push('## Checked for reachability, not clicked', '',
      'Mutually exclusive controls — choosing one answer disables the others.', '',
      ...a.nurGeprueft.slice(0, 40).map(o => `- ${o}`),
      a.nurGeprueft.length > 40 ? `- … and ${a.nurGeprueft.length - 40} more` : '', '');
  }
  return zeilen.join('\n');
}
