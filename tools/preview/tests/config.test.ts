import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolveConfig } from '../src/core/config';
import { readYaml } from '../src/core/yaml';
import { rimeColor } from '../src/core/color';
import { validateScenes } from '../src/core/scenes';

const defaults = readYaml(await readFile(new URL('../data/weasel-defaults.yaml', import.meta.url), 'utf8')).data;

test('common flat patch paths and the prior ARGB example resolve without losing alpha', () => {
  const c = resolveConfig(`patch:
  "style/color_scheme": fluent
  "style/font_point": 18
  "style/horizontal": true
  "preset_color_schemes/fluent":
    color_format: argb
    back_color: 0xFFF9F9F9
    text_color: 0xFF0078D4
    shadow_color: 0x20000000
`, defaults);
  assert.equal(c.ok, true);
  assert.equal(c.style.font_point, 18);
  assert.equal(c.style.horizontal, true);
  assert.equal(c.schemes.fluent.colors.text_color, '#0078d4ff');
  assert.equal(c.schemes.fluent.colors.shadow_color, '#00000020');
  assert.equal(c.origins['style/font_point'], 'user');
  assert.equal(c.origins['style/font_face'], 'default');
});

test('map merges preserve unspecified official settings; nested assignments replace them', () => {
  const merged = resolveConfig('patch:\n  style/+:\n    font_point: 19\n    layout:\n      margin_x: 20\n', defaults);
  assert.equal(merged.ok, true);
  assert.equal(merged.style.font_point, 19);
  assert.equal(merged.style.layout.margin_x, 20);
  assert.equal(merged.style.layout.min_width, 160);
  const replaced = resolveConfig('patch:\n  style:\n    font_point: 19\n    color_scheme: aqua\n', defaults);
  assert.equal(replaced.ok, true);
  assert.equal(replaced.style.layout.min_width, 0);
  assert.equal(replaced.origins['style/layout/min_width'], 'runtime');
});

test('nested /+ paths merge and color schemes retain siblings', () => {
  const c = resolveConfig(`patch:
  style/+:
    layout/+:
      corner_radius: 12
  preset_color_schemes/+:
    aqua:
      text_color: 0x112233
`, defaults);
  assert.equal(c.ok, true);
  assert.equal(c.style.layout.corner_radius, 12);
  assert.equal(c.style.layout.margin_y, 12);
  assert.equal(c.schemes.aqua.colors.text_color, '#332211ff');
  assert.equal(c.schemes.aqua.colors.back_color, '#eeeeecff');
  assert.ok(c.schemes.azure);
});

test('transparent black is distinct from opaque black in every format', () => {
  assert.equal(rimeColor('0x00000000'), '#00000000');
  assert.equal(rimeColor('0x000000'), '#000000ff');
  assert.equal(rimeColor('0x1234'), '#44332211');
  assert.equal(rimeColor('0x1234', 'argb'), '#22334411');
  assert.equal(rimeColor('0x1234', 'rgba'), '#11223344');
  assert.equal(rimeColor('0x11223344', 'argb'), '#22334411');
  assert.equal(rimeColor('0x11223344', 'rgba'), '#11223344');
  assert.equal(rimeColor('0x11223344'), '#44332211');
});

test('YAML anchors preserve color width; null and quoted null remain different', () => {
  const c = resolveConfig(`patch:
  style/mark_text: "null"
  style/font_point: null
  preset_color_schemes/aqua/+:
    shadow_color: &clear 0x00000000
    candidate_back_color: *clear
`, defaults);
  assert.equal(c.ok, true);
  assert.equal(c.style.mark_text, 'null');
  assert.equal(c.style.font_point, 12);
  assert.equal(c.schemes.aqua.colors.candidate_back_color, '#00000000');
});

test('native aliases and runtime spacing corrections are reflected with provenance', () => {
  const c = resolveConfig(`patch:
  style/+:
    horizontal: true
    layout:
      border: 2
      hilited_corner_radius: 9
      hilite_padding: 7
      candidate_spacing: 1
      margin_x: 2
`, defaults);
  assert.equal(c.ok, true);
  assert.equal(c.style.layout.border_width, 2);
  assert.equal(c.style.layout.round_corner, 9);
  assert.equal(c.style.layout.hilite_padding_x, 7);
  assert.equal(c.style.layout.candidate_spacing, 14);
  assert.equal(c.style.layout.margin_x, 7);
  assert.equal(c.origins['style/layout/candidate_spacing'], 'derived');
});

