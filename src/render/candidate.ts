import type { BrowserReport, ConfigResult, Diagnostic, Scene, Scheme } from '../core/types';
import { availableFonts, fontSpec } from './fonts';
import { markMetrics } from './mark';
import './candidate.css';

const element = (tag: string, className: string, text?: string) => {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

function setFont(node: HTMLElement, raw: string, point: number) {
  const spec = fontSpec(raw);
  Object.assign(node.style, { fontFamily: spec.css, fontWeight: String(spec.weight), fontStyle: spec.style, fontSize: `${point}pt` });
}

export function renderCandidate(config: ConfigResult, scheme: Scheme, scene: Scene): HTMLElement {
  const s = config.style, l = s.layout, c = scheme.colors;
  const root = element('div', 'ime-preview');
  root.dataset.scheme = scheme.id;
  root.dataset.scene = scene.id;
  const win = element('div', 'ime-window');
  win.setAttribute('role', 'listbox');
  win.setAttribute('aria-label', '小狼毫候选窗口');
  win.dataset.layout = s.vertical_text ? 'vertical-text' : s.horizontal ? 'horizontal' : 'vertical';
  setFont(win, s.font_face, s.font_point);
  const color = (key: string) => c[key];
  const shadow = (key: string) => l.shadow_radius > 0 ? `${l.shadow_offset_x}px ${l.shadow_offset_y}px ${l.shadow_radius}px ${color(key)}` : 'none';
  Object.assign(win.style, {
    backgroundColor: color('back_color'), color: color('candidate_text_color'),
    border: `${l.border_width}px solid ${color('border_color')}`,
    borderRadius: `${l.corner_radius}px`, boxShadow: shadow('shadow_color'),
    padding: `${Math.abs(l.margin_y)}px ${Math.abs(l.margin_x)}px`,
    minWidth: `${l.min_width}px`, minHeight: `${l.min_height}px`,
    maxWidth: l.max_width ? `${l.max_width}px` : 'none',
    maxHeight: l.max_height ? `${l.max_height}px` : 'none',
  });
  if (l.margin_x < 0 || l.margin_y < 0) win.style.display = 'none';
  win.style.setProperty('--px', `${l.hilite_padding_x}px`);
  win.style.setProperty('--py', `${l.hilite_padding_y}px`);
  win.style.setProperty('--item-gap', `${l.candidate_spacing}px`);
  win.style.setProperty('--inner-gap', `${l.hilite_spacing}px`);
  win.style.setProperty('--align', l.align_type === 'top' ? 'start' : l.align_type === 'bottom' ? 'end' : 'center');
  const markEnabled = c.hilited_mark_color.slice(-2) !== '00';
  const mark = markMetrics(s, markEnabled);
  win.style.setProperty('--mark-slot', `${mark.slot}px`);
  win.style.setProperty('--mark-thickness', `${mark.thickness}px`);
  win.style.setProperty('--mark-height-adjustment', `${2 * (l.hilite_padding_y - l.round_corner)}px`);
  win.style.setProperty('--mark-height-padding', `${2 * l.hilite_padding_y * .618}px`);
  win.style.setProperty('--mark-width-adjustment', `${2 * (l.hilite_padding_x - l.round_corner)}px`);
  win.style.setProperty('--mark-width-padding', `${2 * l.hilite_padding_x * .618}px`);

  let preeditText = scene.preedit;
  if (s.preedit_type === 'preview') preeditText = scene.candidates[scene.highlighted].text;
  if (s.preedit_type === 'preview_all') preeditText = scene.candidates.map((item) => item.text).join(' ');
  const preedit = element('div', 'ime-preedit');
  setFont(preedit, s.font_face, s.font_point);
  preedit.style.color = color('text_color');
  const highlight = s.preedit_type === 'composition' ? scene.highlightedPreedit : preeditText;
  const start = highlight ? preeditText.indexOf(highlight) : -1;
  if (start >= 0 && highlight) {
    preedit.append(document.createTextNode(preeditText.slice(0, start)));
    const selected = element('span', 'ime-preedit-highlight', highlight);
    Object.assign(selected.style, { color: color('hilited_text_color'), backgroundColor: color('hilited_back_color'),
      boxShadow: shadow('hilited_shadow_color'), borderRadius: `${l.round_corner}px` });
    preedit.append(selected, document.createTextNode(preeditText.slice(start + highlight.length)));
  } else preedit.textContent = preeditText;

  if (!s.inline_preedit) {
    const header = element('div', 'ime-header');
    header.style.marginBottom = s.vertical_text ? '0' : `${l.spacing}px`;
    const pager = element('span', 'ime-pager');
    setFont(pager, s.comment_font_face, s.comment_font_point);
    for (const [glyph, key] of [['‹', 'prevpage_color'], ['›', 'nextpage_color']]) {
      if (color(key).slice(-2) === '00') continue;
      const arrow = element('span', '', glyph); arrow.style.color = color(key); pager.append(arrow);
    }
    header.append(preedit);
    if (pager.childElementCount) header.append(pager);
    win.append(header);
  }

  const candidates = element('div', 'ime-candidates');
  const hasLabels = s.label_font_point > 0;
  const hasComments = s.comment_font_point > 0 && scene.candidates.some((item) => !!item.comment);
  if (!s.horizontal && !s.vertical_text) {
    candidates.style.gridTemplateColumns = [hasLabels ? 'max-content' : '', 'max-content', hasComments ? 'max-content' : ''].filter(Boolean).join(' ');
  }
  if (l.max_width) candidates.style.flexWrap = 'wrap';
  for (const [index, item] of scene.candidates.entries()) {
    const on = scene.highlighted === index;
    const candidate = element('div', 'ime-candidate');
    candidate.setAttribute('role', 'option');
    candidate.setAttribute('aria-selected', String(on));
    const surface = element('span', 'ime-candidate-surface');
    surface.setAttribute('aria-hidden', 'true');
    Object.assign(surface.style, {
      backgroundColor: color(on ? 'hilited_candidate_back_color' : 'candidate_back_color'),
      borderRadius: `${l.round_corner}px`, boxShadow: shadow(on ? 'hilited_candidate_shadow_color' : 'candidate_shadow_color'),
      border: `${l.border_width}px solid ${color(on ? 'hilited_candidate_border_color' : 'candidate_border_color')}`,
    });
    candidate.append(surface);
    if (on && markEnabled) {
      const mark = element('span', s.mark_text ? 'ime-mark-text' : 'ime-mark', s.mark_text);
      mark.setAttribute('aria-hidden', 'true');
      if (s.mark_text) mark.style.color = color('hilited_mark_color');
      else mark.style.backgroundColor = color('hilited_mark_color');
      candidate.append(mark);
    }
    const label = element('span', 'ime-label', s.label_format.replace(/%s/g, item.label ?? String(index + 1)));
    setFont(label, s.label_font_face, s.label_font_point);
    label.style.color = color(on ? 'hilited_label_color' : 'label_color');
    label.style.gridColumn = '1';
    let displayText = item.text;
    if (s.candidate_abbreviate_length > 0 && [...displayText].length > s.candidate_abbreviate_length) displayText = [...displayText].slice(0, s.candidate_abbreviate_length).join('') + '…';
    const text = element('span', 'ime-text', displayText);
    text.style.color = color(on ? 'hilited_candidate_text_color' : 'candidate_text_color');
    text.style.gridColumn = hasLabels ? '2' : '1';
    const comment = element('span', 'ime-comment', item.comment ?? '');
    setFont(comment, s.comment_font_face, s.comment_font_point);
    comment.style.color = color(on ? 'hilited_comment_text_color' : 'comment_text_color');
    comment.style.gridColumn = hasLabels ? '3' : '2';
    if (hasLabels) candidate.append(label);
    candidate.append(text);
    if (hasComments && (item.comment || (!s.horizontal && !s.vertical_text))) candidate.append(comment);
    candidates.append(candidate);
  }
  if (s.vertical_text) {
    win.style.flexDirection = s.vertical_text_left_to_right ? 'row' : 'row-reverse';
    win.style.columnGap = `${l.spacing}px`;
    candidates.style.flexDirection = s.vertical_text_left_to_right ? 'row' : 'row-reverse';
  }
  win.append(candidates);
  if (s.inline_preedit) {
    const editor = element('div', 'ime-editorline');
    editor.append(document.createTextNode('今天，试着写下 '), element('span', 'ime-inline-composition', preeditText), element('span', 'ime-caret'));
    root.append(editor);
  }
  root.append(win);
  return root;
}

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
  if (bounds && (bounds.x < 0 || bounds.y < 0 || bounds.x + bounds.width > innerWidth || bounds.y + bounds.height > innerHeight)) {
    diagnostics.push({ level: 'warning', code: 'outside-viewport', message: '候选窗口超出了当前视口；截图可能不完整。' });
  }
  return { sha256, scheme: scheme.id, scene: scene.id, colors: scheme.colors, fonts, bounds, viewport, diagnostics, html: root.outerHTML };
}
