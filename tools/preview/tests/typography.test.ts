import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolveConfig } from '../src/core/config';
import { readYaml } from '../src/core/yaml';
import { textStyles } from '../src/core/render-plan';
import { calculateLayout, scaleLayout } from '../src/core/layout';
import type { Scene } from '../src/core/scenes';

const defaults = readYaml(await readFile(new URL('../data/weasel-defaults.yaml', import.meta.url), 'utf8')).data;
const config = (spacing: string, baseline: string) => resolveConfig(`patch:
  style/+:
    font_point: 12
    label_font_point: 9
    comment_font_point: 9
    horizontal: true
    layout: { linespacing: ${spacing}, baseline: ${baseline} }
`, defaults);

test('uniform typography uses native integer normalization and requires both percentages', () => {
  const normalized = config('-140', '-100');
  assert.equal(normalized.ok, true);
  assert.equal(normalized.style.layout.linespacing, 140);
  assert.equal(normalized.style.layout.baseline, 100);
  assert.equal(normalized.origins['style/layout/baseline'], 'derived');
  assert.ok(!normalized.diagnostics.some((d) => d.code === 'unsupported'));
  for (const [spacing, baseline] of [['0', '100'], ['140', '0'], ['0', '0']]) {
    assert.equal(textStyles(config(spacing, baseline).style).text.lineMetrics, null);
  }
  for (const value of ['1.5', 'true', 'nope']) assert.equal(config(value, '100').ok, false);
});

test('font roles resolve their own line boxes; percentages survive DPR and vertical text centers its baseline', () => {
  const style = config('140', '100').style;
  const fonts = textStyles(style);
  assert.deepEqual(fonts.text.lineMetrics, { height: 22.4, baseline: 16 });
  assert.deepEqual(fonts.label.lineMetrics, { height: 16.8, baseline: 12 });
  assert.deepEqual(fonts.comment.lineMetrics, fonts.label.lineMetrics);
  assert.deepEqual(fonts.preedit.lineMetrics, fonts.text.lineMetrics);
  const scaled = scaleLayout(style.layout, 1.5);
  assert.equal(scaled.linespacing, 140); assert.equal(scaled.baseline, 100);
  const vertical = textStyles({ ...style, vertical_text: true });
  assert.deepEqual(vertical.text.lineMetrics, { height: 22.4, baseline: 11.2 });
  assert.equal(textStyles({ ...style, label_font_point: 0 }).label.lineMetrics, null);
});

test('default marker compensation follows native integer truncation in both writing directions', () => {
  const { style, schemes, selected } = config('140', '100');
  const colors = { ...schemes[selected.light].colors, hilited_mark_color: '#0078d4ff' };
  const scene: Scene = { id: 'one', name: 'One', preedit: 'ab', highlighted: 0, candidates: [{ text: '字' }] };
  const measure = () => ({ width: 143, height: 143 });
  for (const vertical of [false, true]) {
    const result = calculateLayout({ ...style, vertical_text: vertical }, colors, scene, measure, 1.5);
    assert.equal(vertical ? result.mark!.rect.height : result.mark!.rect.width, 14);
    const disabled = calculateLayout({ ...style, vertical_text: vertical, layout: { ...style.layout, baseline: 0 } }, colors, scene, measure);
    assert.equal(vertical ? disabled.mark!.rect.height : disabled.mark!.rect.width, 20);
  }
});
