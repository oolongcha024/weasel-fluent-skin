/** Translate the family/weight/style part; Unicode ranges are diagnosed by the parser. */
export function fontSpec(raw: string) {
  const families = raw.split(/[,，]/).map((s) => s.trim().split(':')[0]).filter(Boolean);
  const generic = new Set(['serif', 'sans-serif', 'monospace', 'system-ui', 'cursive', 'fantasy']);
  const css = families.map((f) => generic.has(f) ? f : JSON.stringify(f)).join(', ') || 'sans-serif';
  const parts = raw.split(',')[0].split(':').slice(1).map((s) => s.toLowerCase());
  const weights: Record<string, number> = { thin: 100, extralight: 200, light: 300, normal: 400, regular: 400, medium: 500, semibold: 600, bold: 700, extrabold: 800, black: 900 };
  const weight = parts.map((p) => weights[p]).find((v) => v !== undefined) ?? 400;
  const style = parts.includes('italic') ? 'italic' : parts.includes('oblique') ? 'oblique' : 'normal';
  return { families, css, weight, style };
}

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
