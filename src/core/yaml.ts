import { parseDocument, visit } from 'yaml';
import type { Diagnostic, Dict } from './types';

export const isMap = (v: unknown): v is Dict => !!v && typeof v === 'object' && !Array.isArray(v);

export function readYaml(source: string): { data: Dict; diagnostics: Diagnostic[] } {
  const doc = parseDocument(source, {
    schema: 'core', uniqueKeys: true, prettyErrors: true,
  });
  // YAML normally turns hex literals into numbers, losing significant alpha zeros.
  // Preserve those scalars while keeping real null/boolean and quoted-string semantics.
  visit(doc, { Scalar(_key, scalar) {
    if (typeof scalar.source === 'string' && /^0x[\da-f]+$/i.test(scalar.source)) scalar.value = scalar.source;
  } });
  const diagnostics: Diagnostic[] = [...doc.errors, ...doc.warnings].map((e) => ({
    level: 'error', code: 'yaml', message: e.message, line: e.linePos?.[0].line,
  }));
  let data: unknown;
  try { data = doc.toJS({ maxAliasCount: 100 }); }
  catch (e) { diagnostics.push({ level: 'error', code: 'yaml', message: String(e) }); }
  if (!isMap(data)) {
    diagnostics.push({ level: 'error', code: 'root', message: '配置根节点必须是 YAML 字典。' });
    data = {};
  }
  return { data: data as Dict, diagnostics };
}
