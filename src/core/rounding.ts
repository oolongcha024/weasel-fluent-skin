import type { PreviewGeometry, Rect, RoundShape } from './geometry';
import type { Style } from './config-model';

export const roundShape = (radius: number): RoundShape => ({ radius, corners: [true, true, true, true], hemispherical: false });

// StandardLayout compares the inflated highlight path to the window path inset
// by one device pixel. Test the convex round-rectangle boundary against that
// region. The sampled ellipses avoid depending on Windows GDI+ region objects.
function protrudes(box: Rect, radius: number, window: Rect, outerRadius: number): boolean {
  const rx = Math.min(radius, Math.trunc(box.width / 2)), ry = Math.min(radius, Math.trunc(box.height / 2));
  const wx = Math.min(outerRadius, Math.trunc(window.width / 2)), wy = Math.min(outerRadius, Math.trunc(window.height / 2));
  const inside = (x: number, y: number) => {
    if (x < window.x || y < window.y || x > window.x + window.width || y > window.y + window.height) return false;
    if (!wx || !wy) return true;
    const dx = Math.max(window.x + wx - x, x - (window.x + window.width - wx), 0);
    const dy = Math.max(window.y + wy - y, y - (window.y + window.height - wy), 0);
    return dx * dx / (wx * wx) + dy * dy / (wy * wy) <= 1 + 1e-9;
  };
  for (const [cx, cy, start] of [
    [box.x + rx, box.y + ry, Math.PI], [box.x + box.width - rx, box.y + ry, 1.5 * Math.PI],
    [box.x + box.width - rx, box.y + box.height - ry, 0], [box.x + rx, box.y + box.height - ry, .5 * Math.PI],
  ]) {
    for (let i = 0; i <= 64; i++) {
      const angle = start + i * Math.PI / 128;
      if (!inside(cx + rx * Math.cos(angle), cy + ry * Math.sin(angle))) return true;
    }
  }
  return false;
}

/** StandardLayout::_PrepareRoundInfo and the horizontal/wrapped adjustments. */
export function prepareRounding(g: PreviewGeometry, style: Style) {
  const l = g.layout, candidates = g.candidates, count = candidates.length;
  const window = { x: 1, y: 1, width: g.width - 2, height: g.height - 2 };
  const over = (box: Rect) => protrudes(box, l.round_corner, window, l.corner_radius);
  const expanded = (box: Rect): Rect => ({ x: box.x - l.hilite_padding_x, y: box.y - l.hilite_padding_y,
    width: box.width + 2 * l.hilite_padding_x, height: box.height + 2 * l.hilite_padding_y });
  const textOver = !!g.preedit && over(expanded(g.preedit.bounds));
  const firstOver = count > 0 && over(candidates[0].background);
  const adjustedRadius = l.corner_radius - (l.border_width % 2 ? Math.trunc(l.border_width / 2) : 0);
  const shape = (hemispherical: boolean, corners: RoundShape['corners']): RoundShape => ({
    radius: hemispherical ? adjustedRadius : l.round_corner, corners: hemispherical ? corners : [true, true, true, true], hemispherical,
  });
  if (g.preedit) {
    let corners: RoundShape['corners'] = style.vertical_text ? [!count, true, false, false] : [true, false, false, !count];
    if (style.vertical_text && style.vertical_text_left_to_right) corners = [corners[1], corners[0], corners[3], corners[2]];
    g.preedit.rounding = shape(textOver, corners);
  }
  if (textOver || firstOver) {
    for (const c of candidates) {
      const first = c.index === 0, last = c.index === count - 1;
      let corners: RoundShape['corners'];
      if (style.vertical_text) {
        corners = [last && (count > 1 || style.inline_preedit), first && (count > 1 ? style.inline_preedit : true),
          first && (count > 1 ? style.inline_preedit : true), last && (count > 1 || style.inline_preedit)];
        if (style.vertical_text_left_to_right && count > 1 && (last || (first && style.inline_preedit))) corners = corners.map((v) => !v) as RoundShape['corners'];
      } else if (style.horizontal) corners = [first && style.inline_preedit, last && style.inline_preedit, last, first];
      else corners = [first && style.inline_preedit, first && style.inline_preedit, last, last];
      c.rounding = shape(over(c.background), corners);
    }
  }
  const rowCount = Math.max(...candidates.map((c) => c.row));
  if (!style.vertical_text && style.horizontal && rowCount > 0) {
    const a = candidates[0].rounding, b = candidates[count - 1].rounding;
    a.corners[3] = false; b.corners[1] = false;
    candidates.forEach((c, i) => {
      c.rounding.hemispherical = a.hemispherical;
      c.rounding.radius = a.hemispherical ? adjustedRadius : l.round_corner;
      if (c.row === rowCount && i && candidates[i - 1].row === rowCount - 1) c.rounding.corners[3] = true;
      if (c.row === 0 && candidates[i + 1]?.row === 1) c.rounding.corners[1] = style.inline_preedit;
      if (!a.hemispherical) c.rounding.corners = [true, true, true, true];
    });
  }
  if (style.vertical_text && style.vertical_text_with_wrap) {
    candidates.forEach((c, i) => {
      const firstColumn = c.row === 0, lastColumn = c.row === rowCount;
      const left = style.vertical_text_left_to_right;
      let [tl, tr, br, bl] = c.rounding.corners;
      if (left ? lastColumn : firstColumn) { tr = false; br = false; }
      if (left ? firstColumn : lastColumn) { tl = false; bl = false; }
      if (i === 0) { if (left) tl = style.inline_preedit; else tr = style.inline_preedit; if (!rowCount) { if (left) tr = true; else tl = true; } }
      if (i === count - 1) { if (left) br = true; else bl = true; if (!rowCount) { if (left) bl = style.inline_preedit; else br = style.inline_preedit; } }
      if (lastColumn && rowCount && candidates[i - 1]?.row === rowCount - 1) { if (left) tr = true; else tl = true; }
      if (firstColumn && rowCount && candidates[i + 1]?.row === 1) { if (left) bl = style.inline_preedit; else br = style.inline_preedit; }
      c.rounding = shape(firstOver, [tl, tr, br, bl]);
    });
  }
}
