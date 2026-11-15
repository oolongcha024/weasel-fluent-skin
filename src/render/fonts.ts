/** Translate the family/weight/style part; Unicode ranges are diagnosed by the parser. */
export function fontSpec(raw: string) {
  const families = raw.split(/[,，]/).map((s) => s.trim().split(':')[0]).filter(Boolean);
  const generic = new Set(['serif', 'sans-serif', 'monospace', 'system-ui', 'cursive', 'fantasy']);
  const css = families.map((f) => generic.has(f) ? f : JSON.stringify(f)).join(', ') || 'sans-serif';
  // DirectWriteResources::_ParseFontFace searches the entire setting, with the
  // last matching token winning. Native aliases contain underscores.
  const weights: Record<string, number> = { thin: 100, extra_light: 200, ultra_light: 200, light: 300, semi_light: 350,
    medium: 500, demi_bold: 600, semi_bold: 600, bold: 700, extra_bold: 800, ultra_bold: 800,
    black: 900, heavy: 900, extra_black: 950, ultra_black: 950 };
  const last = (pattern: RegExp) => [...raw.matchAll(pattern)].at(-1)?.[1].toLowerCase();
  const weightToken = last(/:(thin|extra_light|ultra_light|light|semi_light|medium|demi_bold|semi_bold|bold|extra_bold|ultra_bold|black|heavy|extra_black|ultra_black)/gi);
  const weight = weightToken ? weights[weightToken] : 400;
  const style = last(/:(italic|oblique|normal)/gi) ?? 'normal';
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
