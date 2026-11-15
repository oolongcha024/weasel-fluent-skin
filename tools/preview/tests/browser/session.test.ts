import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { startServer } from '../../src/server/server';

test('live workbench retains stale frames, rejects exports and recovers with selections', { timeout: 60000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'weasel-session-')), config = join(dir, 'weasel.custom.yaml');
  const source = 'patch:\n  style/font_face: sans-serif\n';
  await writeFile(config, source);
  const instance = await startServer({ config, live: true });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const errors: string[] = []; page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(instance.url);
    await page.waitForFunction(() => window.__WEASEL_PREVIEW__?.state === 'ready');
    await page.evaluate(() => window.__WEASEL_PREVIEW__.select({ scene: 'long', scheme: 'azure' }));
    const identity = await page.evaluate(() => window.__WEASEL_PREVIEW__.report!.identity);
    await page.getByLabel('预览缩放').selectOption('1.5');
    await page.waitForFunction(() => window.__WEASEL_PREVIEW__.state === 'ready');
    const before = await page.locator('.ime-window').innerText();
    await writeFile(config, 'patch: [');
    await page.waitForFunction(() => window.__WEASEL_PREVIEW__.state === 'error');
    assert.equal(await page.locator('.ime-window').innerText(), before);
    assert.ok(await page.locator('#stage').evaluate((node) => node.classList.contains('stale')));
    assert.equal(await page.evaluate(() => window.__WEASEL_PREVIEW__.report), null);
    const rejected = await page.evaluate(async () => { try { await window.__WEASEL_PREVIEW__.select({}); return false; } catch { return true; } });
    assert.equal(rejected, true);
    await writeFile(config, source + '  style/layout/margin_x: 19\n');
    await page.waitForFunction(() => window.__WEASEL_PREVIEW__.state === 'ready');
    const recovered = await page.evaluate(() => window.__WEASEL_PREVIEW__.report!);
    assert.equal(recovered.scheme, 'azure'); assert.equal(recovered.scene, 'long');
    assert.notDeepEqual(recovered.identity, identity);
    assert.equal(await page.getByLabel('预览缩放').inputValue(), '1.5');
    const concurrent = await page.evaluate(async () => {
      const results = await Promise.allSettled([
        window.__WEASEL_PREVIEW__.select({ scene: 'everyday' }),
        window.__WEASEL_PREVIEW__.select({ scene: 'symbols' }),
      ]);
      return { statuses: results.map((r) => r.status), scene: window.__WEASEL_PREVIEW__.report?.scene,
        domScene: document.querySelector<HTMLElement>('.ime-preview')!.dataset.scene };
    });
    assert.deepEqual(concurrent.statuses, ['rejected', 'fulfilled']);
    assert.equal(concurrent.scene, 'symbols'); assert.equal(concurrent.domScene, 'symbols');
    assert.equal(await page.getByLabel('预览缩放').inputValue(), '1');
    await instance.server.close();
    await page.waitForFunction(() => window.__WEASEL_PREVIEW__.state === 'error');
    assert.equal(await page.evaluate(() => window.__WEASEL_PREVIEW__.report), null);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await instance.server.close(); await rm(dir, { recursive: true, force: true }); }
});
