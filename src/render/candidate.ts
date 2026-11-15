import type { BrowserReport, ConfigResult, Diagnostic, Scene, Scheme } from '../core/types';
import { calculateLayout, type PreviewGeometry, type Rect, type TextRole, type TextRun } from '../core/layout';
import { availableFonts, fontSpec } from './fonts';
import './candidate.css';

const geometries = new WeakMap<HTMLElement, PreviewGeometry>();
const redraw = new WeakMap<HTMLElement, () => void>();
const element = (tag: string, className: string, text?: string) => {
  const node = document.createElement(tag); node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
function setFont(node: HTMLElement, raw: string, point: number) {
  const spec = fontSpec(raw);
  Object.assign(node.style, { fontFamily: spec.css, fontWeight: String(spec.weight), fontStyle: spec.style, fontSize: `${point}pt` });
}

function draw(root: HTMLElement, config: ConfigResult, scheme: Scheme, scene: Scene) {
  const s = config.style, colors = scheme.colors, density = window.devicePixelRatio || 1;
  const vertical = s.vertical_text;
  const roleFont = (role: TextRole): [string, number] => role === 'label' ? [s.label_font_face, s.label_font_point]
    : role === 'comment' ? [s.comment_font_face, s.comment_font_point] : [s.font_face, s.font_point];
  // Measure real browser font line boxes; the layout backend consumes integer
  // device-pixel sizes just like the native frontend's DirectWrite backend.
  const probe = element('span', 'ime-measure');
  document.body.append(probe);
  const cache = new Map<string, { width: number; height: number }>();
  const measure = (text: string, role: TextRole) => {
    const key = `${role}:${text}`;
    if (cache.has(key)) return cache.get(key)!;
    setFont(probe, ...roleFont(role));
    const limit = vertical ? s.layout.max_height : s.layout.max_width;
    Object.assign(probe.style, { writingMode: vertical ? 'vertical-rl' : 'horizontal-tb',
      maxWidth: !vertical && limit ? `${Math.trunc(limit * density) / density}px` : 'none',
      maxHeight: vertical && limit ? `${Math.trunc(limit * density) / density}px` : 'none',
      whiteSpace: limit ? 'pre-wrap' : 'pre', overflowWrap: limit ? 'anywhere' : 'normal' });
    probe.textContent = text || '\u200b';
    const box = probe.getBoundingClientRect();
    const size = { width: Math.ceil(box.width * density - 1e-6), height: Math.ceil(box.height * density - 1e-6) };
    cache.set(key, size); return size;
  };
  let geometry: PreviewGeometry;
  try { geometry = calculateLayout(s, colors, scene, measure, density); }
  finally { probe.remove(); }
  geometries.set(root, geometry);
  const l = geometry.layout;
  const px = (n: number) => `${n / density}px`;
  const place = (node: HTMLElement, box: Rect, relative?: Rect) => Object.assign(node.style, {
    left: px(box.x - (relative?.x ?? 0)), top: px(box.y - (relative?.y ?? 0)),
    width: px(Math.max(0, box.width)), height: px(Math.max(0, box.height)),
  });
  const shadow = (key: string) => l.shadow_radius > 0 ? `${px(l.shadow_offset_x)} ${px(l.shadow_offset_y)} ${px(l.shadow_radius)} ${colors[key]}` : 'none';
  const stroke = (node: HTMLElement, color: string) => {
    // Native strokes paint around a rectangle without consuming layout space.
    node.style.outline = `${px(l.border_width)} solid ${color}`;
    node.style.outlineOffset = px(-l.border_width / 2);
  };
  const win = element('div', 'ime-window');
  win.setAttribute('role', 'listbox'); win.setAttribute('aria-label', '小狼毫候选窗口');
  win.dataset.layout = vertical ? 'vertical-text' : s.horizontal ? 'horizontal' : 'vertical';
  win.dataset.density = String(density);
  setFont(win, s.font_face, s.font_point);
  Object.assign(win.style, { width: px(geometry.width), height: px(geometry.height),
    backgroundColor: colors.back_color, color: colors.candidate_text_color,
    borderRadius: px(l.corner_radius), boxShadow: shadow('shadow_color') });
  if (s.layout.margin_x < 0 || s.layout.margin_y < 0) win.style.display = 'none';
  const content = element('div', 'ime-content');
  content.style.borderRadius = px(l.corner_radius);
  const textNode = (item: TextRun, className: string, color: string, relative?: Rect) => {
    const node = element('span', className, item.text);
    setFont(node, ...roleFont(item.role)); place(node, item.rect, relative);
    node.style.color = colors[color];
    node.style.writingMode = vertical ? 'vertical-rl' : 'horizontal-tb';
    if (vertical ? s.layout.max_height : s.layout.max_width) {
      node.style.whiteSpace = 'pre-wrap'; node.style.overflowWrap = 'anywhere';
    }
    return node;
  };
  if (geometry.preedit) {
    const pre = geometry.preedit;
    const header = element('div', 'ime-header');
    const composition = element('div', 'ime-preedit'); place(composition, pre.bounds);
    if (pre.background) {
      const surface = element('span', 'ime-preedit-surface');
      place(surface, pre.background, pre.bounds);
      surface.style.backgroundColor = colors.hilited_back_color;
      surface.style.borderRadius = px(l.round_corner); surface.style.boxShadow = shadow('hilited_shadow_color');
      composition.append(surface);
    }
    for (const item of pre.runs) composition.append(textNode(item, item.highlighted ? 'ime-preedit-highlight' : 'ime-preedit-plain', item.highlighted ? 'hilited_text_color' : 'text_color', pre.bounds));
    header.append(composition);
    if (geometry.pages) {
      const pages = element('span', 'ime-pager');
      pages.append(textNode({ text: '<', role: 'text', rect: geometry.pages.previous }, 'ime-page', scene.currentPage ? 'prevpage_color' : 'text_color'),
        textNode({ text: '>', role: 'text', rect: geometry.pages.next }, 'ime-page', scene.isLastPage ? 'text_color' : 'nextpage_color'));
      header.append(pages);
    }
    content.append(header);
  }
  const candidates = element('div', 'ime-candidates');
  for (const item of geometry.candidates) {
    const on = item.index === scene.highlighted;
    const candidate = element('div', 'ime-candidate'); place(candidate, item.bounds);
    candidate.dataset.row = String(item.row);
    candidate.setAttribute('role', 'option'); candidate.setAttribute('aria-selected', String(on));
    const surface = element('span', 'ime-candidate-surface'); place(surface, item.background, item.bounds);
    surface.setAttribute('aria-hidden', 'true');
    surface.style.backgroundColor = colors[on ? 'hilited_candidate_back_color' : 'candidate_back_color'];
    surface.style.borderRadius = px(l.round_corner);
    stroke(surface, colors[on ? 'hilited_candidate_border_color' : 'candidate_border_color']);
    if (on) surface.style.boxShadow = shadow('hilited_candidate_shadow_color');
    candidate.append(surface);
    if (on && geometry.mark) {
      const mark = element('span', geometry.mark.text ? 'ime-mark-text' : 'ime-mark', geometry.mark.text);
      mark.setAttribute('aria-hidden', 'true'); place(mark, geometry.mark.rect, item.bounds);
      if (geometry.mark.text) { setFont(mark, s.font_face, s.font_point); mark.style.color = colors.hilited_mark_color; mark.style.writingMode = vertical ? 'vertical-rl' : 'horizontal-tb'; }
      else { mark.style.backgroundColor = colors.hilited_mark_color; mark.style.borderRadius = px(Math.trunc((vertical ? geometry.mark.rect.height : geometry.mark.rect.width) / 2)); }
      candidate.append(mark);
    }
    if (item.label) candidate.append(textNode(item.label, 'ime-label', on ? 'hilited_label_color' : 'label_color', item.bounds));
    candidate.append(textNode(item.text, 'ime-text', on ? 'hilited_candidate_text_color' : 'candidate_text_color', item.bounds));
    if (item.comment) candidate.append(textNode(item.comment, 'ime-comment', on ? 'hilited_comment_text_color' : 'comment_text_color', item.bounds));
    candidates.append(candidate);
  }
  content.append(candidates); win.append(content);
  const border = element('div', 'ime-window-border'); border.style.borderRadius = px(l.corner_radius); stroke(border, colors.border_color); win.append(border);
  root.replaceChildren();
  if (s.inline_preedit) {
    let preeditText = scene.preedit;
    if (s.preedit_type === 'preview') preeditText = scene.candidates[scene.highlighted].text;
    if (s.preedit_type === 'preview_all') preeditText = scene.candidates.map((c) => c.text).join(' ');
    const editor = element('div', 'ime-editorline');
    editor.append(document.createTextNode('今天，试着写下 '), element('span', 'ime-inline-composition', preeditText), element('span', 'ime-caret'));
    root.append(editor);
  }
  root.append(win);
}

export function renderCandidate(config: ConfigResult, scheme: Scheme, scene: Scene): HTMLElement {
  const root = element('div', 'ime-preview'); root.dataset.scheme = scheme.id; root.dataset.scene = scene.id;
  const render = () => draw(root, config, scheme, scene);
  redraw.set(root, render); render(); return root;
}

/** Re-measure after browser fonts are ready, keeping the selected UI state. */
export function refreshCandidateLayout(root: HTMLElement) { redraw.get(root)?.(); }

export function inspectRender(root: HTMLElement, config: ConfigResult, scheme: Scheme, scene: Scene, sha256: string): BrowserReport {
  const fonts = [...new Set([config.style.font_face, config.style.label_font_face, config.style.comment_font_face])].flatMap(availableFonts);
  const diagnostics: Diagnostic[] = [...config.diagnostics, ...scheme.diagnostics];
  for (const font of fonts.filter((f) => !f.available)) {
    if (!diagnostics.some((d) => d.code === 'missing-font' && d.path === font.requested)) diagnostics.push({ level: 'warning', code: 'missing-font', path: font.requested, message: `此环境未检测到字体「${font.requested}」，实际显示使用回退字体。` });
  }
  const win = root.querySelector<HTMLElement>('.ime-window');
  const box = win && win.style.display !== 'none' ? win.getBoundingClientRect() : null;
  const bounds = box ? { x: box.x, y: box.y, width: box.width, height: box.height } : null;
  const viewport = { width: innerWidth, height: innerHeight, devicePixelRatio };
  if (bounds && (bounds.x < 0 || bounds.y < 0 || bounds.x + bounds.width > innerWidth || bounds.y + bounds.height > innerHeight)) diagnostics.push({ level: 'warning', code: 'outside-viewport', message: '候选窗口超出了当前视口；截图可能不完整。' });
  return { sha256, scheme: scheme.id, scene: scene.id, colors: scheme.colors, fonts, bounds, viewport, diagnostics, html: root.outerHTML, geometry: geometries.get(root) ?? null };
}
