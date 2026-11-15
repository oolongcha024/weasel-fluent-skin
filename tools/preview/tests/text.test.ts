import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolveConfig } from '../src/core/config';
import { readYaml } from '../src/core/yaml';
import { abbreviate, candidateLabel, preeditContent } from '../src/core/text';
import { fontSpec } from '../src/core/font';
import type { Scene } from '../src/core/scenes';

const defaults = readYaml(await readFile(new URL('../data/weasel-defaults.yaml', import.meta.url), 'utf8')).data;
const style = resolveConfig('patch: {}', defaults).style;
const scene: Scene = { id: 'test', name: 'Test', preedit: 'ni hao', highlightedPreedit: 'ni', highlighted: 1,
  candidates: [{ text: '你好', comment: 'nǐ hǎo' }, { text: '拟好', label: 'B' }] };

test('native abbreviation preserves the last UTF-16 unit and inserts three dots', () => {
  assert.equal(abbreviate('自定义输入法皮肤', 4), '自定义...肤');
  assert.equal(abbreviate('abcdef', 1), '...f');
  assert.equal(abbreviate('abc', 3), 'abc');
  assert.equal(abbreviate('abc', 0), 'abc');
  assert.equal(abbreviate('𠮷野家abc', 4), '𠮷野...c');
});

test('preview uses engine commit preview; absence falls back to composition', () => {
  const preview = { ...style, preedit_type: 'preview' as const };
  assert.deepEqual(preeditContent(preview, scene), { text: 'ni hao', highlight: 'ni' });
  assert.deepEqual(preeditContent(preview, { ...scene, commitPreview: '你好' }), { text: '你好', highlight: '你好' });
  assert.deepEqual(preeditContent(preview, { ...scene, commitPreview: '' }), { text: '', highlight: '' });
});

test('preview_all includes composition, labels, comments and selection mark before abbreviation', () => {
  const preview = { ...style, preedit_type: 'preview_all' as const, label_format: '%s.', candidate_abbreviate_length: 1 };
  assert.deepEqual(preeditContent(preview, scene), { text: 'ni hao  [ 1.你好 nǐ hǎo *B.拟好  ]', highlight: 'ni' });
  assert.equal(preeditContent({ ...preview, mark_text: '→', label_font_point: 0, comment_font_point: 0 }, scene).text, 'ni hao  [ 你好  →拟好  ]');
});

test('default labels cycle to zero at the tenth candidate', () => {
  const ten = { ...scene, candidates: Array.from({ length: 10 }, () => ({ text: '字' })) };
  assert.equal(candidateLabel(ten, 9), '0');
  assert.equal(candidateLabel(scene, 1), 'B');
});

test('native font weight aliases and the last global style token determine text metrics', () => {
  for (const [token, weight] of Object.entries({ extra_light: 200, ultra_light: 200, semi_light: 350, demi_bold: 600, semi_bold: 600, extra_bold: 800, ultra_bold: 800, heavy: 900, extra_black: 950, ultra_black: 950 })) {
    assert.equal(fontSpec(`Noto Sans:${token}`).weight, weight, token);
  }
  const spec = fontSpec('Noto Sans:light:italic, Noto Sans CJK SC:semi_bold:normal');
  assert.equal(spec.weight, 600); assert.equal(spec.style, 'normal');
});
