import type { Rect } from '../core/geometry';
import type { PlannedLine, PlannedText, RenderPlan } from '../core/render-plan';
import { borderRadius, shadowSurface } from './surface';
import { applyFont } from './font';

const element = (tag: string, className: string, text?: string) => {
  const node = document.createElement(tag); node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

/** DOM adapter. Paint order, text, fonts and surface rules come from the plan. */
export function paintCandidate(plan: RenderPlan, scheme: string, scene: string): HTMLElement {
  const root = element('div', 'ime-preview'); root.dataset.scheme = scheme; root.dataset.scene = scene;
  const { geometry, fonts } = plan, density = geometry.density;
  const px = (n: number) => `${n / density}px`;
  const place = (node: HTMLElement, box: Rect, relative?: Rect) => Object.assign(node.style, {
    left: px(box.x - (relative?.x ?? 0)), top: px(box.y - (relative?.y ?? 0)),
    width: px(Math.max(0, box.width)), height: px(Math.max(0, box.height)),
  });
  const win = element('div', 'ime-window');
  win.setAttribute('role', 'listbox'); win.setAttribute('aria-label', '小狼毫候选窗口');
  win.dataset.layout = plan.writingMode === 'horizontal-tb' ? plan.horizontal ? 'horizontal' : 'vertical' : 'vertical-text';
  win.dataset.density = String(density);
  applyFont(win, fonts.text);
  Object.assign(win.style, { width: px(geometry.width), height: px(geometry.height) });
  if (plan.hidden) win.style.display = 'none';
  const backgrounds = element('div', 'ime-backgrounds');
  for (const pass of plan.backgrounds) {
    if (pass.kind === 'shadow') { backgrounds.append(shadowSurface(pass.shadow, density)); continue; }
    const surface = element(pass.target === 'window' ? 'div' : 'span', `ime-${pass.target === 'window' ? 'window' : pass.target}-surface`);
    place(surface, pass.box);
    if (pass.index !== undefined) { surface.dataset.index = String(pass.index); surface.setAttribute('aria-hidden', 'true'); }
    surface.style.backgroundColor = pass.fill;
    surface.style.borderRadius = borderRadius(pass.box, pass.rounding, density);
    if (pass.stroke) { surface.style.outline = `${px(pass.stroke.width)} solid ${pass.stroke.color}`; surface.style.outlineOffset = px(-pass.stroke.width / 2); }
    backgrounds.append(surface);
  }
  const content = element('div', 'ime-content');
  const glyphs = (node: HTMLElement, lines: PlannedLine[]) => {
    node.textContent = '';
    node.style.alignContent = 'normal';
    for (const line of lines) {
      const child = element('span', 'ime-line', line.text);
      place(child, line.rect);
      child.style.lineHeight = px(line.lineHeight);
      node.append(child);
    }
  };
  const textNode = (item: PlannedText, relative?: Rect) => {
    const node = element('span', `ime-${item.kind}`, item.text);
    applyFont(node, fonts[item.role]); place(node, item.rect, relative);
    Object.assign(node.style, { color: item.color, writingMode: plan.writingMode, textOrientation: 'mixed',
      ...(plan.wrap ? { whiteSpace: 'pre-wrap', overflowWrap: 'normal', wordBreak: 'normal' } : {}),
    });
    if (item.lines) glyphs(node, item.lines);
    return node;
  };
  if (plan.preedit) {
    const pre = plan.preedit, header = element('div', 'ime-header');
    const composition = element('div', 'ime-preedit'); place(composition, pre.bounds);
    for (const item of pre.texts) composition.append(textNode(item, pre.bounds));
    header.append(composition);
    if (pre.pages.length) { const pages = element('span', 'ime-pager'); pages.append(...pre.pages.map((item) => textNode(item))); header.append(pages); }
    content.append(header);
  }
  const candidates = element('div', 'ime-candidates');
  for (const item of plan.candidates) {
    const candidate = element('div', 'ime-candidate'); place(candidate, item.bounds);
    candidate.dataset.row = String(item.row);
    candidate.setAttribute('role', 'option'); candidate.setAttribute('aria-selected', String(item.selected));
    if (item.selected && plan.mark) {
      const { mark } = plan;
      const node = element('span', mark.text ? 'ime-mark-text' : 'ime-mark', mark.text);
      node.setAttribute('aria-hidden', 'true'); place(node, mark.rect, item.bounds);
      if (mark.text) {
        applyFont(node, fonts.text); node.style.color = mark.color; node.style.writingMode = plan.writingMode;
        if (mark.lines) glyphs(node, mark.lines);
      }
      else { node.style.backgroundColor = mark.color; node.style.borderRadius = px(mark.radius); }
      candidate.append(node);
    }
    for (const text of item.texts) candidate.append(textNode(text, item.bounds));
    candidates.append(candidate);
  }
  content.append(candidates); win.append(backgrounds, content);
  if (plan.editorText !== null) {
    const editor = element('div', 'ime-editorline');
    editor.append(document.createTextNode('今天，试着写下 '), element('span', 'ime-inline-composition', plan.editorText), element('span', 'ime-caret'));
    root.append(editor);
  }
  root.append(win); return root;
}
