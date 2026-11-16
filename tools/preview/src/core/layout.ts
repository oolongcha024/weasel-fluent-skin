import type { Layout, DeviceLayout, Colors, Style } from './config-model';
import type { Scene } from './scenes';
import { abbreviate, candidateLabel, formatLabel, preeditContent } from './text';
import { prepareRounding, roundShape } from './rounding';
import { LAYOUT_BASIS, type Rect, type TextRole, type CandidateGeometry, type TextRun, type MeasureText, type PreviewGeometry } from './geometry';
import { shadowInsets } from './shadow';

const rect = (x: number, y: number, width: number, height: number): Rect => ({ x, y, width, height });
const endX = (r: Rect) => r.x + r.width;
const move = (r: Rect, x: number, y: number) => { r.x += x; r.y += y; };
const inflate = (r: Rect, x: number, y: number): Rect => rect(r.x - x, r.y - y, r.width + x * 2, r.height + y * 2);
const visible = (color: string) => color.slice(-2) !== '00';

/** Native layouts operate in integer device pixels, not CSS content-box units.
 * Reference: Weasel 0.17.4 Layout.cpp, HorizontalLayout.cpp, VerticalLayout.cpp,
 * VHorizontalLayout.cpp and WeaselPanel.cpp. Font measurement is injected.
 * Status icons and auxiliary notifications are outside the composing scenes.
 */
export function scaleLayout(layout: Layout, density: number): DeviceLayout {
  return Object.fromEntries(Object.entries(layout).map(([key, value]) => [key,
    typeof value === 'number' && key !== 'baseline' && key !== 'linespacing' ? Math.trunc(value * density) : value])) as unknown as DeviceLayout;
}

