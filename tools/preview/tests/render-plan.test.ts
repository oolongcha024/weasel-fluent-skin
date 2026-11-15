import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolveConfig } from '../src/core/config';
import { readYaml } from '../src/core/yaml';
import { buildRenderPlan } from '../src/core/render-plan';
import type { Scene } from '../src/core/scenes';

const defaults = readYaml(await readFile(new URL('../data/weasel-defaults.yaml', import.meta.url), 'utf8')).data;
const source = `patch:
  style/+:
    color_scheme: paint
    color_scheme_dark: null
    horizontal: false
    inline_preedit: false
    font_face: 'Noto Sans:semi_bold'
    layout:
      border_width: 1
      shadow_radius: 8
      shadow_offset_x: 0
      shadow_offset_y: 0
  preset_color_schemes/paint:
    color_format: argb
    shadow_color: 0x40000000
    candidate_shadow_color: 0x80000000
    hilited_candidate_shadow_color: 0x60000000
    prevpage_color: 0xFF112233
    nextpage_color: 0xFF445566
`;
const scene: Scene = { id: 'test', name: 'Test', preedit: 'abc', highlighted: 0, candidates: [{ text: '甲' }, { text: '乙' }, { text: '丙' }] };
const measure = (text: string) => ({ width: text.length * 12, height: 20 });

test('paint plan owns native background pass order and the complete ring/offset shadow input', () => {
  for (const offset of [0, 4]) {
    const config = resolveConfig(source.replace('shadow_offset_y: 0', `shadow_offset_y: ${offset}`), defaults);
    const plan = buildRenderPlan({ style: config.style, scheme: config.schemes.paint, scene }, measure, 1.5);
    assert.deepEqual(plan.backgrounds.map((pass) => `${pass.kind}:${pass.target}${pass.kind === 'surface' && pass.index !== undefined ? ':' + pass.index : ''}`),
      ['shadow:window', 'surface:window', 'shadow:candidate:1', 'shadow:candidate:2', 'surface:candidate:1', 'surface:candidate:2', 'shadow:candidate:0', 'surface:candidate:0']);
    const shadows = plan.backgrounds.filter((pass) => pass.kind === 'shadow');
    for (const pass of shadows) {
      assert.equal(pass.shadow.kind, offset ? 'offset' : 'ring');
      assert.deepEqual(pass.shadow.sigma, { x: 12, y: 12 });
      assert.equal(pass.shadow.shapes.length, offset ? 1 : 12);
      assert.equal(pass.shadow.shapes[0].fill === 'none', !offset);
    }
    assert.equal(plan.fonts.text.weight, 600);
    assert.equal(plan.candidates[0].texts.find((t) => t.kind === 'text')!.color, config.schemes.paint.colors.hilited_candidate_text_color);
    assert.equal(plan.candidates[1].texts.find((t) => t.kind === 'text')!.color, config.schemes.paint.colors.candidate_text_color);
    assert.deepEqual(JSON.parse(JSON.stringify(plan)), plan, 'the agent inspection contract is serializable');
  }
});

test('pager colors and inline preedit are resolved before the DOM adapter', () => {
  const config = resolveConfig(source, defaults);
  const input = { style: config.style, scheme: config.schemes.paint, scene: { ...scene, currentPage: 0, isLastPage: true } };
  const plan = buildRenderPlan(input, measure);
  assert.ok(plan.preedit!.pages.every((t) => t.color === config.schemes.paint.colors.text_color));
  const next = buildRenderPlan({ ...input, scene: { ...scene, currentPage: 1, isLastPage: false } }, measure);
  assert.deepEqual(next.preedit!.pages.map((t) => t.color), [config.schemes.paint.colors.prevpage_color, config.schemes.paint.colors.nextpage_color]);
  const inline = buildRenderPlan({ ...input, style: { ...config.style, inline_preedit: true } }, measure);
  assert.equal(inline.preedit, null); assert.equal(inline.editorText, scene.preedit);
});
