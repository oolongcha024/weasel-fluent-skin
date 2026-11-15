import { fontSpec } from '../core/font';

export function availableFonts(requested: string) {
  const spec = fontSpec(requested);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  const sample = 'mmmmmmWWWWii汉字春日';
  const generic = new Set(['serif', 'sans-serif', 'monospace', 'system-ui', 'cursive', 'fantasy']);
  return spec.families.map((family) => {
    const available = generic.has(family) || ['monospace', 'serif'].some((fallback) => {
      ctx.font = `32px ${fallback}`;
      const base = ctx.measureText(sample).width;
      ctx.font = `32px ${JSON.stringify(family)}, ${fallback}`;
      return Math.abs(ctx.measureText(sample).width - base) > 0.01;
    });
    return { requested: family, available, css: spec.css };
  });
}
