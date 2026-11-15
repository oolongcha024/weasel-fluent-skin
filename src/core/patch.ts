import { isMap } from './yaml';
import type { Dict, Diagnostic, Origin } from './types';

const forbidden = new Set(['__proto__', 'constructor', 'prototype']);
export const pathSegment = (key: string) => key.replace(/~/g, '~0').replace(/\//g, '~1');

export function flatten(value: Dict, prefix = ''): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    const segment = pathSegment(k);
    const path = prefix ? `${prefix}/${segment}` : segment;
    if (isMap(v)) Object.assign(out, flatten(v, path));
    else out[path] = v;
  }
  return out;
}

const sortedEntries = (map: Dict) => Object.entries(map).sort(([a], [b]) => {
  // std::map<string, ...> orders UTF-8 keys; code-point order is equivalent.
  const left = [...a], right = [...b];
  for (let i = 0; i < Math.min(left.length, right.length); i++) {
    const difference = left[i].codePointAt(0)! - right[i].codePointAt(0)!;
    if (difference) return difference;
  }
  return left.length - right.length;
});

/** Native contract: librime 1.13.1 config_compiler.cc::EditNode / MergeTree.
 * Top-level keys are paths; keys inside a merged dictionary are literal keys.
 */
export function applyPatch(defaults: Dict, patch: Dict) {
  const holder: Dict = { root: structuredClone(defaults) };
  const origins: Record<string, Origin> = Object.fromEntries(Object.keys(flatten(defaults)).map((k) => [k, 'default']));
  const diagnostics: Diagnostic[] = [];

  function edit(head: string[], raw: string, value: unknown, tree: boolean) {
    const append = raw === '__append' || raw.endsWith('/+');
    const mergeDirective = raw === '__merge';
    const force = raw.endsWith('/=');
    const name = append && raw !== '__append' ? raw.slice(0, -2) : force ? raw.slice(0, -2) : raw;
    const relative = raw === '__append' || mergeDirective || name === '' || name === '/' ? [] : tree ? [name] : name.replace(/^\/+/, '').split('/');
    const path = [...head, ...relative];
    const base = path.map(pathSegment).join('/');
    const error = (message: string) => diagnostics.push({ level: 'error', code: 'patch-path', path: base, message });
    if (path.some((k) => forbidden.has(k))) {
      diagnostics.push({ level: 'error', code: 'patch-path', path: path.join('/'), message: '配置路径含有无效节点名。' });
      return;
    }
    if (path.some((k) => !k || k.startsWith('@'))) {
      diagnostics.push({ level: 'error', code: 'patch-path', path: path.join('/'), message: '不支持此补丁路径或列表操作。' });
      return;
    }
    let cursor = holder;
    const fullPath = ['root', ...path];
    for (const k of fullPath.slice(0, -1)) {
      if (cursor[k] != null && !isMap(cursor[k])) { error('补丁路径经过了非字典节点，无法应用。'); return; }
      if (!isMap(cursor[k])) cursor[k] = {};
      cursor = cursor[k] as Dict;
    }
    const key = fullPath.at(-1)!;
    const existing = cursor[key];
    const merge = append || mergeDirective || (tree && (value === null || isMap(value)) && !force);
    if (merge && existing != null) {
      if (value === null) return;
      if (isMap(value)) {
        if (!isMap(existing)) { error('不能将字典合并到其他类型的节点。'); return; }
        for (const [k, v] of sortedEntries(value)) edit(path, k, v, true);
        return;
      }
      if (append && Array.isArray(value)) {
        if (!Array.isArray(existing) && !(isMap(existing) && Object.keys(existing).length === 0)) { error('列表追加需要兼容的列表节点。'); return; }
        value = [...(Array.isArray(existing) ? existing : []), ...value];
      } else if (append && !isMap(existing) && !Array.isArray(existing) && !Array.isArray(value)) {
        value = String(existing) + String(value);
      } else {
        error('追加操作的值与目标节点类型不兼容。'); return;
      }
    }
    if (!path.length && !isMap(value)) { error('配置根节点必须是字典。'); return; }
    cursor[key] = structuredClone(value);
    for (const k of Object.keys(origins)) if (!base || k === base || k.startsWith(base + '/')) delete origins[k];
    const leaves = isMap(value) ? flatten(value, base) : { [base]: value };
    for (const k of Object.keys(leaves)) origins[k] = 'user';
  }

  for (const [key, value] of sortedEntries(patch)) edit([], key, value, false);
  return { merged: holder.root as Dict, origins, diagnostics };
}
