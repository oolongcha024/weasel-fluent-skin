import type { Style } from '../core/types';
import { fontSpec } from './fonts';

/** Reserve the marker before laying out the label, as the native frontend does.
 * Native reference: WeaselUI/StandardLayout.cpp::_CalcMarkMetrics.
 * The six-pixel minimum is in device pixels, after layout DPI scaling.
 * Browser font metrics remain an approximation of DirectWrite.
 */
export function markMetrics(style: Style, enabled: boolean) {
  if (!enabled) return { slot: 0, thickness: 0 };
  const density = window.devicePixelRatio || 1;
  const font = fontSpec(style.font_face);
  const context = document.createElement('canvas').getContext('2d')!;
  const fontSize = style.font_point * 96 / 72;
  context.font = `${font.style} ${font.weight} ${fontSize}px ${font.css}`;
  const textWidth = context.measureText(style.mark_text || '|').width;
  const textHeight = fontSize * 1.35; // Same line box used by the DOM renderer.
  const extent = style.vertical_text ? textWidth : textHeight;
  if (style.mark_text) {
    const advance = style.vertical_text ? textHeight : textWidth;
    return { slot: Math.ceil(advance * density) / density + style.layout.hilite_spacing, thickness: 0 };
  }
  const thickness = Math.max(6, Math.floor(Math.ceil(extent * density) / 7)) / density;
  return { slot: thickness, thickness };
}
