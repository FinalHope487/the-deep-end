// Phone-style input: virtual joystick on the left half, look-drag on the right half; audio files decode.
import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });

const state = (page) => page.evaluate(() => window.__deepend.state());

async function touchDrag(cdp, x0, y0, x1, y1, holdMs, page) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0, id: 1 }] });
  for (let i = 1; i <= 8; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + ((x1 - x0) * i) / 8, y: y0 + ((y1 - y0) * i) / 8, id: 1 }] });
  }
  await page.waitForTimeout(holdMs);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

test('觸控：左半邊搖桿前進、推到底跑步、右半邊拖曳轉視角；音檔全數載入', { tag: '@smoke' }, async ({ page, context }) => {
  await page.goto('/?test=1&seed=42');
  await page.waitForFunction(() => window.__deepend?.ready === true, null, { timeout: 60_000 });
  await expect(page.locator('#hint')).toContainText('左半邊');
  await page.getByRole('button', { name: '開始' }).tap();
  await expect.poll(async () => (await state(page)).mode).toBe('playing');
  const cdp = await context.newCDPSession(page);

  // half push → walk; joystick visible only while touching
  let s0 = await state(page);
  const walk = touchDrag(cdp, 100, 600, 100, 570, 1500, page);
  await expect(page.locator('#joy')).toBeVisible();
  await walk;
  await expect(page.locator('#joy')).toBeHidden();
  let s1 = await state(page);
  const walked = s0.z - s1.z;
  expect(walked).toBeGreaterThan(0);

  // full push → run
  await page.evaluate(() => window.__deepend.teleport(8, 8, 0));
  s0 = await state(page);
  await touchDrag(cdp, 100, 600, 100, 520, 1500, page);
  s1 = await state(page);
  expect(s0.z - s1.z).toBeGreaterThan(walked);

  // right half drag → turn
  const yaw0 = (await state(page)).yaw;
  await touchDrag(cdp, 300, 400, 220, 400, 100, page);
  expect(Math.abs((await state(page)).yaw - yaw0)).toBeGreaterThan(0);

  await expect.poll(async () => (await state(page)).audio, { timeout: 20_000 }).toMatchObject({ ready: true, sounds: 14 });
});
