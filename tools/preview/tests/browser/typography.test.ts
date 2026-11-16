import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, type Page } from 'playwright';
import { startServer } from '../../src/server/server';

const source = (baseline = 100, extra = '') => `patch:
  style/+:
    font_face: sans-serif
    label_font_face: sans-serif
    comment_font_face: sans-serif
    font_point: 12
    label_font_point: 9
    comment_font_point: 9
    horizontal: true
    inline_preedit: false
    layout:
      min_width: 0
      border_width: 0
      shadow_radius: 0
      linespacing: 140
      baseline: ${baseline}
${extra}`;
const plain = { id: 'plain', name: 'Plain', preedit: 'abc', highlightedPreedit: 'ab', highlighted: 0,
  candidates: [{ text: '春日', comment: 'spring' }] };

async function baselinePositions(page: Page) {
  return page.evaluate(() => {
    const report = window.__WEASEL_PREVIEW__.report!;
    const win = document.querySelector('.ime-window')!.getBoundingClientRect();
    return [...document.querySelectorAll<HTMLElement>('.ime-candidate > .ime-text, .ime-label, .ime-comment, .ime-preedit-plain, .ime-preedit-highlight')].map((node) => {
      const line = node.querySelector<HTMLElement>('.ime-line')!;
      const caret = document.createElement('span');
      Object.assign(caret.style, { display: 'inline-block', width: '0', height: '0', verticalAlign: 'baseline', lineHeight: '0' });
      line.append(caret);
      const actual = caret.getBoundingClientRect().top - win.top;
      caret.remove();
      const item = [...report.plan.candidates.flatMap((c) => c.texts), ...report.plan.preedit!.texts].find((item) => item.kind === node.className.slice(4) && item.text === node.textContent)!;
      const typography = item.typography!;
      return { role: item.role, actual, expected: (item.rect.y + (item.rect.height - typography.height) / 2 + typography.baseline) / report.geometry.density };
    });
  });
}

test('uniform line boxes stabilize emoji height and paint configured role baselines at 100/150 percent', { timeout: 60000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'weasel-typography-'));
  const config = join(dir, 'weasel.custom.yaml'), scenes = join(dir, 'scenes.json');
  await writeFile(config, source());
  await writeFile(scenes, JSON.stringify([plain, { ...plain, id: 'emoji', candidates: [{ text: '🌿 春日', comment: 'spring' }] }]));
  const instance = await startServer({ config, scenes, live: false });
  const browser = await chromium.launch();
  try {
    for (const density of [1, 1.5]) {
      const page = await browser.newPage({ deviceScaleFactor: density });
      await page.goto(instance.url); await page.waitForFunction(() => window.__WEASEL_PREVIEW__?.state === 'ready');
      const before = await page.evaluate(() => window.__WEASEL_PREVIEW__.report!);
      const after = await page.evaluate(() => window.__WEASEL_PREVIEW__.select({ scene: 'emoji' }));
      assert.equal(after.geometry.height, before.geometry.height);
      assert.equal(after.geometry.candidates[0].text.rect.height, Math.ceil(22.4 * density));
      assert.equal(after.plan.fonts.label.lineMetrics!.height, 16.8);
      assert.equal(after.geometry.layout.linespacing, 140);
      assert.ok(!after.diagnostics.some((d) => d.code === 'unsupported' && /baseline|linespacing/.test(d.path ?? '')));
      for (const position of await baselinePositions(page)) assert.ok(Math.abs(position.actual - position.expected) < .05, JSON.stringify(position));
      await page.close();
    }
  } finally { await browser.close(); await instance.server.close(); await rm(dir, { recursive: true, force: true }); }
});

