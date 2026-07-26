import { test, expect, schliesseOverlays, warteAufAnsicht } from '../harness.mjs';

// Forms, measured rather than eyeballed.
//
// Every form in the product was built as `<label>Text<br><input></label>`. A
// label is an inline element, so the text and the control flowed side by side —
// sixteen places, from the first launch onwards, and none of them noticed:
// screenshots were reviewed as 620-pixel contact sheets, where a caption next to
// its field looks like a caption above its field.
//
// The rule this checks is the one that was broken: the caption sits ABOVE its
// control, over the full width of the field. Anything else is a collapsed form.

/** Every labelled field in the current view, with its caption and control box. */
const MESSEN = () => {
  const raus = [];
  for (const feld of document.querySelectorAll('#view .feld')) {
    const name = feld.querySelector('.feld-name');
    const ctrl = feld.querySelector('input, select, textarea');
    if (!name || !ctrl) continue;
    const n = name.getBoundingClientRect();
    const c = ctrl.getBoundingClientRect();
    raus.push({
      text: (name.innerText || '').trim().slice(0, 40),
      nameUnten: Math.round(n.bottom), ctrlOben: Math.round(c.top),
      nameBreite: Math.round(n.width), feldBreite: Math.round(feld.getBoundingClientRect().width),
      ctrlBreite: Math.round(c.width),
    });
  }
  return raus;
};

/**
 * A caption is above its control when its lower edge is not below the control's
 * upper edge. Two pixels of slack for sub-pixel rounding — with the old markup
 * the two boxes overlapped by their full height, so the margin is irrelevant to
 * the defect this catches.
 */
function pruefe(felder, wo) {
  expect(felder.length, `${wo}: no labelled field found — the check would pass on an empty page`)
    .toBeGreaterThan(0);
  const daneben = felder.filter(f => f.nameUnten > f.ctrlOben + 2);
  expect(daneben, `${wo}: caption beside its field instead of above it:\n  ${daneben.map(f => f.text).join('\n  ')}`)
    .toEqual([]);
  // The control uses the width of its field. Beside the caption it kept whatever
  // was left over — which is how the collapse showed up in the first place.
  const schmal = felder.filter(f => f.ctrlBreite < f.feldBreite * 0.9);
  expect(schmal, `${wo}: control narrower than its field:\n  ${schmal.map(f => `${f.text} ${f.ctrlBreite}/${f.feldBreite}`).join('\n  ')}`)
    .toEqual([]);
}

test.describe('forms', () => {
  test('the settings form puts every caption above its field', async ({ page, zustand }) => {
    await zustand('mittenInPhase3');
    await page.goto('/#/einstellungen', { waitUntil: 'load' });
    await schliesseOverlays(page);
    await warteAufAnsicht(page);
    pruefe(await page.evaluate(MESSEN), '#/einstellungen');
  });

  test('the onboarding forms put every caption above its field', async ({ page, zustand }) => {
    await zustand('leer');
    await page.goto('/#/onboarding', { waitUntil: 'load' });
    await schliesseOverlays(page);
    await warteAufAnsicht(page);

    // Step 1 asks the bridge which model answers before it offers anything to
    // click; the fields live in steps 2 and 3.
    for (const schritt of ['Fachprofil', 'Lernprofil']) {
      const weiter = page.locator('#view button:has-text("Weiter"):not([disabled])').first();
      await weiter.waitFor({ state: 'visible', timeout: 10_000 });
      await weiter.click();
      await page.waitForFunction(
        (s) => (document.getElementById('view')?.innerText ?? '').includes(s),
        schritt, { timeout: 10_000 });
      pruefe(await page.evaluate(MESSEN), `#/onboarding — ${schritt}`);
    }
  });

  test('the self-justification field inside a question follows the same rule', async ({ page, zustand }) => {
    // The third place with a labelled field, and the easiest to miss: it only
    // appears after a case or a level-C question has been answered. Taken from a
    // unit whose first check is exactly that, not from the drill — a random draw
    // that skips itself is not evidence.
    await zustand('mittenInPhase3');
    await page.goto('/#/einheit/p2-e03-graubereiche', { waitUntil: 'load' });
    await schliesseOverlays(page);
    await warteAufAnsicht(page);

    // The unit's first check is a level-A question and gets no justification
    // step; the level-C case is the second one, addressed by its id.
    const frage = page.locator('#view .q[data-qid="p2-e03-c1"]');
    const opt = frage.locator('.q-opt:not([disabled])').first();
    await opt.waitFor({ state: 'visible', timeout: 10_000 });
    await opt.click();
    await frage.locator('.q-selfexplain .feld').first()
      .waitFor({ state: 'visible', timeout: 10_000 });
    pruefe(await page.evaluate(MESSEN), '#/einheit/p2-e03-graubereiche — Selbstbegründung');
  });

  // Negative control. The rule above is worth exactly as much as its ability to
  // fail: the original markup is put back and has to be caught.
  test('the check catches the markup it was written for', async ({ page, zustand }) => {
    await zustand('mittenInPhase3');
    await page.goto('/#/einstellungen', { waitUntil: 'load' });
    await schliesseOverlays(page);
    await warteAufAnsicht(page);

    // `display:inline` on caption and control is what a bare <label>Text<input>
    // amounts to — the two end up on one line.
    await page.addStyleTag({ content: `
      #view .feld { display:inline !important; }
      #view .feld .feld-name { display:inline !important; }
      #view .feld input, #view .feld select { display:inline !important; width:auto !important; }
    ` });
    await page.waitForTimeout(150);

    const felder = await page.evaluate(MESSEN);
    const daneben = felder.filter(f => f.nameUnten > f.ctrlOben + 2);
    expect(daneben.length, 'the collapsed form is not detected — the check proves nothing')
      .toBeGreaterThan(0);
  });
});
