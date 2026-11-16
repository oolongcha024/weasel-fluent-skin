import type { Style } from '../core/config-model';
import type { MeasureText, TextMeasurement } from '../core/geometry';
import { textStyles } from '../core/render-plan';
import { applyFont } from './font';
import { measureUniformText } from './uniform';

/** Browser adapter at the same measurement seam used by native-reference fixtures. */
export function withMeasurements<T>(style: Style, density: number, build: (measure: MeasureText) => T): T {
  const fonts = textStyles(style);
  const probe = document.createElement('span'); probe.className = 'ime-measure';
  document.body.append(probe);
  const cache = new Map<string, TextMeasurement>();
  let canvas: CanvasRenderingContext2D | null = null;
  const vertical = style.vertical_text;
  const measure: MeasureText = (text, role) => {
    const key = `${role}:${text}`;
    if (cache.has(key)) return cache.get(key)!;
    applyFont(probe, fonts[role]);
    const limit = vertical ? style.layout.max_height : style.layout.max_width;
    Object.assign(probe.style, { writingMode: vertical ? style.vertical_text_left_to_right ? 'vertical-lr' : 'vertical-rl' : 'horizontal-tb',
      maxWidth: !vertical && limit ? `${Math.trunc(limit * density) / density}px` : 'none',
      maxHeight: vertical && limit ? `${Math.trunc(limit * density) / density}px` : 'none',
      whiteSpace: limit ? 'pre-wrap' : 'pre', overflowWrap: 'normal', wordBreak: 'normal' });
    if (fonts[role].lineMetrics) {
      canvas ??= document.createElement('canvas').getContext('2d')!;
      const size = measureUniformText(probe, text, fonts[role], density, vertical, !style.vertical_text_left_to_right, canvas);
      cache.set(key, size); return size;
    }
    probe.textContent = text || '\u200b';
    const box = probe.getBoundingClientRect();
    const range = document.createRange(); range.selectNodeContents(probe);
    const textBox = range.getBoundingClientRect();
    const size = { width: Math.ceil((vertical ? box.width : textBox.width) * density - 1e-6),
      height: Math.ceil((vertical ? textBox.height : box.height) * density - 1e-6) };
    cache.set(key, size); return size;
  };
  try { return build(measure); } finally { probe.remove(); }
}