test('baseline changes move actual glyphs and wrapped/vertical text keeps complete grapheme clusters', { timeout: 60000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'weasel-line-layout-'));
  const config = join(dir, 'weasel.custom.yaml'), scenes = join(dir, 'scenes.json');
  const value = '春日 👩‍💻 春雨 春风\n你好 世界';
  await writeFile(scenes, JSON.stringify([plain, { ...plain, id: 'wrapped', preedit: value, highlightedPreedit: '', candidates: [{ text: value, comment: 'abc' }] }]));
  const browser = await chromium.launch();
  try {
    const positions: number[] = [];
    for (const baseline of [100, 110]) {
      await writeFile(config, source(baseline));
      const instance = await startServer({ config, scenes, live: false });
      try {
        const page = await browser.newPage({ deviceScaleFactor: 1.5 });
        await page.goto(instance.url); await page.waitForFunction(() => window.__WEASEL_PREVIEW__?.state === 'ready');
        positions.push((await baselinePositions(page)).find((p) => p.role === 'text')!.actual);
        await page.close();
      } finally { await instance.server.close(); }
    }
    assert.ok(Math.abs(positions[1] - positions[0] - 1.6) < .05, JSON.stringify(positions));
    for (const extra of ['  style/layout/max_width: 64\n',
      '  style/vertical_text: true\n  style/layout/max_height: 64\n',
      '  style/vertical_text: true\n  style/vertical_text_left_to_right: true\n  style/layout/max_height: 64\n']) {
      await writeFile(config, source(110, extra));
      const instance = await startServer({ config, scenes, live: false });
      try {
        const page = await browser.newPage({ deviceScaleFactor: 1.5 });
        await page.goto(instance.url); await page.waitForFunction(() => window.__WEASEL_PREVIEW__?.state === 'ready');
        const report = await page.evaluate(() => window.__WEASEL_PREVIEW__.select({ scene: 'wrapped' }));
        const text = report.plan.candidates[0].texts.find((t) => t.kind === 'text')!;
        const typography = text.typography!;
        assert.ok(typography.lines.length > 1);
        assert.equal(typography.lines.map((line) => line.text).join(''), value.replaceAll('\n', ''));
        assert.equal(typography.lines.filter((line) => line.text.includes('👩‍💻')).length, 1);
        const vertical = report.plan.writingMode !== 'horizontal-tb';
        if (vertical) assert.equal(typography.baseline, typography.lineHeight / 2);
        const origin = report.geometry.candidates[0].text.rect;
        const extent = vertical ? typography.width : typography.height;
        assert.ok((vertical ? origin.width : origin.height) >= Math.ceil(extent));
        const dom = await page.locator('.ime-candidate > .ime-text .ime-line').allTextContents();
        assert.deepEqual(dom, typography.lines.map((line) => line.text));
        const offline = await browser.newPage({ deviceScaleFactor: 1.5 });
        const css = await readFile(new URL('../../src/render/candidate.css', import.meta.url), 'utf8');
        await offline.setContent(`<style>${css}</style>${report.html}`);
        await offline.evaluate(() => document.fonts.ready);
        assert.deepEqual(await offline.locator('.ime-candidate > .ime-text .ime-line').allTextContents(), dom);
        const box = await offline.locator('.ime-window').boundingBox();
        assert.ok(Math.abs(box!.width - report.bounds!.width) < .05);
        assert.ok(Math.abs(box!.height - report.bounds!.height) < .05);
        await offline.close();
        await page.close();
      } finally { await instance.server.close(); }
    }
  } finally { await browser.close(); await rm(dir, { recursive: true, force: true }); }
});

test('glyph overhang reserves follow native sizing, with uniform custom marks and pager text', { timeout: 30000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'weasel-overhang-'));
  const config = join(dir, 'weasel.custom.yaml'), scenes = join(dir, 'scenes.json');
  await writeFile(config, source(25, `  style/mark_text: '●'
  preset_color_schemes/aqua/hilited_mark_color: 0xff000000
  preset_color_schemes/aqua/prevpage_color: 0xff000000
  preset_color_schemes/aqua/nextpage_color: 0xff000000
`).replace('font_face: sans-serif', "font_face: 'serif:italic'"));
  await writeFile(scenes, JSON.stringify([{ ...plain, candidates: [{ text: 'Áj', comment: 'abc' }] }]));
  const instance = await startServer({ config, scenes, live: false });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ deviceScaleFactor: 1.5 });
    await page.goto(instance.url); await page.waitForFunction(() => window.__WEASEL_PREVIEW__?.state === 'ready');
    const report = await page.evaluate(() => window.__WEASEL_PREVIEW__.report!);
    const text = report.plan.candidates[0].texts.find((t) => t.kind === 'text')!;
    const typography = text.typography!;
    assert.ok(typography.overhang.top > 0);
    const reserve = (n: number) => n ? Math.trunc(n + 1) : 0;
    assert.equal(text.rect.height, Math.ceil(typography.height) + reserve(typography.overhang.top) + reserve(typography.overhang.bottom));
    assert.ok(await page.locator('.ime-mark-text .ime-line').count());
    assert.equal(await page.locator('.ime-page .ime-line').count(), 2);
    assert.equal(report.plan.mark!.typography!.baseline, 6);
  } finally { await browser.close(); await instance.server.close(); await rm(dir, { recursive: true, force: true }); }
});