test('a new scheme inherits runtime color fallbacks, not another theme colors', () => {
  const c = resolveConfig('patch:\n  style/color_scheme: blank\n  preset_color_schemes/blank:\n    text_color: 0x0000ff\n', defaults);
  assert.equal(c.ok, true);
  assert.equal(c.schemes.blank.colors.text_color, '#ff0000ff');
  assert.equal(c.schemes.blank.colors.candidate_text_color, '#ff0000ff');
  assert.equal(c.schemes.blank.colors.back_color, '#ffffffff');
  assert.equal(c.schemes.blank.colors.candidate_back_color, '#00000000');
  assert.equal(c.schemes.blank.origins.candidate_text_color, 'derived');
});

test('duplicate keys, malformed YAML, missing schemes and invalid value types fail', () => {
  for (const source of [
    'patch:\n  style/font_point: 14\n  style/font_point: 15',
    'patch: [',
    'patch:\n  style/color_scheme: missing',
    'patch:\n  style/font_point: nope',
    'patch:\n  style/horizontal: maybe',
    'patch:\n  style: hello',
    'style:\n  horizontal: true',
  ]) assert.equal(resolveConfig(source, defaults).ok, false, source);
});

test('invalid active colors fail but unselected schemes are independently diagnosed', () => {
  const source = 'patch:\n  preset_color_schemes/bad:\n    back_color: salmon\n';
  const c = resolveConfig(source, defaults);
  assert.equal(c.ok, true);
  assert.equal(c.schemes.bad.diagnostics[0].level, 'error');
  assert.equal(resolveConfig(source + '  style/color_scheme: bad\n', defaults).ok, false);
});

test('unsupported appearance is reported while app options stay quiet', () => {
  const c = resolveConfig(`patch:
  style/+: { unsupported_look: 42 }
  app_options/+: { editor.exe: { ascii_mode: true } }
`, defaults);
  assert.equal(c.ok, true);
  assert.equal(c.diagnostics.filter((d) => d.code === 'unsupported').length, 1);
  assert.equal(c.diagnostics[0].path, 'style/unsupported_look');
});

test('patch paths cannot traverse prototypes', () => {
  const c = resolveConfig('patch:\n  __proto__/polluted: yes\n', defaults);
  assert.equal(c.ok, false);
  assert.equal(({} as Record<string, unknown>).polluted, undefined);
});

test('empty patch supports builtin themes and both product schemes are usable', async () => {
  const empty = resolveConfig('patch: {}', defaults);
  assert.equal(empty.ok, true);
  assert.ok(empty.schemes[empty.selected.light]);
  const sample = resolveConfig(await readFile(new URL('../../../skins/fluent-2/weasel.custom.yaml', import.meta.url), 'utf8'), defaults);
  assert.equal(sample.ok, true);
  assert.equal(sample.selected.dark, 'fluent_dark');
  assert.equal(sample.schemes.fluent_light.diagnostics.length, 0);
});

test('custom scene validation rejects duplicates, invalid index and nontext fields', () => {
  const scene = { id: 'one', name: 'One', preedit: 'ni', highlighted: 0, candidates: [{ text: '你' }] };
  assert.equal(validateScenes([scene]).diagnostics.length, 0);
  for (const value of [[], [scene, scene], [{ ...scene, highlighted: 5 }], [{ ...scene, candidates: [{ text: '你', comment: 42 }] }]]) assert.ok(validateScenes(value).diagnostics.length);
});

// Native contracts: librime 1.13.1 config_compiler.cc / config_types.h;
// Weasel 0.17.4 RimeWithWeasel.cpp::_RimeGetColor / LoadWeaselUIStyle.
test('patch keys follow native map ordering, including overlapping assignments', () => {
  for (const source of [
    'patch:\n  style/font_point: 24\n  style/+: { font_point: 12 }\n',
    'patch:\n  style/+: { font_point: 12 }\n  style/font_point: 24\n',
  ]) assert.equal(resolveConfig(source, defaults).style.font_point, 24);
});

