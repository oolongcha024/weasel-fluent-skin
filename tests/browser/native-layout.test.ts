import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { startServer } from '../../src/server/server';

// Geometry expectations come from Weasel 0.17.4 HorizontalLayout.cpp,
// VerticalLayout.cpp, Layout.cpp and WeaselPanel.cpp, not from CSS snapshots.
test('native window bounds, stretched highlight, invisible comments, preedit and DPI', { timeout: 60000 }, async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'weasel-native-layout-'));
  const file = join(dir, 'weasel.custom.yaml'), scenes = join(dir, 'scenes.json');
  const source = `patch:
  style/+:
    color_scheme: audit
    color_scheme_dark: null
    horizontal: true
    inline_preedit: true
    font_face: sans-serif
    label_font_face: sans-serif
    comment_font_face: sans-serif
    layout:
      border_width: 0
      shadow_radius: 0
      margin_x: 12
      margin_y: 12
      min_width: 160
      min_height: 80
  preset_color_schemes/audit:
    color_format: argb
    back_color: 0xFFFFFFFF
    text_color: 0xFF000000
    hilited_candidate_back_color: 0xFF123456
    comment_text_color: 0x00000000
    hilited_comment_text_color: 0x00000000
`;
  await writeFile(file, source);
  await writeFile(scenes, JSON.stringify([
    { id: 'plain', name: 'Plain', preedit: 'ab', highlightedPreedit: 'a', highlighted: 0, candidates: [{ text: '字' }] },
    { id: 'comment', name: 'Comment', preedit: 'ab', highlightedPreedit: 'a', highlighted: 0, candidates: [{ text: '字', comment: 'very long comment' }] },
  ]));
  const browser = await chromium.launch();
  try {
    const instance = await startServer({ config: file, scenes, port: 0, live: false });
    try {
      const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
      await page.goto(instance.url);
      await page.waitForFunction(() => window.__WEASEL_PREVIEW__?.state === 'ready');
      await t.test('min dimensions include margins; last candidate reaches the right margin', async () => {
        const values = await page.evaluate(() => {
          const w = document.querySelector('.ime-window')!.getBoundingClientRect();
          const h = document.querySelector('.ime-candidate-surface')!.getBoundingClientRect();
          return { width: w.width, height: w.height, highlight: h.width };
        });
        assert.equal(values.width, 160);
        assert.equal(values.height, 80);
        assert.equal(values.highlight, 140); // 160 - 12*2 + 2*2
      });
      await t.test('transparent comments do not occupy space', async () => {
        await page.evaluate(() => window.__WEASEL_PREVIEW__.select({ scene: 'comment' }));
        assert.equal(await page.locator('.ime-comment').count(), 0);
      });
      await page.close();
    } finally { await instance.server.close(); }

    await writeFile(file, source.replace('inline_preedit: true', 'inline_preedit: false') + '  style/layout/hilite_spacing: 8\n  style/layout/hilite_padding_x: 6\n  style/layout/hilite_padding_y: 4\n');
    const preeditServer = await startServer({ config: file, scenes, port: 0, live: false });
    try {
      const page = await browser.newPage();
      await page.goto(preeditServer.url);
      await page.waitForFunction(() => window.__WEASEL_PREVIEW__?.state === 'ready');
      await t.test('preedit highlighter expands around the glyph rectangle and separates runs', async () => {
        const box = await page.evaluate(() => {
          const run = document.querySelector('.ime-preedit-highlight')!;
          const r = document.createRange(); r.selectNodeContents(run);
          const text = r.getBoundingClientRect();
          const background = document.querySelector('.ime-preedit-surface')?.getBoundingClientRect();
          const suffix = document.querySelector('.ime-preedit-plain')?.getBoundingClientRect();
          return { expansion: background ? background.width - run.getBoundingClientRect().width : 0,
            gap: suffix ? suffix.left - run.getBoundingClientRect().right : 0, glyphWidth: text.width };
        });
        assert.ok(Math.abs(box.expansion - 12) < .1);
        assert.ok(Math.abs(box.gap - 8) < .1);
      });
      await page.close();
    } finally { await preeditServer.server.close(); }

    await writeFile(file, source.replace('margin_x: 12', 'margin_x: 7').replace('margin_y: 12', 'margin_y: 7'));
    const dpiServer = await startServer({ config: file, scenes, port: 0, live: false });
    try {
      const page = await browser.newPage({ deviceScaleFactor: 1.5 });
      await page.goto(dpiServer.url);
      await page.waitForFunction(() => window.__WEASEL_PREVIEW__?.state === 'ready');
      await t.test('150 percent layout uses native integer device coordinates', async () => {
        const inset = await page.evaluate(() => {
          const win = document.querySelector('.ime-window')!.getBoundingClientRect();
          const label = document.querySelector('.ime-label')!.getBoundingClientRect();
          return (label.left - win.left) * devicePixelRatio;
        });
        assert.ok(Math.abs(inset - 10) < .05, `native trunc(7 * 1.5) = 10, got ${inset}`);
      });
      await page.close();
    } finally { await dpiServer.server.close(); }
  } finally { await browser.close(); await rm(dir, { recursive: true, force: true }); }
});
