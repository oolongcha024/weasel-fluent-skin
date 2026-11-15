import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { startServer } from '../../src/server/server';

// Native reference: WeaselUI/HorizontalLayout.cpp reserves base_offset before
// the selected label. WeaselPanel.cpp paints the bar at the inflated rect's left.
// Consequently the bar-to-label gap equals hilite_padding_x, not padding - 5.
test('highlight bar reserves native label spacing independently of font and display density', { timeout: 30000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'weasel-mark-spacing-'));
  const input = join(directory, 'weasel.custom.yaml');
  const scenes = join(directory, 'scenes.json');
  await writeFile(input, `patch:
  style/+:
    font_face: sans-serif
    label_font_face: sans-serif
    horizontal: true
    inline_preedit: true
    mark_text: ""
    layout:
      min_width: 0
      hilite_padding_x: 8
  preset_color_schemes/aqua/hilited_mark_color: 0xff0000ff
  preset_color_schemes/no_mark:
    hilited_mark_color: 0x00000000
`);
  await writeFile(scenes, JSON.stringify([{ id: 'one', name: 'One', preedit: 'a', highlighted: 0, candidates: [{ text: '字' }] }]));
  const instance = await startServer({ config: input, scenes, port: 0, live: false });
  const browser = await chromium.launch();
  try {
    for (const density of [1, 1.5]) {
      const page = await browser.newPage({ viewport: { width: 1200, height: 800 }, deviceScaleFactor: density });
      await page.goto(instance.url);
      await page.waitForFunction(() => window.__WEASEL_PREVIEW__?.state === 'ready');
      const dimensions = await page.evaluate(() => {
        const candidate = document.querySelector('.ime-candidate[aria-selected=true]')!;
        const mark = candidate.querySelector('.ime-mark')!.getBoundingClientRect();
        const label = candidate.querySelector('.ime-label')!.getBoundingClientRect();
        const surface = candidate.querySelector('.ime-candidate-surface')!.getBoundingClientRect();
        return { gap: label.left - mark.right, markWidth: mark.width, markInset: mark.left - surface.left };
      });
      assert.ok(Math.abs(dimensions.gap - 8) < .1, `DPR ${density}: bar-to-label gap ${dimensions.gap}px, expected 8px`);
      assert.ok(Math.abs(dimensions.markInset) < .1, 'bar should start at the highlight background edge');
      assert.ok(dimensions.markWidth * density >= 5.9, 'native bar thickness is at least 6 physical pixels');
      const markedWidth = await page.locator('.ime-window').evaluate((node) => node.getBoundingClientRect().width);
      await page.evaluate(() => window.__WEASEL_PREVIEW__.select({ scheme: 'no_mark' }));
      assert.equal(await page.locator('.ime-mark').count(), 0);
      const plainWidth = await page.locator('.ime-window').evaluate((node) => node.getBoundingClientRect().width);
      assert.ok(Math.abs(markedWidth - plainWidth - dimensions.markWidth) < .1, 'visible marker must consume layout width');
      await page.evaluate(() => window.__WEASEL_PREVIEW__.select({ scheme: 'aqua' }));
      await page.locator('.ime-label').evaluate((node: HTMLElement) => { node.style.fontFamily = 'serif'; });
      const alternateGap = await page.evaluate(() => {
        const candidate = document.querySelector('.ime-candidate[aria-selected=true]')!;
        return candidate.querySelector('.ime-label')!.getBoundingClientRect().left - candidate.querySelector('.ime-mark')!.getBoundingClientRect().right;
      });
      assert.ok(Math.abs(alternateGap - 8) < .1, 'font fallback must not erase marker spacing');
      await page.close();
    }
  } finally {
    await browser.close();
    await instance.server.close();
    await rm(directory, { recursive: true, force: true });
  }
});
