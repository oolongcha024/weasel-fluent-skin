import type { PreviewGeometry } from './layout';

export type Dict = Record<string, unknown>;
export type Origin = 'user' | 'default' | 'runtime' | 'derived';
export interface Diagnostic {
  level: 'error' | 'warning';
  code: string;
  message: string;
  path?: string;
  line?: number;
}
export interface Layout {
  min_width: number; min_height: number; max_width: number; max_height: number;
  margin_x: number; margin_y: number; border_width: number;
  spacing: number; candidate_spacing: number; hilite_spacing: number;
  hilite_padding_x: number; hilite_padding_y: number;
  corner_radius: number; round_corner: number;
  shadow_radius: number; shadow_offset_x: number; shadow_offset_y: number;
  align_type: 'top' | 'center' | 'bottom';
}
export interface Style {
  font_face: string; label_font_face: string; comment_font_face: string;
  font_point: number; label_font_point: number; comment_font_point: number;
  horizontal: boolean; vertical_text: boolean; vertical_text_left_to_right: boolean;
  inline_preedit: boolean; preedit_type: 'composition' | 'preview' | 'preview_all';
  label_format: string; mark_text: string; candidate_abbreviate_length: number;
  layout: Layout;
}
export interface Scheme {
  id: string;
  name: string;
  author: string;
  format: 'abgr' | 'argb' | 'rgba';
  colors: Record<string, string>;
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
export interface Candidate { text: string; comment?: string; label?: string }
export interface Scene {
  id: string; name: string; preedit: string; highlightedPreedit?: string;
  highlighted: number; candidates: Candidate[];
  currentPage?: number; isLastPage?: boolean;
}
export interface InputSnapshot {
  file: string;
  source: string;
  sha256: string;
  readAt: string;
  defaults: { commit: string; sha256: string; configVersion: string; url: string };
  config: ConfigResult;
  scenes: Scene[];
  scenesSha256: string;
}
export interface BrowserReport {
  sha256: string;
  scheme: string;
  scene: string;
  colors: Record<string, string>;
  fonts: { requested: string; available: boolean; css: string }[];
  bounds: { x: number; y: number; width: number; height: number } | null;
  viewport: { width: number; height: number; devicePixelRatio: number };
  diagnostics: Diagnostic[];
  html: string;
  geometry: PreviewGeometry | null;
}
