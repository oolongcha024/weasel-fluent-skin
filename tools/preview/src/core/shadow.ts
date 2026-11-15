import type { DeviceLayout } from './config-model';
import type { Rect } from './geometry';

export function shadowInsets(layout: DeviceLayout) {
  const radius = layout.shadow_radius;
  const { shadow_offset_x: dx, shadow_offset_y: dy } = layout;
  const buffer = radius ? 2 * radius - (dx || dy ? Math.trunc(radius / 2) : 0) : 0;
  return { x: buffer + (radius ? Math.abs(dx) : 0) + 2 * layout.border_width,
    y: buffer + (radius ? Math.abs(dy) : 0) + 2 * layout.border_width };
}
export interface ShadowShape { box: Rect; rx: number; ry: number; fill: string; stroke?: string; opacity?: number }
export interface ShadowSpec { kind: 'offset' | 'ring'; canvas: Rect; sigma: { x: number; y: number }; shapes: ShadowShape[] }

/** Native blur input and extent, independent of SVG/DOM painting. */
export function planShadow(box: Rect, color: string, layout: DeviceLayout, corner = layout.round_corner): ShadowSpec | null {
  const alpha = parseInt(color.slice(-2), 16), radius = layout.shadow_radius;
  if (!alpha || !radius || box.width <= 0 || box.height <= 0) return null;
  const { shadow_offset_x: dx, shadow_offset_y: dy } = layout;
  const { x: ox, y: oy } = shadowInsets(layout);
  const width = box.width + 2 * ox, height = box.height + 2 * oy;
  const base = { x: ox + dx, y: oy + dy, width: box.width, height: box.height };
  const shapes: ShadowShape[] = [];
  if (dx || dy) shapes.push({ box: base, rx: Math.min(corner, Math.trunc(box.width / 2)), ry: Math.min(corner, Math.trunc(box.height / 2)), fill: color });
  else {
    const step = Math.trunc(Math.trunc(alpha / radius) / 2);
    for (let i = 0; i < radius; i++) shapes.push({
      box: { x: base.x - i, y: base.y - i, width: base.width + 2 * i, height: base.height + 2 * i },
      rx: Math.min(corner + i + 1, Math.trunc((base.width + 2 * i) / 2)),
      ry: Math.min(corner + i + 1, Math.trunc((base.height + 2 * i) / 2)),
      fill: 'none', stroke: color.slice(0, -2), opacity: (alpha - Math.max(i - 1, 0) * step) / 255,
    });
  }
  return { kind: dx || dy ? 'offset' : 'ring', canvas: { x: box.x - ox, y: box.y - oy, width, height },
    sigma: { x: Math.min(radius, Math.trunc(width / 2)), y: Math.min(radius, Math.trunc(height / 2)) }, shapes };
}