export function calculateLayout(style: Style, colors: Colors, scene: Scene, measure: MeasureText, density = 1): PreviewGeometry {
  const l = scaleLayout(style.layout, density);
  const mx = Math.max(Math.abs(l.margin_x), l.hilite_padding_x), my = Math.max(Math.abs(l.margin_y), l.hilite_padding_y);
  const vertical = style.vertical_text;
  const markerSize = measure(style.mark_text || '|', 'text');
  const markerOn = visible(colors.hilited_mark_color);
  let thickness = Math.trunc((vertical ? markerSize.width : markerSize.height) / 7);
  if (l.linespacing && l.baseline) thickness = Math.trunc(thickness / (l.linespacing / 100));
  thickness = markerOn && !style.mark_text ? Math.max(6, thickness) : 0;
  const markerAdvance = !markerOn ? 0 : style.mark_text ? (vertical ? markerSize.height : markerSize.width) + l.hilite_spacing : thickness;
  const size = (text: string, role: TextRole) => { const { width, height } = measure(text, role); return { width, height }; };
  const run = (text: string, role: TextRole, x = 0, y = 0): TextRun => ({ text, role, rect: { x, y, ...size(text, role) } });
  const { text: preeditText, highlight } = preeditContent(style, scene);
  const highlightIndex = highlight ? preeditText.indexOf(highlight) : -1;
  const preeditRuns: TextRun[] = [];
  let preeditWidth = 0, preeditHeight = 0;
  if (!style.inline_preedit && preeditText) {
    const parts = highlight && highlightIndex >= 0
      ? [{ text: preeditText.slice(0, highlightIndex), gap: true }, { text: highlight, gap: true, highlighted: true }, { text: preeditText.slice(highlightIndex + highlight.length), gap: false }]
      : [{ text: preeditText, gap: false }];
    for (const part of parts) {
      if (!part.text) continue;
      const item = run(part.text, 'preedit', vertical ? 0 : preeditWidth, vertical ? preeditHeight : 0);
      item.highlighted = 'highlighted' in part && !!part.highlighted;
      // 0.17.4 GetPreeditSize passes range.end as substr's LENGTH, whereas the
      // painter uses end-start. Preserve its allocation even with a prefix.
      if (item.highlighted && highlightIndex > 0) Object.assign(item.rect,
        size(preeditText.slice(highlightIndex, 2 * highlightIndex + part.text.length), 'preedit'));
      preeditRuns.push(item);
      if (vertical) { preeditWidth = Math.max(preeditWidth, item.rect.width); preeditHeight += item.rect.height + (part.gap ? l.hilite_spacing : 0); }
      else { preeditWidth += item.rect.width + (part.gap ? l.hilite_spacing : 0); preeditHeight = Math.max(preeditHeight, item.rect.height); }
    }
  }
  const preedit = preeditRuns.length ? { bounds: rect(0, 0, preeditWidth, preeditHeight), runs: preeditRuns, background: null as Rect | null, rounding: roundShape(l.round_corner) } : null;
  const pageOn = !!preedit && visible(colors.prevpage_color) && visible(colors.nextpage_color);
  const prev = pageOn ? measure('<', 'preedit') : { width: 0, height: 0 };
  const next = pageOn ? measure('>', 'preedit') : { width: 0, height: 0 };
  const pageWidth = pageOn ? vertical ? Math.max(prev.width, next.width) : prev.width + next.width + l.hilite_spacing + 2 * l.hilite_padding_x : 0;
  const pageHeight = pageOn ? vertical ? prev.height + next.height + l.hilite_spacing + 2 * l.hilite_padding_y : Math.max(prev.height, next.height) : 0;
  const candidates: CandidateGeometry[] = scene.candidates.map((item, index) => {
    const text = abbreviate(item.text, style.candidate_abbreviate_length);
    return { index, row: 0, bounds: rect(0, 0, 0, 0), background: rect(0, 0, 0, 0), rounding: roundShape(l.round_corner),
      label: style.label_font_point ? run(formatLabel(style.label_format, candidateLabel(scene, index)), 'label') : null,
      text: run(text, 'text'),
      comment: style.comment_font_point && item.comment && visible(colors[index === scene.highlighted ? 'hilited_comment_text_color' : 'comment_text_color']) ? run(item.comment, 'comment') : null };
  });
  const allRuns = (c: CandidateGeometry) => [c.label, c.text, c.comment].filter((r): r is TextRun => !!r);
  const align = (runs: TextRun[], extent: number, axis: 'x' | 'y', mode = l.align_type) => {
    for (const r of runs) {
      const size = axis === 'x' ? r.rect.width : r.rect.height;
      r.rect[axis] += mode === 'center' ? Math.trunc((extent - size) / 2) : mode === 'bottom' ? extent - size : 0;
    }
  };
  // Shadow/border buffers influence the original horizontal minimum-width and
  // vertical-text minimum-size calculations. Exclude them from painted bounds.
  const { x: ox, y: oy } = shadowInsets(l);
  let width = 0, height = 0;
  if ((!vertical && style.horizontal) || (vertical && style.vertical_text_with_wrap)) {
    // Horizontal candidates and wrapped vertical text use the same packing
    // operation with exchanged axes. The native minimums/buffers differ by axis.
    const mu = vertical ? my : mx, mv = vertical ? mx : my;
    const ou = vertical ? oy : ox, ov = vertical ? ox : oy;
    const mainSize = (r: Rect) => vertical ? r.height : r.width;
    const crossSize = (r: Rect) => vertical ? r.width : r.height;
    const packRect = (u: number, v: number, a: number, b: number) => vertical ? rect(v, u, b, a) : rect(u, v, a, b);
    const limit = vertical ? l.max_height : l.max_width;
    let u = ou + mu, v = ov + mv, row = 0;
    let main = vertical ? ou : u;
    if (preedit) {
      preedit.bounds.x = ox + mx; preedit.bounds.y = oy + my;
      v += (vertical ? preeditWidth : Math.max(preeditHeight, pageHeight)) + l.spacing;
      main = Math.max(main, vertical ? ou + mu + preeditHeight + pageHeight : 2 * mu + preeditWidth + pageWidth);
    }
    const rows: { v: number; size: number; items: CandidateGeometry[] }[] = [{ v, size: 0, items: [] }];
    for (const c of candidates) {
      const labelSize = c.label ? mainSize(c.label.rect) : 0;
      const advance = c.index === scene.highlighted ? markerAdvance : 0;
      const itemSize = advance + labelSize + l.hilite_spacing + mainSize(c.text.rect) + (c.comment ? l.hilite_spacing + mainSize(c.comment.rect) : 0);
      if (rows[row].items.length) u += l.candidate_spacing;
      if (limit && rows[row].items.length && u + itemSize - ou + mu > limit) {
        v += rows[row].size + l.candidate_spacing;
        u = ou + mu; row++;
        rows.push({ v, size: 0, items: [] });
      }
      c.row = row; c.bounds = packRect(u, v, itemSize, 0);
      let content = u + advance;
      const put = (r: TextRun) => { r.rect = packRect(content, v, mainSize(r.rect), crossSize(r.rect)); };
      if (c.label) { put(c.label); content += labelSize; }
      content += l.hilite_spacing;
      put(c.text); content += mainSize(c.text.rect);
      if (c.comment) { content += l.hilite_spacing; put(c.comment); }
      rows[row].items.push(c);
      rows[row].size = Math.max(rows[row].size, ...allRuns(c).map((r) => crossSize(r.rect)));
      u += itemSize; main = Math.max(main, u);
    }
    const naturalMain = main;
    main = Math.max(main + mu, vertical ? l.min_height : l.min_width);
    const cross = Math.max(v + rows[row].size - ov + mv, vertical ? l.min_width : l.min_height);
    for (const group of rows) for (const [i, c] of group.items.entries()) {
      if (vertical) c.bounds.width = group.size; else c.bounds.height = group.size;
      const mode = !vertical || l.align_type === 'center' ? l.align_type
        : ((l.align_type === 'bottom') === style.vertical_text_left_to_right) ? 'bottom' : 'top';
      align(allRuns(c), group.size, vertical ? 'x' : 'y', mode);
      if (i === group.items.length - 1) {
        if (vertical) c.bounds.height = naturalMain - c.bounds.y;
        else c.bounds.width = main - mu - c.bounds.x;
      }
    }
    width = vertical ? cross : main - ou; height = vertical ? main - ou : cross;
    if (vertical && !style.vertical_text_left_to_right) {
      let target = ox + mx;
      for (const group of rows.toReversed()) {
        const dx = target - group.v;
        for (const c of group.items) { move(c.bounds, dx, 0); for (const r of allRuns(c)) move(r.rect, dx, 0); }
        target += group.size + l.candidate_spacing;
      }
      if (preedit) preedit.bounds.x = target - l.candidate_spacing + l.spacing;
    }
    for (const c of candidates) { move(c.bounds, -ox, -oy); for (const r of allRuns(c)) move(r.rect, -ox, -oy); }
    if (preedit) move(preedit.bounds, -ox, -oy);
  } else if (!vertical) {
    let y = my;
    if (preedit) {
      preedit.bounds.x = mx; preedit.bounds.y = y;
      y += Math.max(preeditHeight, pageHeight) + l.spacing;
      width = 2 * mx + preeditWidth + pageWidth;
    }
    let widestContent = 0, commentBand = 0, widestComment = 0;
    for (const c of candidates) {
      if (c.index) y += l.candidate_spacing;
      let x = mx + markerAdvance;
      if (c.label) { c.label.rect.x = x; c.label.rect.y = y; x += c.label.rect.width + l.hilite_spacing; }
      c.text.rect.x = x; c.text.rect.y = y; x += c.text.rect.width;
      widestContent = Math.max(widestContent, x - mx);
      if (c.comment) { commentBand = Math.max(commentBand, x + l.hilite_spacing); widestComment = Math.max(widestComment, c.comment.rect.width); c.comment.rect.y = y; }
      const h = Math.max(...allRuns(c).map((r) => r.rect.height));
      align(allRuns(c), h, 'y');
      c.bounds = rect(mx, y, 0, h); y += h;
    }
    const naturalWidth = Math.max(width, Math.max(widestContent, commentBand + widestComment) + 2 * mx);
    width = Math.max(naturalWidth, l.min_width);
    height = Math.max(y + my, l.min_height);
    for (const c of candidates) { c.bounds.width = width - 2 * mx; if (c.comment) c.comment.rect.x = mx + commentBand + width - naturalWidth; }
  } else {
    let x = ox + mx, maxContentBottom = oy + my + markerAdvance, maxCommentHeight = 0;
    if (preedit) { preedit.bounds.x = x; preedit.bounds.y = oy + my; x += preeditWidth + l.spacing; }
    const left = ox + mx;
    for (const c of candidates) {
      let y = oy + my + markerAdvance;
      if (c.label) { c.label.rect.x = x; c.label.rect.y = y; y += c.label.rect.height + l.hilite_spacing; }
      c.text.rect.x = x; c.text.rect.y = y; y += c.text.rect.height;
      maxContentBottom = Math.max(maxContentBottom, y);
      const w = Math.max(...allRuns(c).map((r) => r.rect.width));
      if (c.comment) { c.comment.rect.x = x; maxCommentHeight = Math.max(maxCommentHeight, c.comment.rect.height); }
      const mode = l.align_type === 'center' ? 'center' : ((l.align_type === 'bottom') === style.vertical_text_left_to_right) ? 'bottom' : 'top';
      align(allRuns(c), w, 'x', mode);
      c.bounds = rect(x, oy + my, w, 0);
      x += w + l.candidate_spacing;
    }
    const hasComments = candidates.some((c) => !!c.comment);
    // Native vertical text reserves the common comment baseline even when a
    // column has no annotation. Preserve that space at the bottom of the panel.
    const bottom = maxContentBottom + l.hilite_spacing + (hasComments ? maxCommentHeight : 0);
    width = Math.max(x - l.candidate_spacing + mx, l.min_width);
    height = Math.max(bottom + my, preedit ? oy + my + preeditHeight + pageHeight + my : 0, l.min_height);
    const candidateBottom = Math.max(bottom, height - my);
    for (const c of candidates) {
      c.bounds.height = candidateBottom - c.bounds.y;
      if (c.comment) c.comment.rect.y = candidateBottom - c.comment.rect.height;
    }
    if (!style.vertical_text_left_to_right) {
      let target = left;
      for (const c of candidates.toReversed()) {
        const dx = target - c.bounds.x;
        move(c.bounds, dx, 0); for (const r of allRuns(c)) move(r.rect, dx, 0);
        target = endX(c.bounds) + l.candidate_spacing;
      }
      if (preedit) preedit.bounds.x = target - l.candidate_spacing + l.spacing;
    }
    width -= ox; height -= oy;
    for (const c of candidates) { move(c.bounds, -ox, -oy); for (const r of allRuns(c)) move(r.rect, -ox, -oy); }
    if (preedit) move(preedit.bounds, -ox, -oy);
  }
  for (const c of candidates) c.background = inflate(c.bounds, l.hilite_padding_x, l.hilite_padding_y);
  if (preedit) {
    for (const r of preedit.runs) {
      if (vertical) r.rect.width = preeditWidth; else r.rect.height = preeditHeight;
      move(r.rect, preedit.bounds.x, preedit.bounds.y);
    }
    const selected = preedit.runs.find((r) => r.highlighted);
    preedit.background = selected ? inflate(selected.rect, l.hilite_padding_x, l.hilite_padding_y) : null;
  }
  let pages: PreviewGeometry['pages'] = null;
  if (pageOn && preedit) {
    const x = vertical ? Math.trunc((2 * preedit.bounds.x + preedit.bounds.width) / 2) - Math.trunc(prev.width / 2) : width - mx + l.hilite_padding_x - pageWidth;
    const y = vertical ? height - my + l.hilite_padding_y - pageHeight : Math.trunc((2 * preedit.bounds.y + preedit.bounds.height) / 2) - Math.trunc(prev.height / 2);
    pages = { previous: rect(x, y, prev.width, prev.height), next: rect(vertical ? x : x + prev.width + l.hilite_spacing, vertical ? y + prev.height + l.hilite_spacing : y, next.width, next.height) };
  }
  let mark: PreviewGeometry['mark'] = null;
  if (markerOn) {
    const box = candidates[scene.highlighted].background;
    if (style.mark_text) {
      mark = { text: style.mark_text, rect: vertical
        ? rect(box.x + Math.trunc((box.width - markerSize.width) / 2), box.y + l.hilite_padding_y, markerSize.width, markerSize.height)
        : rect(box.x + l.hilite_padding_x, box.y + Math.trunc((box.height - markerSize.height) / 2), markerSize.width, markerSize.height) };
    } else {
      const extent = Math.max(0, Math.min(vertical ? box.width - 2 * l.hilite_padding_x : box.height - 2 * l.hilite_padding_y,
        (vertical ? box.width : box.height) - 2 * l.round_corner, Math.trunc((vertical ? box.width : box.height) * .618)));
      mark = { text: '', rect: vertical ? rect(box.x + Math.trunc((box.width - extent) / 2), box.y, extent, thickness)
        : rect(box.x, box.y + Math.trunc((box.height - extent) / 2), thickness, extent) };
    }
  }
  const geometry: PreviewGeometry = { basis: LAYOUT_BASIS, width, height, density, layout: l, candidates, preedit, pages, mark };
  prepareRounding(geometry, style);
  return geometry;
}
