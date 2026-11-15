export type ColorFormat = 'abgr' | 'argb' | 'rgba';

/** Keep the original YAML scalar text: 0x00000000 and 0x000000 differ in opacity. */
export function rimeColor(value: unknown, format: ColorFormat = 'abgr'): string {
  let hex: string;
  if (typeof value === 'number' && Number.isInteger(value)) {
    if (value < -2147483648 || value > 2147483647) throw new Error('十进制颜色超出有符号 32 位范围');
    // Native _RimeGetColor makes integer scalars opaque before channel conversion.
    const opaque = format === 'rgba' ? ((value << 8) | 0xff) >>> 0 : (value | 0xff000000) >>> 0;
    hex = opaque.toString(16).padStart(8, '0');
  } else if (typeof value === 'string' && /^0x[\da-f]+$/i.test(value)) {
    hex = value.slice(2, 10); // _RimeGetColor reads at most eight hex digits.
  } else if (typeof value === 'string' && /^-?\d+$/.test(value)) {
    return rimeColor(Number(value), format);
  } else {
    throw new Error('颜色应为 0x 十六进制值或 32 位整数');
  }
  if (hex.length === 3 || hex.length === 4) hex = [...hex].map((c) => c + c).join('');
  if (hex.length === 7) hex = hex.padStart(8, '0');
  if (hex.length !== 6 && hex.length !== 8) throw new Error('颜色需要 3、4、6、7 或 8 位十六进制数');
  const opaque = hex.length === 6;
  const pairs = hex.match(/../g)!;
  let r: string, g: string, b: string, a: string;
  if (opaque) {
    [r, g, b] = format === 'abgr' ? pairs.toReversed() : pairs;
    a = 'ff';
  } else if (format === 'rgba') [r, g, b, a] = pairs;
  else if (format === 'argb') [a, r, g, b] = pairs;
  else [a, b, g, r] = pairs;
  return `#${r}${g}${b}${a}`.toLowerCase();
}

export function composite(fg: string, bg: string): string {
  const decode = (c: string) => c.slice(1).match(/../g)!.map((v) => parseInt(v, 16));
  const f = decode(fg), b = decode(bg), fa = f[3] / 255, ba = b[3] / 255;
  const a = fa + ba * (1 - fa);
  if (a === 0) return bg;
  return '#' + [...f.slice(0, 3).map((v, i) => Math.floor((v * fa + b[i] * ba * (1 - fa)) / a)), Math.floor(a * 255)]
    .map((v) => v.toString(16).padStart(2, '0')).join('');
}
