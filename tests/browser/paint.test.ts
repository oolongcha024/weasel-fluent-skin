import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { startServer } from '../../src/server/server';

test('native paint passes, ring/offset shadows, corner selection and whole-word wrapping', { timeout: 60000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'weasel-paint-'));
  const config = join(dir, 'weasel.custom.yaml'), scenes = join(dir, 'scenes.json');
  await writeFile(scenes, JSON.stringify([{ id: 'paint', name: 'Paint', preedit: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', highlighted: 0,
    candidates: [{ text: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', comment: 'abc' }, { text: '字' }, { text: '词' }] }]));
  const source = `patch:
  style/+:
    color_scheme: paint
    color_scheme_dark: null
    horizontal: false
    inline_preedit: false
    font_face: sans-serif
    label_font_face: sans-serif
    comment_font_face: sans-serif
    preedit_type: composition
    label_format: '%s'
    layout:
      min_width: 0
      max_width: 80
      border_width: 1
      margin_x: 6
      margin_y: 4
      hilite_padding_x: 6
      hilite_padding_y: 4
      round_corner: 2
      corner_radius: 8
      shadow_radius: 8
      shadow_offset_x: 0
      shadow_offset_y: 0
  preset_color_schemes/paint:
    color_format: argb
    back_color: 0xCCFFFFFF
    text_color: 0xFF000000
    candidate_back_color: 0x4400FF00
    hilited_candidate_back_color: 0x880078D4
    shadow_color: 0x40000000
    candidate_shadow_color: 0x80000000
    hilited_candidate_shadow_color: 0x60000000
`;
  const browser = await chromium.launch();
  try {
    for (const offset of [0, 4]) {
      await writeFile(config, source.replace('shadow_offset_y: 0', `shadow_offset_y: ${offset}`));
      const server = await startServer({ config, scenes, port: 0, live: false });
      try {
        const page = await browser.newPage({ deviceScaleFactor: 1.5 });
        const errors: string[] = []; page.on('pageerror', (e) => errors.push(e.message));
        await page.goto(server.url);
        await page.waitForFunction(() => window.__WEASEL_PREVIEW__?.state === 'ready');
        const result = await page.evaluate(() => {
          const report = window.__WEASEL_PREVIEW__.report!;
          const geometry = report.geometry!;
          const backgrounds = document.querySelector('.ime-backgrounds')!;
          const passes = [...backgrounds.children].map((node) => node.tagName.toLowerCase() === 'svg' ? 'shadow' : node.className);
          const shadows = [...backgrounds.querySelectorAll<SVGElement>('.ime-shadow')];
          const svg = shadows[0];
          return { passes, kinds: shadows.map((node) => node.dataset.kind),
            sigma: svg.querySelector('feGaussianBlur')!.getAttribute('stdDeviation'),
            strokes: svg.querySelectorAll('rect[fill="none"]').length,
            fills: svg.querySelectorAll('rect:not([fill="none"])').length,
            clipped: getComputedStyle(document.querySelector('.ime-content')!).overflow,
            selected: backgrounds.lastElementChild!.getAttribute('data-index'),
            shape: getComputedStyle(backgrounds.querySelector('[data-index="1"]')!).borderTopLeftRadius,
            candidateWidth: geometry.candidates[0].text.rect.width,
            candidateHeight: geometry.candidates[0].text.rect.height,
            preeditHeight: geometry.preedit!.bounds.height,
            density: geometry.density,
          };
        });
        assert.deepEqual(errors, []);
        assert.equal(result.kinds.length, 4, 'window, two ordinary candidates and highlighted candidate have independent shadows');
        assert.ok(result.kinds.every((kind) => kind === (offset ? 'offset' : 'ring')));
        assert.equal(result.sigma, '12 12', 'shadow radius is sigma in physical pixels');
        assert.equal(result.strokes, offset ? 0 : 12);
        assert.equal(result.fills, offset ? 1 : 0);
        assert.equal(result.clipped, 'visible');
        assert.deepEqual(result.passes, ['shadow', 'ime-window-surface', 'shadow', 'shadow', 'ime-candidate-surface', 'ime-candidate-surface', 'shadow', 'ime-candidate-surface']);
        assert.equal(result.selected, '0', 'highlight is painted after the ordinary candidates');
        assert.equal(result.shape, '0px', 'middle candidate has square corners when attached to window edges');
        assert.ok(result.candidateWidth > 80 * result.density, 'whole words may exceed max_width');
        assert.equal(result.preeditHeight, result.candidateHeight, '0.17.4 applies whole-word wrapping to the preedit format too');
        await page.close();
      } finally { await server.server.close(); }
    }
  } finally { await browser.close(); await rm(dir, { recursive: true, force: true }); }
});
