import { test, expect, SOLL_BREITE, SOLL_HOEHE, schliesseOverlays } from '../harness.mjs';

test.describe('foundation', () => {
  test('the window has the size the suite assumes', async ({ page }) => {
    const g = await page.evaluate(() => ({ w: innerWidth, h: innerHeight, dpr: devicePixelRatio }));
    expect(g).toEqual({ w: SOLL_BREITE, h: SOLL_HOEHE, dpr: 1 });
  });

  test('the application boots and the bridge answers', async ({ page }) => {
    await schliesseOverlays(page);
    await expect(page.locator('.sidebar, .rail, nav').first()).toBeVisible();
    const gesund = await page.evaluate(async () => {
      const { apiPrefix } = await import('./app/llm-adapter.js');
      const r = await fetch(apiPrefix() + 'health');
      return { status: r.status, body: await r.json() };
    });
    expect(gesund.status).toBe(200);
    expect(gesund.body.ok).toBe(true);
  });

  test('time and randomness are pinned', async ({ page }) => {
    const a = await page.evaluate(() => [Date.now(), Math.random()]);
    await page.reload();
    const b = await page.evaluate(() => [Date.now(), Math.random()]);
    expect(a).toEqual(b);
  });
});
