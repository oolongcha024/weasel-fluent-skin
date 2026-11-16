import type { Diagnostic } from './diagnostics';
import type { Dict } from './yaml';

export type Origin = 'user' | 'default' | 'runtime' | 'derived';
export interface Layout<Units extends 'logical' | 'device' = 'logical'> {
  /** Type-only coordinate space: prevents feeding scaled values back as configuration. */
  readonly units?: Units;
  min_width: number; min_height: number; max_width: number; max_height: number;
  margin_x: number; margin_y: number; border_width: number;
  spacing: number; candidate_spacing: number; hilite_spacing: number;
  hilite_padding_x: number; hilite_padding_y: number;
  corner_radius: number; round_corner: number;
  shadow_radius: number; shadow_offset_x: number; shadow_offset_y: number;
  /** Font-size percentages, unchanged by device scaling. Both must be nonzero. */
  linespacing: number; baseline: number;
  align_type: 'top' | 'center' | 'bottom';
}
export interface Style {
  font_face: string; label_font_face: string; comment_font_face: string;
  font_point: number; label_font_point: number; comment_font_point: number;
  horizontal: boolean; vertical_text: boolean; vertical_text_left_to_right: boolean; vertical_text_with_wrap: boolean;
  inline_preedit: boolean; preedit_type: 'composition' | 'preview' | 'preview_all';
  label_format: string; mark_text: string; candidate_abbreviate_length: number;
  layout: Layout;
}
export interface Scheme {
  id: string;
  name: string;
  author: string;
  format: 'abgr' | 'argb' | 'rgba';
  colors: Colors;
  origins: Record<string, Origin>;
  diagnostics: Diagnostic[];
}
export interface ConfigResult {
  ok: boolean;
  diagnostics: Diagnostic[];
  style: Style;
  schemes: Record<string, Scheme>;
  selected: { light: string; dark: string | null };
  origins: Record<string, Origin>;
  merged: Dict;
}

export type DeviceLayout = Layout<'device'>;
export const COLOR_KEYS = ['back_color', 'text_color', 'shadow_color', 'prevpage_color', 'nextpage_color', 'candidate_text_color', 'candidate_back_color', 'border_color', 'hilited_text_color', 'hilited_back_color', 'hilited_candidate_text_color', 'hilited_candidate_back_color', 'candidate_border_color', 'hilited_candidate_border_color', 'candidate_shadow_color', 'hilited_candidate_shadow_color', 'hilited_shadow_color', 'label_color', 'hilited_label_color', 'comment_text_color', 'hilited_comment_text_color', 'hilited_mark_color'] as const;
export type ColorKey = typeof COLOR_KEYS[number];
export type Colors = Record<ColorKey, string>;
