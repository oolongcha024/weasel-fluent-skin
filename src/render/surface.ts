import type { Layout } from '../core/types';
import type { Rect } from '../core/layout';
import type { RoundShape } from '../core/rounding';

export function borderRadius(box: Rect, shape: RoundShape, density: number): string {
  const rx = Math.max(0, Math.min(shape.radius, Math.trunc(box.width / 2))) / density;
  const ry = Math.max(0, Math.min(shape.radius, Math.trunc(box.height / 2))) / density;
  return `${shape.corners.map((on) => `${on ? rx : 0}px`).join(' ')} / ${shape.corners.map((on) => `${on ? ry : 0}px`).join(' ')}`;
}

const svgNS = 'http://www.w3.org/2000/svg';
let nextFilter = 0;
function svgElement(tag: string, attributes: Record<string, string | number>) {
  const node = document.createElementNS(svgNS, tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  return node;
}

/** WeaselPanel::_HighlightText uses a filled offset shadow, or concentric
 * one-pixel outlines when both offsets are zero, then Gaussian blur with sigma
 * shadow_radius. SVG keeps that model in exported HTML as well as screenshots.
 */
export function shadowSurface(box: Rect, color: string, layout: Layout, density: number, corner = layout.round_corner): SVGElement | null {
  const alpha = parseInt(color.slice(-2), 16), radius = layout.shadow_radius;
  if (!alpha || !radius || box.width <= 0 || box.height <= 0) return null;
  const { shadow_offset_x: dx, shadow_offset_y: dy } = layout;
  const buffer = 2 * radius - (dx || dy ? Math.trunc(radius / 2) : 0);
  const ox = Math.abs(dx) + buffer + 2 * layout.border_width, oy = Math.abs(dy) + buffer + 2 * layout.border_width;
  const width = box.width + 2 * ox, height = box.height + 2 * oy;
  const root = svgElement('svg', { xmlns: svgNS, viewBox: `0 0 ${width} ${height}`, width: width / density, height: height / density, 'aria-hidden': 'true' });
  root.classList.add('ime-shadow');
  Object.assign(root.style, { left: `${(box.x - ox) / density}px`, top: `${(box.y - oy) / density}px`, overflow: 'hidden' });
  const id = `ime-blur-${nextFilter++}`;
  const defs = svgElement('defs', {});
  const filter = svgElement('filter', { id, filterUnits: 'userSpaceOnUse', x: 0, y: 0, width, height, 'color-interpolation-filters': 'sRGB' });
  filter.append(svgElement('feGaussianBlur', { stdDeviation: `${Math.min(radius, Math.trunc(width / 2))} ${Math.min(radius, Math.trunc(height / 2))}` }));
  defs.append(filter); root.append(defs);
  const group = svgElement('g', { filter: `url(#${id})` });
  const base = { x: ox + dx, y: oy + dy, width: box.width, height: box.height };
  if (dx || dy) {
    group.append(svgElement('rect', { ...base, rx: Math.min(corner, Math.trunc(box.width / 2)), ry: Math.min(corner, Math.trunc(box.height / 2)), fill: color }));
  } else {
    const step = Math.trunc(Math.trunc(alpha / radius) / 2);
    for (let i = 0; i < radius; i++) {
      const a = alpha - Math.max(i - 1, 0) * step;
      group.append(svgElement('rect', { x: base.x - i, y: base.y - i, width: base.width + 2 * i, height: base.height + 2 * i,
        rx: Math.min(corner + i + 1, Math.trunc((base.width + 2 * i) / 2)),
        ry: Math.min(corner + i + 1, Math.trunc((base.height + 2 * i) / 2)),
        fill: 'none', stroke: color.slice(0, -2), 'stroke-opacity': a / 255, 'stroke-width': 1 }));
    }
  }
  root.dataset.kind = dx || dy ? 'offset' : 'ring';
  root.append(group); return root;
}
