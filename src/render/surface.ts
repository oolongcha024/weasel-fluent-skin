import type { Rect, RoundShape } from '../core/geometry';
import type { ShadowSpec } from '../core/shadow';

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
/** SVG adapter: native shadow decisions and numbers have already been planned. */
export function shadowSurface(spec: ShadowSpec, density: number): SVGElement {
  const { canvas, sigma } = spec;
  const root = svgElement('svg', { xmlns: svgNS, viewBox: `0 0 ${canvas.width} ${canvas.height}`, width: canvas.width / density, height: canvas.height / density, 'aria-hidden': 'true' });
  root.classList.add('ime-shadow');
  Object.assign(root.style, { left: `${canvas.x / density}px`, top: `${canvas.y / density}px`, overflow: 'hidden' });
  const id = `ime-blur-${nextFilter++}`;
  const defs = svgElement('defs', {});
  const filter = svgElement('filter', { id, filterUnits: 'userSpaceOnUse', x: 0, y: 0, width: canvas.width, height: canvas.height, 'color-interpolation-filters': 'sRGB' });
  filter.append(svgElement('feGaussianBlur', { stdDeviation: `${sigma.x} ${sigma.y}` }));
  defs.append(filter); root.append(defs);
  const group = svgElement('g', { filter: `url(#${id})` });
  for (const shape of spec.shapes) group.append(svgElement('rect', { ...shape.box, rx: shape.rx, ry: shape.ry, fill: shape.fill,
    ...(shape.stroke ? { stroke: shape.stroke, 'stroke-opacity': shape.opacity!, 'stroke-width': 1 } : {}),
  }));
  root.dataset.kind = spec.kind;
  root.append(group); return root;
}
