import type { TextMeasurement, TextTypography } from '../core/geometry';
import type { TextStyles } from '../core/render-plan';

const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

/** Let the browser choose whole-word breaks, keeping emoji/ZWJ clusters intact. */
function wrappedLines(probe: HTMLElement, node: Text, count: number, vertical: boolean, reverse: boolean) {
  if (count === 1) return [node.data];
  const box = probe.getBoundingClientRect();
  const pitch = (vertical ? box.width : box.height) / count;
  const range = document.createRange(), lines = Array.from({ length: count }, () => '');
  let reference: number | undefined, explicitLine = 0;
  for (const { segment, index } of graphemes.segment(node.data)) {
    if (segment === '\n' || segment === '\r\n') { explicitLine++; continue; }
    range.setStart(node, index); range.setEnd(node, index + segment.length);
    const rect = range.getClientRects()[0];
    if (!rect) continue;
    const center = vertical ? reverse ? box.right - (rect.left + rect.right) / 2 : (rect.left + rect.right) / 2 - box.left
      : (rect.top + rect.bottom) / 2 - box.top;
    reference ??= center - explicitLine * pitch;
    const line = Math.max(0, Math.min(count - 1, Math.round((center - reference) / pitch)));
    lines[line] += segment;
  }
  return lines;
}

/** Fixed line boxes, independently positioned glyph baselines and native overhang reserves. */
export function measureUniformText(probe: HTMLElement, text: string, font: TextStyles['text'], density: number,
  vertical: boolean, reverse: boolean, canvas: CanvasRenderingContext2D): TextMeasurement {
  const metrics = font.lineMetrics!;
  const node = document.createTextNode(text);
  const marker = document.createElement('span');
  Object.assign(marker.style, { display: 'inline-block', width: '0', height: '0', lineHeight: '0', verticalAlign: 'baseline' });
  probe.replaceChildren(node, marker);
  const box = probe.getBoundingClientRect();
  const count = Math.max(1, Math.round((vertical ? box.width : box.height) / metrics.height));
  const values = wrappedLines(probe, node, count, vertical, reverse);
  Object.assign(probe.style, { whiteSpace: 'pre', maxWidth: 'none', maxHeight: 'none' });
  canvas.font = `${font.style} ${font.weight} ${font.point}pt ${font.css}`;
  const lines: TextTypography['lines'] = [];
  let advance = 0, inkLeft = Infinity, inkRight = -Infinity, inkTop = Infinity, inkBottom = -Infinity;
  for (const [index, value] of values.entries()) {
    node.data = value;
    const cell = probe.getBoundingClientRect(), caret = marker.getBoundingClientRect();
    const range = document.createRange(); range.selectNodeContents(node);
    const glyph = range.getBoundingClientRect();
    const inlineSize = value ? vertical ? glyph.height : glyph.width : 0;
    const naturalBaseline = vertical ? reverse ? cell.right - caret.left : caret.left - cell.left : caret.top - cell.top;
    const shift = (metrics.baseline - naturalBaseline) * (vertical && reverse ? -1 : 1);
    const cross = (vertical && reverse ? count - index - 1 : index) * metrics.height;
    const rect = vertical ? { x: cross, y: 0, width: metrics.height, height: inlineSize }
      : { x: 0, y: cross, width: inlineSize, height: metrics.height };
    const offset = { x: vertical ? shift : 0, y: vertical ? 0 : shift };
    advance = Math.max(advance, inlineSize);
    if (value) {
      if (vertical) {
        // DOM vertical glyph cells include the browser's mixed orientation and
        // fallback. Their cross-axis ink bounds approximate DirectWrite overhang.
        inkLeft = Math.min(inkLeft, cross + glyph.left - cell.left + shift);
        inkRight = Math.max(inkRight, cross + glyph.right - cell.left + shift);
        inkTop = Math.min(inkTop, glyph.top - cell.top);
        inkBottom = Math.max(inkBottom, glyph.bottom - cell.top);
      } else {
        const ink = canvas.measureText(value);
        inkLeft = Math.min(inkLeft, -ink.actualBoundingBoxLeft);
        inkRight = Math.max(inkRight, ink.actualBoundingBoxRight);
        inkTop = Math.min(inkTop, cross + metrics.baseline - ink.actualBoundingBoxAscent);
        inkBottom = Math.max(inkBottom, cross + metrics.baseline + ink.actualBoundingBoxDescent);
      }
    }
    lines.push({ text: value, rect: { x: rect.x * density, y: rect.y * density, width: rect.width * density, height: rect.height * density },
      offset: { x: offset.x * density, y: offset.y * density } });
  }
  const width = (vertical ? count * metrics.height : advance) * density;
  const height = (vertical ? advance : count * metrics.height) * density;
  const positive = (n: number) => n > 1e-6 ? n : 0;
  const overhang = { left: positive(-inkLeft * density), right: positive(inkRight * density - width),
    top: positive(-inkTop * density), bottom: positive(inkBottom * density - height) };
  const reserve = (n: number) => n ? Math.trunc(n + 1) : 0;
  return { width: Math.ceil(width - 1e-6) + reserve(overhang.left) + reserve(overhang.right),
    height: Math.ceil(height - 1e-6) + reserve(overhang.top) + reserve(overhang.bottom),
    typography: { width, height, lineHeight: metrics.height * density, baseline: metrics.baseline * density, overhang, lines } };
}
