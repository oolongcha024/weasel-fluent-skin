import type { Scene, Style } from './types';

export function formatLabel(format: string, label: string): string {
  return format.replace(/%%|%(-?)(\d*)s/g, (token, left: string, width: string) => {
    if (token === '%%') return '%';
    const size = Math.min(Number(width), 127);
    return left ? label.padEnd(size, ' ') : label.padStart(size, ' ');
  });
}

export const candidateLabel = (scene: Scene, index: number) => scene.candidates[index].label ?? String((index + 1) % 10);

/** UI::Update abbreviates Windows wchar_t (UTF-16) units, preserving the tail. */
export function abbreviate(text: string, length: number): string {
  return length > 0 && text.length > length ? text.slice(0, length - 1) + '...' + text.slice(-1) : text;
}

/** RimeWithWeasel::_Respond constructs this before UI candidate abbreviation. */
export function preeditContent(style: Style, scene: Scene): { text: string; highlight?: string } {
  if (style.preedit_type === 'preview' && scene.commitPreview !== undefined) {
    return { text: scene.commitPreview, highlight: scene.commitPreview };
  }
  let text = scene.preedit;
  if (style.preedit_type === 'preview_all') {
    text += '  [';
    scene.candidates.forEach((candidate, index) => {
      const label = style.label_font_point ? formatLabel(style.label_format, candidateLabel(scene, index)) : '';
      const comment = style.comment_font_point ? candidate.comment ?? '' : '';
      const mark = index === scene.highlighted ? style.mark_text || '*' : '';
      text += ` ${mark}${label}${candidate.text} ${comment}`;
    });
    text += ' ]';
  }
  return { text, highlight: scene.highlightedPreedit };
}
