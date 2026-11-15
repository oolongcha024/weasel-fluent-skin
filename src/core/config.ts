import { composite, rimeColor } from './color';
import { applyPatch, flatten, pathSegment } from './patch';
import { isMap, readYaml } from './yaml';
import type { ConfigResult, Diagnostic, Dict, Layout, Origin, Scheme, Style } from './types';

const STYLE_RUNTIME = {
  font_face: '', label_font_face: '', comment_font_face: '',
  font_point: 12, label_font_point: 0, comment_font_point: 0,
  horizontal: false, vertical_text: false, vertical_text_left_to_right: false, vertical_text_with_wrap: false,
  inline_preedit: false, preedit_type: 'composition', label_format: '%s.',
  mark_text: '', candidate_abbreviate_length: 0,
  layout: {
    min_width: 0, min_height: 0, max_width: 0, max_height: 0,
    margin_x: 0, margin_y: 0, border_width: 0, spacing: 0, candidate_spacing: 0,
    hilite_spacing: 0, hilite_padding_x: 0, hilite_padding_y: 0,
    corner_radius: 0, round_corner: 0, shadow_radius: 0,
    shadow_offset_x: 0, shadow_offset_y: 0, align_type: 'bottom',
  },
} as const;

const COLOR_FALLBACKS: Record<string, string | string[]> = {
  back_color: '#ffffffff', text_color: '#000000ff', shadow_color: '#00000000',
  prevpage_color: '#00000000', nextpage_color: '#00000000',
  candidate_text_color: ['text_color'], candidate_back_color: '#00000000',
  border_color: ['text_color'], hilited_text_color: ['text_color'],
  hilited_back_color: ['back_color'], hilited_candidate_text_color: ['hilited_text_color'],
  hilited_candidate_back_color: ['hilited_back_color'],
  candidate_border_color: '#00000000', hilited_candidate_border_color: '#00000000',
  candidate_shadow_color: '#00000000', hilited_candidate_shadow_color: '#00000000',
  hilited_shadow_color: '#00000000',
  label_color: ['candidate_text_color', 'candidate_back_color'],
  hilited_label_color: ['hilited_candidate_text_color', 'hilited_candidate_back_color'],
  comment_text_color: ['label_color'], hilited_comment_text_color: ['hilited_label_color'],
  hilited_mark_color: '#00000000',
};

function resolveScheme(id: string, raw: Dict, allOrigins: Record<string, Origin>): Scheme {
  const diagnostics: Diagnostic[] = [];
  const format = raw.color_format === undefined ? 'abgr' : String(raw.color_format);
  const validFormat = format === 'abgr' || format === 'argb' || format === 'rgba';
  if (!validFormat) diagnostics.push({ level: 'error', code: 'color-format', path: `preset_color_schemes/${id}/color_format`, message: `不支持颜色格式 ${format}。` });
  const colors: Record<string, string> = {}, origins: Record<string, Origin> = {};
  for (const [key, fallback] of Object.entries(COLOR_FALLBACKS)) {
    const path = `preset_color_schemes/${pathSegment(id)}/${pathSegment(key)}`;
    if (raw[key] !== undefined) {
      try { colors[key] = rimeColor(raw[key], validFormat ? format : 'abgr'); }
      catch (e) { diagnostics.push({ level: 'error', code: 'color', path, message: `${key}：${(e as Error).message}` }); }
      origins[key] = allOrigins[path] ?? 'user';
    }
    if (!colors[key]) {
      colors[key] = typeof fallback === 'string' ? fallback
        : fallback.length === 1 ? colors[fallback[0]] : composite(colors[fallback[0]], colors[fallback[1]]);
      origins[key] = typeof fallback === 'string' ? 'runtime' : 'derived';
    }
  }
  for (const key of Object.keys(raw)) {
    const path = `preset_color_schemes/${pathSegment(id)}/${pathSegment(key)}`;
    if (!(key in COLOR_FALLBACKS) && !['name', 'author', 'color_format'].includes(key) && allOrigins[path] === 'user') {
      diagnostics.push({ level: 'warning', code: 'unsupported', path, message: `尚未支持配色字段 ${key}，未用于渲染。` });
    }
  }
  return { id, name: String(raw.name ?? id), author: String(raw.author ?? ''),
    format: validFormat ? format : 'abgr', colors, origins, diagnostics };
}

