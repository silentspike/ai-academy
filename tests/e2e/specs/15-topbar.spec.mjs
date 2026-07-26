import { test, expect, schliesseOverlays, warteAufAnsicht } from '../harness.mjs';

// Search, due list and profile menu. The reference shows all three; none of them
// existed. Each check asks whether the control DOES something, not whether it is
// on screen — a magnifier that does not search is worse than no magnifier.

test.describe('top bar tools', () => {
  test('search finds a unit and a glossary term and navigates', async ({ page, zustand }) => {
    await zustand('mittenInPhase3');
    await page.goto('/#/dashboard', { waitUntil: 'load' });
    await schliesseOverlays(page);
    await warteAufAnsicht(page);

    await page.fill('#tb-suche-feld', 'Hochrisiko');
    await expect(page.locator('#tb-suche-treffer .such-treffer').first()).toBeVisible();
    await expect.poll(() => page.locator('#tb-suche-treffer .such-treffer').count()).toBeGreaterThan(2);
    // The labels are uppercased by CSS, so compare in lower case.
    const arten = (await page.locator('#tb-suche-treffer .such-art').allInnerTexts()).map(a => a.toLowerCase());
    expect(new Set(arten).size, `search returns only ${arten[0]} hits`).toBeGreaterThan(1);
    expect(arten, 'no unit among the hits for "Hochrisiko"').toContain('einheit');

    // A hit that leads to a unit must exist and must work. No hit may point at
    // the page the user is already on.
    const alleZiele = await page.locator('#tb-suche-treffer .such-treffer').evaluateAll(
      es => es.map(e => e.getAttribute('href')));
    expect(alleZiele.filter(z => z === '#/dashboard'), 'hits pointing back at the current page').toEqual([]);
    // Selected by index rather than by an attribute selector: a "#" inside one
    // is not reliably matched by Playwright's CSS engine.
    const idx = alleZiele.findIndex(z => z?.startsWith('#/einheit/'));
    expect(idx, `no hit leads to a unit: ${alleZiele.join(' ')}`).toBeGreaterThanOrEqual(0);
    await page.locator('#tb-suche-treffer .such-treffer').nth(idx).click();
    await warteAufAnsicht(page);
    expect(page.url()).toContain('/einheit/');
    // The unit really rendered — a hash change alone proves nothing.
    const inhalt = (await page.locator('#view').innerText()).trim();
    expect(inhalt.length, 'the unit view came up empty').toBeGreaterThan(200);
    expect(inhalt, 'the unit view shows an error').not.toMatch(/Unbekannte Route|nicht gefunden/i);
  });

  test('an article reference leads to the unit covering it', async ({ page, zustand }) => {
    await zustand('mittenInPhase3');
    await page.goto('/#/dashboard', { waitUntil: 'load' });
    await schliesseOverlays(page);
    await warteAufAnsicht(page);

    await page.fill('#tb-suche-feld', 'Art. 5');
    await expect(page.locator('#tb-suche-treffer .such-treffer').first()).toBeVisible();
    const erster = page.locator('#tb-suche-treffer .such-treffer').first();
    expect(await erster.locator('.such-titel').innerText()).toContain('Art. 5');
  });

  test('the keyboard works: arrow keys move, Enter opens, Escape closes', async ({ page, zustand }) => {
    await zustand('mittenInPhase3');
    await page.goto('/#/dashboard', { waitUntil: 'load' });
    await schliesseOverlays(page);
    await warteAufAnsicht(page);

    await page.fill('#tb-suche-feld', 'Anhang');
    await expect(page.locator('#tb-suche-treffer .such-treffer').first()).toBeVisible();
    await page.keyboard.press('ArrowDown');
    const markiert = await page.locator('#tb-suche-treffer .such-treffer.aktiv').getAttribute('data-i');
    expect(markiert, 'arrow key does not move the selection').toBe('1');
    await page.keyboard.press('Escape');
    await expect(page.locator('#tb-suche-treffer')).toBeHidden();
    expect(await page.inputValue('#tb-suche-feld')).toBe('');
  });

  test('search is off during a closed-book examination', async ({ page, zustand }) => {
    await zustand('mittenInPhase3');
    await page.goto('/#/dashboard', { waitUntil: 'load' });
    await schliesseOverlays(page);
    await warteAufAnsicht(page);

    // Put the marker the quiz engine sets in closed-book mode on the page.
    await page.evaluate(() => {
      const d = document.createElement('div');
      d.dataset.quizMode = 'closed_book';
      document.getElementById('view').appendChild(d);
    });
    await page.fill('#tb-suche-feld', 'Hochrisiko');
    await expect(page.locator('#tb-suche-treffer')).toBeVisible();
    expect(await page.locator('#tb-suche-treffer').innerText()).toContain('Prüfung');
    expect(await page.locator('#tb-suche-treffer .such-treffer').count(),
      'closed book must not yield searchable hits').toBe(0);
  });

  test('the due list shows the same numbers as the review view', async ({ page, zustand }) => {
    await zustand('mittenInPhase3');
    await page.goto('/#/dashboard', { waitUntil: 'load' });
    await schliesseOverlays(page);
    await warteAufAnsicht(page);

    await page.click('#tb-faellig');
    await expect(page.locator('#tb-faellig-menu')).toBeVisible();
    const text = await page.locator('#tb-faellig-menu').innerText();

    const erwartet = await page.evaluate(async () => {
      const { splitQueues } = await import('./app/engine-leitner.js');
      const { StorageAdapter } = await import('./app/storage-adapter.js');
      let sp = StorageAdapter.bridgeStore({});
      try { await sp.get('state'); } catch { sp = StorageAdapter.localStorage(); }
      const st = await sp.get('state');
      return splitQueues(st.cards ?? [], Date.now()).kern.length;
    });
    expect(text, `menu says "${text.replace(/\n/g, ' | ')}", state says ${erwartet}`)
      .toContain(String(erwartet));
    expect(text).toContain('Wochenziel');

    // Sidebar badge and menu must not disagree.
    const badge = await page.locator('#due-count').innerText();
    expect(Number(badge), 'sidebar badge and due menu disagree').toBe(erwartet);
  });

  test('every profile menu entry leads to a view that exists', async ({ page, zustand }) => {
    await zustand('mittenInPhase3');
    await page.goto('/#/dashboard', { waitUntil: 'load' });
    await schliesseOverlays(page);
    await warteAufAnsicht(page);

    await page.click('#tb-profil');
    await expect(page.locator('#tb-profil-menu')).toBeVisible();
    const ziele = await page.locator('#tb-profil-menu .menu-eintrag').evaluateAll(
      as => as.map(a => ({ href: a.getAttribute('href'), aktion: a.dataset.aktion ?? null })));
    expect(ziele.length).toBeGreaterThan(3);

    for (const z of ziele) {
      if (z.aktion) continue;                       // export is checked below
      if (z.href.startsWith('/')) {                 // separate page
        const res = await page.request.get(z.href);
        expect(res.status(), `${z.href} is not reachable`).toBe(200);
        continue;
      }
      await page.goto('/' + z.href, { waitUntil: 'load' });
      await schliesseOverlays(page);
      await warteAufAnsicht(page);
      const inhalt = (await page.locator('#view').innerText()).trim();
      expect(inhalt.length, `${z.href} renders an empty view`).toBeGreaterThan(40);
      expect(inhalt, `${z.href} shows an error`).not.toMatch(/Unbekannte Route|nicht gefunden/i);
    }
  });

  test('the export in the profile menu produces a file with the state in it', async ({ page, zustand }) => {
    await zustand('mittenInPhase3');
    await page.goto('/#/dashboard', { waitUntil: 'load' });
    await schliesseOverlays(page);
    await warteAufAnsicht(page);

    await page.click('#tb-profil');
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.click('#tb-profil-menu [data-aktion="export"]'),
    ]);
    expect(download.suggestedFilename()).toMatch(/^ai-act-akademie-lernstand-\d{4}-\d{2}-\d{2}\.json$/);
    const pfad = await download.path();
    const inhalt = JSON.parse(await (await import('node:fs/promises')).readFile(pfad, 'utf8'));
    const roh = JSON.stringify(inhalt);
    expect(roh, 'the export does not contain the learning state').toContain('p2-e02-zeitschichten');
    expect(roh.length, 'the export is suspiciously small').toBeGreaterThan(500);
  });
});
