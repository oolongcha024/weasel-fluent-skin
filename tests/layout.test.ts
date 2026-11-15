import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolveConfig } from '../src/core/config';
import { readYaml } from '../src/core/yaml';
import { calculateLayout, scaleLayout, type MeasureText } from '../src/core/layout';
import type { Scene, Style } from '../src/core/types';

const defaults = readYaml(await readFile(new URL('../data/weasel-defaults.yaml', import.meta.url), 'utf8')).data;
const base = resolveConfig(`patch:
  style/+:
    horizontal: true
    inline_preedit: true
    layout:
      border_width: 0
      shadow_radius: 0
      min_width: 0
      margin_x: 12
      margin_y: 12
`, defaults);
const colors = { ...base.schemes.aqua.colors, hilited_mark_color: '#00000000' };
const scene: Scene = { id: 'test', name: 'Test', preedit: 'ab', highlightedPreedit: 'a', highlighted: 0, candidates: [{ text: '字' }] };
// Inject deterministic device-pixel font measurements. These fixtures test the
// original layout formulas without coupling their expectations to browser fonts.
const measure: MeasureText = (text, role) => ({ width: [...text].length * (role === 'label' ? 6 : role === 'comment' ? 8 : 16), height: role === 'label' ? 14 : role === 'comment' ? 12 : 20 });
const style = (patch: Partial<Style> = {}): Style => ({ ...structuredClone(base.style), ...patch });

test('native minimum sizes include margins and stretch the row-ending background', () => {
  const s = style(); s.layout.min_width = 160; s.layout.min_height = 80;
  const g = calculateLayout(s, colors, scene, measure);
  assert.equal(g.width, 160); assert.equal(g.height, 80);
  assert.equal(g.candidates[0].background.width, 140);
  assert.equal(g.candidates[0].label!.rect.x, 12);
});

test('each horizontal row ends at the common right margin, without stretching text', () => {
  const s = style(); s.layout.max_width = 90; s.layout.min_width = 160;
  const multiple = { ...scene, candidates: [{ text: '字' }, { text: '两个' }, { text: '字' }] };
  const g = calculateLayout(s, colors, multiple, measure);
  assert.ok(new Set(g.candidates.map((c) => c.row)).size > 1);
  for (const candidate of g.candidates) {
    const last = !g.candidates.some((c) => c.row === candidate.row && c.index > candidate.index);
    if (last) assert.equal(candidate.bounds.x + candidate.bounds.width, g.width - 12);
    assert.equal(candidate.text.rect.width, multiple.candidates[candidate.index].text.length * 16);
  }
});

test('hidden comments never participate in measurement, including mixed highlight colors', () => {
  const mixed = { ...scene, candidates: [{ text: '字', comment: 'shown' }, { text: '字', comment: 'hidden' }] };
  const c = { ...colors, comment_text_color: '#00000000', hilited_comment_text_color: '#111111ff' };
  const g = calculateLayout(style(), c, mixed, (text, role) => {
    assert.notEqual(text, 'hidden'); return measure(text, role);
  });
  assert.ok(g.candidates[0].comment); assert.equal(g.candidates[1].comment, null);
});

test('preedit reserves segment gaps and inflates its highlight on both axes', () => {
  const s = style({ inline_preedit: false }); s.layout.hilite_spacing = 8; s.layout.hilite_padding_x = 6; s.layout.hilite_padding_y = 4;
  const g = calculateLayout(s, colors, scene, measure);
  const pre = g.preedit!, [highlight, plain] = pre.runs;
  assert.equal(plain.rect.x - highlight.rect.x - highlight.rect.width, 8);
  assert.equal(pre.background!.width - highlight.rect.width, 12);
  assert.equal(pre.background!.height - highlight.rect.height, 8);
});

test('DPI conversion truncates signed layout values and produces integer geometry', () => {
  const s = style(); s.layout.margin_x = 7; s.layout.shadow_offset_x = -3;
  const scaled = scaleLayout(s.layout, 1.5);
  assert.equal(scaled.margin_x, 10); assert.equal(scaled.shadow_offset_x, -4);
  const g = calculateLayout(s, colors, scene, measure, 1.5);
  assert.equal(g.candidates[0].label!.rect.x, 10);
  for (const c of g.candidates) for (const value of Object.values(c.bounds)) assert.ok(Number.isInteger(value));
});

test('vertical labels keep native per-item advances and comments share a common band', () => {
  const s = style({ horizontal: false });
  const multiple = { ...scene, candidates: [{ text: '字', label: '1', comment: 'long' }, { text: '两个', label: '10', comment: 'a' }] };
  const g = calculateLayout(s, colors, multiple, measure);
  assert.equal(g.candidates[0].comment!.rect.x, g.candidates[1].comment!.rect.x);
  assert.equal(g.candidates[1].text.rect.x - g.candidates[0].text.rect.x, 6);
  for (const c of g.candidates) assert.equal(c.bounds.x + c.bounds.width, g.width - s.layout.margin_x);
});

test('vertical-text order, mark padding and shadow buffers remain independent', () => {
  const s = style({ vertical_text: true });
  s.layout.shadow_radius = 16; s.layout.shadow_offset_y = 4;
  const multiple = { ...scene, candidates: [{ text: '字' }, { text: '字' }] };
  const g = calculateLayout(s, { ...colors, hilited_mark_color: '#0078d4ff' }, multiple, measure);
  assert.ok(g.candidates[0].bounds.x > g.candidates[1].bounds.x);
  assert.equal(g.candidates[0].label!.rect.y - g.mark!.rect.y - g.mark!.rect.height, s.layout.hilite_padding_y);
  assert.ok(g.height >= Math.max(...g.candidates.map((c) => c.bounds.y + c.bounds.height)) + s.layout.margin_y);
  const left = calculateLayout({ ...s, vertical_text_left_to_right: true }, colors, multiple, measure);
  assert.ok(left.candidates[0].bounds.x < left.candidates[1].bounds.x);
});

test('pager requires both colors and uses separate first/last-page state in the renderer', () => {
  const s = style({ inline_preedit: false });
  const one = calculateLayout(s, { ...colors, prevpage_color: '#ff0000ff' }, scene, measure);
  assert.equal(one.pages, null);
  const both = calculateLayout(s, { ...colors, prevpage_color: '#ff0000ff', nextpage_color: '#ff0000ff' }, scene, measure);
  assert.ok(both.pages);
});