export function resolveConfig(source: string, defaults: Dict): ConfigResult {
  const parsed = readYaml(source);
  const diagnostics = [...parsed.diagnostics];
  for (const path of Object.keys(flatten(parsed.data))) {
    if (!path.startsWith('patch/') && (path.includes('__include') || path.includes('__patch'))) diagnostics.push({ level: 'warning', code: 'dependency', path, message: '未解析此跨文件依赖，预览仅使用当前补丁及内置默认配置。' });
  }
  if (!isMap(parsed.data.patch)) diagnostics.push({ level: 'error', code: 'patch', path: 'patch', message: '需要带有 patch: 字典的 weasel.custom.yaml。' });
  const applied = applyPatch(defaults, isMap(parsed.data.patch) ? parsed.data.patch : {});
  diagnostics.push(...applied.diagnostics);
  const { merged, origins } = applied;
  const values = flatten(merged);
  const runtime = flatten({ style: STYLE_RUNTIME });

  const get = (path: string, fallback?: unknown): unknown => {
    if (Object.hasOwn(values, path) && values[path] !== null) return values[path];
    origins[path] = fallback === undefined ? 'runtime' : 'derived';
    return fallback ?? runtime[path];
  };
  const number = (path: string, fallback?: number, signed = false): number => {
    const raw = get(path, fallback), n = Number(raw);
    if ((typeof raw !== 'string' && typeof raw !== 'number') || raw === '' || !Number.isInteger(n) || Math.abs(n) > 2147483647) {
      diagnostics.push({ level: 'error', code: 'number', path, message: `${path} 必须是 32 位整数。` });
      return 0;
    }
    if (!signed && n < 0) origins[path] = 'derived';
    return signed ? n : Math.abs(n);
  };
  const text = (path: string, fallback?: string): string => {
    const value = get(path, fallback);
    if (typeof value !== 'string' && typeof value !== 'number') {
      diagnostics.push({ level: 'error', code: 'string', path, message: `${path} 必须是字符串。` });
      return '';
    }
    return String(value);
  };
  const bool = (path: string): boolean => {
    const value = get(path);
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    diagnostics.push({ level: 'error', code: 'boolean', path, message: `${path} 应为 true 或 false。` });
    return false;
  };
  const enumValue = <T extends string>(path: string, choices: readonly T[], fallback: T): T => {
    const value = text(path, fallback);
    if (choices.includes(value as T)) return value as T;
    diagnostics.push({ level: 'error', code: 'enum', path, message: `${path} 应为 ${choices.join(' / ')}。` });
    return fallback;
  };

  const font = text('style/font_face');
  let point = number('style/font_point', undefined, true);
  if (point <= 0) { point = 12; origins['style/font_point'] = 'derived'; }
  const layout = {} as Layout;
  for (const key of Object.keys(STYLE_RUNTIME.layout) as (keyof Layout)[]) {
    if (key === 'align_type') continue;
    const signed = ['margin_x', 'margin_y', 'shadow_offset_x', 'shadow_offset_y'].includes(key);
    let alias: string | undefined;
    if (key === 'border_width' && values['style/layout/border'] != null) alias = 'border';
    if (key === 'round_corner' && values['style/layout/hilited_corner_radius'] != null) alias = 'hilited_corner_radius';
    if (key === 'corner_radius' && values['style/layout/corner_radius'] == null && values['style/layout/round_corner'] != null) alias = 'round_corner';
    if (key.startsWith('hilite_padding_') && values[`style/layout/${key}`] == null) alias = 'hilite_padding';
    const path = `style/layout/${key}`;
    layout[key] = alias && values[`style/layout/${alias}`] != null
      ? number(`style/layout/${alias}`, undefined, signed) : number(path, undefined, signed);
    if (alias) origins[path] = key === 'corner_radius' ? 'derived' : origins[`style/layout/${alias}`] ?? 'runtime';
  }
  layout.align_type = enumValue('style/layout/align_type', ['top', 'center', 'bottom'], 'bottom');
  const style: Style = {
    font_face: font,
    label_font_face: text('style/label_font_face', font) || font,
    comment_font_face: text('style/comment_font_face', font) || font,
    font_point: point,
    // Native fallback reads the raw font_point key, before its main-text <=0
    // correction. With neither key present the secondary fonts remain disabled.
    label_font_point: number('style/label_font_point', values['style/font_point'] != null ? Math.abs(Number(values['style/font_point'])) : undefined),
    comment_font_point: number('style/comment_font_point', values['style/font_point'] != null ? Math.abs(Number(values['style/font_point'])) : undefined),
    horizontal: bool('style/horizontal'), vertical_text: bool('style/vertical_text'),
    vertical_text_left_to_right: bool('style/vertical_text_left_to_right'),
    vertical_text_with_wrap: bool('style/vertical_text_with_wrap'),
    inline_preedit: bool('style/inline_preedit'),
    preedit_type: enumValue('style/preedit_type', ['composition', 'preview', 'preview_all'], 'composition'),
    label_format: text('style/label_format'), mark_text: text('style/mark_text'),
    candidate_abbreviate_length: number('style/candidate_abbreviate_length'), layout,
  };
  if (values['style/text_orientation'] === 'vertical') style.vertical_text = true;
  const type = String(values['style/layout/type'] ?? '');
  if (type) {
    if (type.startsWith('horizontal')) { style.horizontal = true; style.vertical_text = false; }
    else if (type.startsWith('vertical_text')) style.vertical_text = true;
    else if (type.startsWith('vertical')) { style.horizontal = false; style.vertical_text = false; }
    else diagnostics.push({ level: 'error', code: 'layout-type', path: 'style/layout/type', message: `不支持布局类型 ${type}。` });
  }
  // The native frontend expands spacing/margins to contain highlight padding.
  const normalize = (key: keyof Layout, value: number) => {
    if (layout[key] !== value) { (layout as unknown as Dict)[key] = value; origins[`style/layout/${key}`] = 'derived'; }
  };
  normalize('margin_x', (layout.margin_x < 0 ? -1 : 1) * Math.max(Math.abs(layout.margin_x), layout.hilite_padding_x));
  normalize('margin_y', (layout.margin_y < 0 ? -1 : 1) * Math.max(Math.abs(layout.margin_y), layout.hilite_padding_y));
  normalize('spacing', Math.max(layout.spacing, 2 * (style.vertical_text ? layout.hilite_padding_x : layout.hilite_padding_y)));
  normalize('candidate_spacing', Math.max(layout.candidate_spacing, 2 * (style.vertical_text || style.horizontal ? layout.hilite_padding_x : layout.hilite_padding_y)));
  if (!style.inline_preedit) normalize('hilite_spacing', Math.max(layout.hilite_spacing, style.vertical_text ? layout.hilite_padding_y : layout.hilite_padding_x));

  const supported = new Set(Object.keys(flatten({ style: STYLE_RUNTIME })));
  for (const k of ['color_scheme', 'color_scheme_dark', 'text_orientation', 'layout/type', 'layout/border', 'layout/hilite_padding', 'layout/hilited_corner_radius']) supported.add(`style/${k}`);
  const behaviorOnly = new Set(['display_tray_icon', 'ascii_tip_follow_cursor', 'enhanced_position', 'paging_on_scroll', 'click_to_capture', 'hover_type']);
  const inactiveUnsupported = new Set(['style/fullscreen', 'style/vertical_auto_reverse', 'style/layout/linespacing', 'style/layout/baseline']);
  for (const [path, value] of Object.entries(values)) {
    if (origins[path] !== 'user') continue;
    const inactive = inactiveUnsupported.has(path) && ['false', '0', '', false, 0, null].includes(value as never);
    if (path.startsWith('style/') && !supported.has(path) && !behaviorOnly.has(path.slice(6)) && !inactive) {
      diagnostics.push({ level: 'warning', code: 'unsupported', path, message: `尚未模拟 ${path}，当前预览未使用此设置。` });
    }
    if (path.includes('__include') || path.includes('__patch')) diagnostics.push({ level: 'warning', code: 'dependency', path, message: '未解析跨文件依赖，相关样式可能不完整。' });
  }
  if (type.includes('fullscreen')) diagnostics.push({ level: 'warning', code: 'unsupported', path: 'style/layout/type', message: '尚未模拟全屏候选窗口。' });
  if (layout.max_width || layout.max_height) diagnostics.push({ level: 'warning', code: 'approximation', path: 'style/layout', message: '候选行按原生矩形规则排列；单条文字的折行由浏览器测量，可能与 DirectWrite 不同。' });
  for (const key of ['font_face', 'label_font_face', 'comment_font_face'] as const) {
    if (style[key].split(',').some((f) => f.split(':').slice(1).some((part) => /^[\da-f]+$/i.test(part.trim())))) diagnostics.push({ level: 'warning', code: 'font-range', path: `style/${key}`, message: '字体码位范围未模拟；浏览器使用字体回退链。' });
  }
  if (!isMap(merged.style)) diagnostics.push({ level: 'error', code: 'style', path: 'style', message: 'style 必须是字典。' });
  const schemes: Record<string, Scheme> = Object.create(null);
  if (isMap(merged.preset_color_schemes)) {
    for (const [id, raw] of Object.entries(merged.preset_color_schemes)) {
      if (isMap(raw)) schemes[id] = resolveScheme(id, raw, origins);
      else diagnostics.push({ level: 'error', code: 'scheme', path: `preset_color_schemes/${id}`, message: '配色方案必须是字典。' });
    }
  }
  const light = String(values['style/color_scheme'] ?? 'aqua');
  const dark = values['style/color_scheme_dark'] ? String(values['style/color_scheme_dark']) : null;
  for (const id of new Set([light, dark].filter((s): s is string => !!s))) {
    if (!Object.hasOwn(schemes, id)) diagnostics.push({ level: 'error', code: 'missing-scheme', path: 'style/color_scheme', message: `找不到配色方案「${id}」。请在此文件定义它，或使用内置方案。` });
    else if (schemes[id].diagnostics.some((d) => d.level === 'error')) diagnostics.push(...schemes[id].diagnostics.filter((d) => d.level === 'error'));
  }
  return { ok: !diagnostics.some((d) => d.level === 'error'), style, schemes, selected: { light, dark }, origins, merged, diagnostics };
}
