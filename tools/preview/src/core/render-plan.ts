import type { Style, Scheme } from './config-model';
import type { Scene } from './scenes';
import { calculateLayout } from './layout';
import type { MeasureText, PreviewGeometry, Rect, RoundShape, TextRole, TextRun, TextTypography } from './geometry';
import { fontSpec, uniformLineMetrics } from './font';
import { preeditContent } from './text';
import { roundShape } from './rounding';
import { planShadow, type ShadowSpec } from './shadow';

export interface PreviewSelection { style: Style; scheme: Scheme; scene: Scene }
export type TextStyles = ReturnType<typeof textStyles>;
export function textStyles(style: Style) {
  const font = (raw: string, point: number) => ({ ...fontSpec(raw), requested: raw, point,
    lineMetrics: uniformLineMetrics(style.layout, point, style.vertical_text) });
  return { text: font(style.font_face, style.font_point), preedit: font(style.font_face, style.font_point),
    label: font(style.label_font_face, style.label_font_point), comment: font(style.comment_font_face, style.comment_font_point) };
}
/** Final line rectangles relative to their text node, in device pixels. */
export interface PlannedLine { text: string; rect: Rect; lineHeight: number }
interface PlannedTypography { typography?: TextTypography; lines?: PlannedLine[] }
export type PlannedText = TextRun & PlannedTypography & { color: string; kind: 'label' | 'text' | 'comment' | 'preedit-highlight' | 'preedit-plain' | 'page' };
export type BackgroundPass =
  | { kind: 'shadow'; target: string; shadow: ShadowSpec }
  | { kind: 'surface'; target: 'window' | 'preedit' | 'candidate'; index?: number; box: Rect; rounding: RoundShape; fill: string; stroke: { color: string; width: number } | null };
export interface RenderPlan {
  geometry: PreviewGeometry;
  fonts: TextStyles;
  writingMode: 'vertical-rl' | 'vertical-lr' | 'horizontal-tb';
  horizontal: boolean; wrap: boolean; hidden: boolean; editorText: string | null;
  backgrounds: BackgroundPass[];
  preedit: { bounds: Rect; texts: PlannedText[]; pages: PlannedText[] } | null;
  candidates: { index: number; row: number; bounds: Rect; selected: boolean; texts: PlannedText[] }[];
  mark: { rect: Rect; text: string; color: string; radius: number } & PlannedTypography | null;
}

/** The complete native paint contract. DOM and agent reports consume this same plan. */
export function buildRenderPlan({ style, scheme, scene }: PreviewSelection, measure: MeasureText, density = 1): RenderPlan {
  const geometry = calculateLayout(style, scheme.colors, scene, measure, density);
  const l = geometry.layout, colors = scheme.colors;
  const backgrounds: BackgroundPass[] = [];
  const shadow = (target: string, box: Rect, color: string, radius = l.round_corner) => {
    const spec = planShadow(box, color, l, radius);
    if (spec) backgrounds.push({ kind: 'shadow', target, shadow: spec });
  };
  const surface = (target: 'window' | 'preedit' | 'candidate', box: Rect, rounding: RoundShape, fill: string, border?: string, index?: number) => {
    backgrounds.push({ kind: 'surface', target, ...(index === undefined ? {} : { index }), box, rounding, fill, stroke: border ? { color: border, width: l.border_width } : null });
  };
  const windowBox = { x: 0, y: 0, width: geometry.width, height: geometry.height };
  shadow('window', windowBox, colors.shadow_color, l.corner_radius);
  surface('window', windowBox, roundShape(l.corner_radius), colors.back_color, colors.border_color);
  const pre = geometry.preedit;
  if (pre?.background) {
    shadow('preedit', pre.background, colors.hilited_shadow_color);
    surface('preedit', pre.background, pre.rounding, colors.hilited_back_color);
  }
  const ordinary = geometry.candidates.filter((c) => c.index !== scene.highlighted);
  for (const item of ordinary) shadow(`candidate:${item.index}`, item.background, colors.candidate_shadow_color);
  for (const item of [...ordinary, geometry.candidates[scene.highlighted]]) {
    const on = item.index === scene.highlighted;
    if (on) shadow(`candidate:${item.index}`, item.background, colors.hilited_candidate_shadow_color);
    surface('candidate', item.background, item.rounding, colors[on ? 'hilited_candidate_back_color' : 'candidate_back_color'], colors[on ? 'hilited_candidate_border_color' : 'candidate_border_color'], item.index);
  }
  const typography = (value: string, role: TextRole, box: Rect): PlannedTypography => {
    const result = measure(value, role).typography;
    if (!result) return {};
    const vertical = style.vertical_text;
    const x = vertical ? (box.width - result.width) / 2 : result.overhang.left;
    const y = vertical ? result.overhang.top : (box.height - result.height) / 2;
    return { typography: result, lines: result.lines.map((line) => ({
      text: line.text, lineHeight: result.lineHeight,
      rect: { ...line.rect, x: x + line.rect.x + line.offset.x, y: y + line.rect.y + line.offset.y },
    })) };
  };
  const text = (run: TextRun, kind: PlannedText['kind'], color: string): PlannedText => ({ ...run, kind, color, ...typography(run.text, run.role, run.rect) });
  return {
    geometry, fonts: textStyles(style),
    writingMode: style.vertical_text ? style.vertical_text_left_to_right ? 'vertical-lr' : 'vertical-rl' : 'horizontal-tb',
    horizontal: style.horizontal, wrap: !!(style.vertical_text ? l.max_height : l.max_width), hidden: style.layout.margin_x < 0 || style.layout.margin_y < 0,
    editorText: style.inline_preedit ? preeditContent(style, scene).text : null,
    backgrounds,
    preedit: pre ? { bounds: pre.bounds,
      texts: pre.runs.map((run) => text(run, run.highlighted ? 'preedit-highlight' : 'preedit-plain', colors[run.highlighted ? 'hilited_text_color' : 'text_color'])),
      pages: geometry.pages ? [text({ text: '<', role: 'preedit', rect: geometry.pages.previous }, 'page', colors[scene.currentPage ? 'prevpage_color' : 'text_color']),
        text({ text: '>', role: 'preedit', rect: geometry.pages.next }, 'page', colors[scene.isLastPage ? 'text_color' : 'nextpage_color'])] : [],
    } : null,
    candidates: geometry.candidates.map((c) => ({ index: c.index, row: c.row, bounds: c.bounds, selected: c.index === scene.highlighted,
      texts: [c.label ? text(c.label, 'label', colors[c.index === scene.highlighted ? 'hilited_label_color' : 'label_color']) : null,
        text(c.text, 'text', colors[c.index === scene.highlighted ? 'hilited_candidate_text_color' : 'candidate_text_color']),
        c.comment ? text(c.comment, 'comment', colors[c.index === scene.highlighted ? 'hilited_comment_text_color' : 'comment_text_color']) : null].filter((r): r is PlannedText => !!r),
    })),
    mark: geometry.mark ? { ...geometry.mark, ...(geometry.mark.text ? typography(geometry.mark.text, 'text', geometry.mark.rect) : {}), color: colors.hilited_mark_color,
      radius: Math.trunc((style.vertical_text ? geometry.mark.rect.height : geometry.mark.rect.width) / 2) } : null,
  };
}