test('string append, force replacement and null map merges follow native operators', () => {
  const appended = resolveConfig('patch:\n  style/font_face/+: ", Noto Sans"\n', defaults);
  assert.equal(appended.style.font_face, 'Microsoft YaHei, Noto Sans');
  const replaced = resolveConfig('patch:\n  style/+:\n    layout/=: { margin_x: 20 }\n', defaults);
  assert.equal(replaced.style.layout.margin_x, 20);
  assert.equal(replaced.style.layout.min_width, 0);
  const unchanged = resolveConfig('patch:\n  style/+: { layout: null, font_point: null }\n', defaults);
  assert.equal(unchanged.style.font_point, 14);
  assert.equal(unchanged.style.layout.min_width, 160);
  assert.equal(resolveConfig('patch:\n  style/font_face/+: [not-a-string]\n', defaults).ok, false);
});

test('merge-tree keys are literal nodes, not accidentally interpreted as paths', () => {
  const c = resolveConfig('patch:\n  style/+:\n    layout/margin_x: 99\n', defaults);
  assert.equal(c.style.layout.margin_x, 12);
  assert.ok(c.diagnostics.some((d) => d.code === 'unsupported'));
});

test('missing window corner radius falls back to round_corner', () => {
  const c = resolveConfig('patch:\n  style:\n    color_scheme: aqua\n    layout: { round_corner: 12 }\n', defaults);
  assert.equal(c.style.layout.corner_radius, 12);
  assert.equal(c.origins['style/layout/corner_radius'], 'derived');
});

test('native decimal colors are made opaque and seven hex digits preserve alpha', () => {
  assert.equal(rimeColor(287454020, 'rgba'), '#223344ff');
  assert.equal(rimeColor('287454020', 'rgba'), '#223344ff');
  assert.equal(rimeColor(0x10223344, 'argb'), '#223344ff');
  assert.equal(rimeColor('0x1234567', 'argb'), '#23456701');
  assert.equal(rimeColor('0x1234567', 'abgr'), '#67452301');
  assert.equal(rimeColor('0x1234567', 'rgba'), '#01234567');
});

test('replaced style uses native empty-family and disabled-secondary-font defaults', () => {
  const c = resolveConfig('patch:\n  style: { color_scheme: aqua }\n', defaults);
  assert.equal(c.style.font_face, '');
  assert.equal(c.style.font_point, 12);
  assert.equal(c.style.label_font_point, 0);
  assert.equal(c.style.comment_font_point, 0);
  const negative = resolveConfig('patch:\n  style: { color_scheme: aqua, font_point: -20 }\n', defaults);
  assert.equal(negative.style.font_point, 12);
  assert.equal(negative.style.label_font_point, 20);
  assert.equal(negative.style.comment_font_point, 20);
});

test('null aliases fall through to the alternative native keys', () => {
  const c = resolveConfig(`patch:
  style/layout:
    border: null
    border_width: 3
    hilited_corner_radius: null
    round_corner: 9
    hilite_padding_x: null
    hilite_padding: 5
`, defaults);
  assert.equal(c.style.layout.border_width, 3);
  assert.equal(c.style.layout.round_corner, 9);
  assert.equal(c.style.layout.hilite_padding_x, 5);
  assert.equal(rimeColor('0xff1122334455', 'argb'), '#112233ff');
});

test('font-range diagnostics distinguish numeric ranges from multiple style tokens', () => {
  const weightOnly = resolveConfig('patch:\n  style/font_face: "Noto Sans:semi_bold:italic"\n', defaults);
  assert.ok(!weightOnly.diagnostics.some((d) => d.code === 'font-range'));
  const numericRange = resolveConfig('patch:\n  style/font_face: "Noto Sans:30"\n', defaults);
  assert.ok(numericRange.diagnostics.some((d) => d.code === 'font-range'));
  const scene = { id: 'one', name: 'One', preedit: 'ni', highlighted: 0, candidates: [{ text: '你' }] };
  assert.ok(validateScenes([{ ...scene, commitPreview: 123 }]).diagnostics.length);
  assert.ok(validateScenes([{ ...scene, candidates: Array.from({ length: 101 }, () => ({ text: '字' })) }]).diagnostics.length);
});
