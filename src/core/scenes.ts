import type { Diagnostic, Scene } from './types';

export const DEFAULT_SCENES: Scene[] = [
  { id: 'everyday', name: '日常输入', preedit: 'chun ri', highlightedPreedit: 'chun', highlighted: 0,
    candidates: [{ text: '春日', comment: 'chūn rì' }, { text: '春雨', comment: 'chūn yǔ' }, { text: '春意' }, { text: '春风' }, { text: '春天' }] },
  { id: 'long', name: '长词与混排', preedit: 'zi ding yi', highlightedPreedit: 'zi', highlighted: 1,
    candidates: [{ text: '自定义', comment: 'custom' }, { text: '自定义输入法皮肤', comment: '一条较长的候选注释 · custom theme' }, { text: 'Fluent Design 设计语言' }, { text: '保存 YAML，实时预览' }] },
  { id: 'symbols', name: '特殊字符', preedit: 'fu hao', highlightedPreedit: 'fu', highlighted: 0,
    candidates: [{ text: '你好，世界！', comment: '标点' }, { text: '🌿 春天', comment: 'emoji' }, { text: '𠮷野家', comment: '扩展汉字' }, { text: '→ ⇧ ⌘ · ①', comment: '符号' }, { text: 'Rime / 中州韵' }] },
];

export function validateScenes(input: unknown): { scenes: Scene[]; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = [];
  const ids = new Set<string>();
  if (!Array.isArray(input) || !input.length) return { scenes: [], diagnostics: [{ level: 'error', code: 'scenes', message: '场景文件必须是非空 JSON 数组。' }] };
  for (const item of input) {
    if (!item || !/^[a-zA-Z0-9_-]+$/.test(item.id) || ids.has(item.id) || typeof item.name !== 'string' || typeof item.preedit !== 'string'
      || (item.highlightedPreedit !== undefined && typeof item.highlightedPreedit !== 'string')
      || (item.currentPage !== undefined && (!Number.isInteger(item.currentPage) || item.currentPage < 0))
      || (item.isLastPage !== undefined && typeof item.isLastPage !== 'boolean')
      || !Array.isArray(item.candidates) || !item.candidates.length || !Number.isInteger(item.highlighted)
      || item.highlighted < 0 || item.highlighted >= item.candidates.length
      || item.candidates.some((c: unknown) => !c || typeof (c as { text?: unknown }).text !== 'string'
        || ['comment', 'label'].some((key) => (c as Record<string, unknown>)[key] !== undefined && typeof (c as Record<string, unknown>)[key] !== 'string'))) {
      diagnostics.push({ level: 'error', code: 'scenes', message: '场景需包含唯一 id、name、preedit、有效 highlighted 索引和文本候选项；参见 examples/scenes.json。' });
    }
    if (item) ids.add(item.id);
  }
  return { scenes: diagnostics.length ? [] : input as Scene[], diagnostics };
}
