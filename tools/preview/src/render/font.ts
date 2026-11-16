import type { TextStyles } from '../core/render-plan';

export function applyFont(node: HTMLElement, font: TextStyles['text']) {
  Object.assign(node.style, { fontFamily: font.css, fontWeight: String(font.weight), fontStyle: font.style, fontSize: `${font.point}pt`,
    lineHeight: font.lineMetrics ? `${font.lineMetrics.height}px` : 'normal' });
}
