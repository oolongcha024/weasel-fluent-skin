import type { Colors, Style } from '../../src/core/config-model';
import type { Scene } from '../../src/core/scenes';
import type { MeasureText, Rect, PreviewGeometry } from '../../src/core/geometry';

export interface NativeCase { type: number; style: Style; colors: Colors; scene: Scene; input: string; measurements: Record<string, number[]> }
export interface NativeRectangles { width: number; height: number; preedit: number[]; candidates: { bounds: number[]; label: number[]; text: number[]; comment: number[] }[] }

export function nativeCases(base: Style, baseColors: Colors, count: number, seed: number,
  reference: { measurements: Record<string, number[]>; largeMeasurements: Record<string, number[]>; uniformSettings: number[][] }): NativeCase[] {
  const rand = (n: number) => Math.floor(((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296) * n);
  return Array.from({ length: count }, (_, k) => {
    const type = Math.min(k % 4, 2), wrap = k % 4 === 3;
    const style = structuredClone(base), l = style.layout;
    Object.assign(style, { horizontal: type === 0, vertical_text: type === 2, vertical_text_left_to_right: !!rand(2), inline_preedit: !!rand(2), vertical_text_with_wrap: wrap,
      label_format: '%s', label_font_point: rand(4) ? 12 : 0, comment_font_point: rand(4) ? 12 : 0 });
    Object.assign(l, { margin_x: rand(15) + 6, margin_y: rand(15) + 6, spacing: rand(12) + 6, candidate_spacing: rand(16) + 4,
      hilite_spacing: rand(8) + 2, hilite_padding_x: 2, hilite_padding_y: 2, min_width: rand(2) ? 0 : rand(250), min_height: rand(2) ? 0 : rand(150),
      max_width: rand(2) ? 0 : rand(100) + 100, max_height: wrap ? rand(120) + 80 : 0, border_width: rand(3), shadow_radius: rand(2) ? 0 : rand(20),
      shadow_offset_x: rand(5) - 2, shadow_offset_y: rand(5) - 2, align_type: ['top', 'center', 'bottom'][rand(3)] });
    const mark = !!rand(2), page = !!rand(2);
    const colors: Colors = { ...baseColors, hilited_mark_color: mark ? '#111111ff' : '#00000000', prevpage_color: page ? '#111111ff' : '#00000000', nextpage_color: page ? '#111111ff' : '#00000000' };
    const scene: Scene = { id: 'reference', name: 'Reference', preedit: 'abcd', highlighted: 0,
      candidates: Array.from({ length: rand(4) + 1 }, (_, i) => ({ text: 'x'.repeat(rand(4) + 1), label: String(i + 1), ...(rand(2) ? { comment: 'c'.repeat(rand(4) + 1) } : {}) })) };
    scene.highlighted = rand(scene.candidates.length);
    [l.linespacing, l.baseline] = reference.uniformSettings[k % reference.uniformSettings.length];
    const measurements = k % 5 ? reference.measurements : reference.largeMeasurements;
    const input = [type, scene.candidates.length, scene.highlighted, +style.inline_preedit, +style.vertical_text_left_to_right, +style.vertical_text_with_wrap,
      +!!style.label_font_point, +!!style.comment_font_point, l.margin_x, l.margin_y, l.spacing, l.candidate_spacing, l.hilite_spacing, l.hilite_padding_x, l.hilite_padding_y,
      l.min_width, l.min_height, l.max_width, l.max_height, l.border_width, l.shadow_radius, l.shadow_offset_x, l.shadow_offset_y,
      ['top', 'center', 'bottom'].indexOf(l.align_type), l.linespacing, l.baseline,
      ...['text', 'label', 'comment'].flatMap((role) => measurements[role]),
      +mark, +page, scene.preedit, ...scene.candidates.flatMap((c) => [c.label, c.text, c.comment ?? '-'])].join(' ');
    return { type, style, colors, scene, input, measurements };
  });
}
export function fixedMeasurement(metrics: Record<string, number[]>): MeasureText {
  return (text, role) => ({ width: text.length * metrics[role][0], height: metrics[role][1] });
}
const rect = (r: Rect) => [r.x, r.y, r.width, r.height];
export function visibleRectangles(result: PreviewGeometry | NativeRectangles, fixture: NativeCase) {
  const native = !('density' in result);
  return { width: result.width, height: result.height,
    ...(!fixture.style.inline_preedit ? { preedit: native ? result.preedit : rect(result.preedit!.bounds) } : {}),
    candidates: result.candidates.map((c, index) => {
      if ('text' in c && Array.isArray(c.text)) {
        const n = c as NativeRectangles['candidates'][number];
        return { bounds: n.bounds, ...(fixture.style.label_font_point ? { label: n.label } : {}), text: n.text,
          ...(fixture.style.comment_font_point && fixture.scene.candidates[index].comment ? { comment: n.comment } : {}) };
      }
      const item = c as PreviewGeometry['candidates'][number];
      return { bounds: rect(item.bounds), ...(item.label ? { label: rect(item.label.rect) } : {}), text: rect(item.text.rect), ...(item.comment ? { comment: rect(item.comment.rect) } : {}) };
    }),
  };
}
