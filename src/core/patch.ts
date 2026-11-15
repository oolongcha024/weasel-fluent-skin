import { isMap } from './yaml';
import type { Dict, Diagnostic, Origin } from './types';

const forbidden = new Set(['__proto__', 'constructor', 'prototype']);

export function flatten(value: Dict, prefix = ''): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    const path = prefix ? `${prefix}/${k}` : k;
    if (isMap(v)) Object.assign(out, flatten(v, path));
    else out[path] = v;
  }
  return out;
}

/** Rime path assignments replace nodes; /+ recursively merges a map. */
export function applyPatch(defaults: Dict, patch: Dict) {
  const merged = structuredClone(defaults);
  const origins: Record<string, Origin> = Object.fromEntries(Object.keys(flatten(defaults)).map((k) => [k, 'default']));
  const diagnostics: Diagnostic[] = [];

  function assign(path: string[], value: unknown, merge: boolean) {
    if (path.some((k) => forbidden.has(k))) {
      diagnostics.push({ level: 'error', code: 'patch-path', path: path.join('/'), message: '配置路径含有无效节点名。' });
      return;
    }
    if (!path.length || path.some((k) => !k || k.startsWith('@'))) {
      diagnostics.push({ level: 'error', code: 'patch-path', path: path.join('/'), message: '不支持此补丁路径或列表操作。' });
      return;
    }
    let cursor = merged;
    for (const k of path.slice(0, -1)) {
      if (!isMap(cursor[k])) cursor[k] = {};
      cursor = cursor[k] as Dict;
    }
    const key = path.at(-1)!;
    const base = path.join('/');
    if (merge && isMap(value)) {
      if (!isMap(cursor[key])) cursor[key] = {};
      for (const [k, v] of Object.entries(value)) {
        const parts = k.split('/');
        const plus = parts.at(-1) === '+';
        assign([...path, ...parts.filter((_, i) => !plus || i !== parts.length - 1)], v,
          plus || isMap(v));
      }
      return;
    }
    if (merge && Array.isArray(value)) {
      cursor[key] = [...(Array.isArray(cursor[key]) ? cursor[key] : []), ...value];
    } else cursor[key] = structuredClone(value);
    for (const k of Object.keys(origins)) if (k === base || k.startsWith(base + '/')) delete origins[k];
    const leaves = isMap(value) ? flatten(value, base) : { [base]: value };
    for (const k of Object.keys(leaves)) origins[k] = 'user';
  }

  for (const [key, value] of Object.entries(patch)) {
    const parts = key.split('/');
    const plus = parts.at(-1) === '+';
    assign(plus ? parts.slice(0, -1) : parts, value, plus);
  }
  return { merged, origins, diagnostics };
}
