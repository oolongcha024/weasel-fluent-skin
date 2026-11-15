export interface Diagnostic {
  level: 'error' | 'warning';
  code: string;
  message: string;
  path?: string;
  line?: number;
}

export function uniqueDiagnostics(items: readonly Diagnostic[]): Diagnostic[] {
  return [...new Map(items.map((d) => [`${d.code}:${d.path}:${d.message}`, d])).values()];
}
