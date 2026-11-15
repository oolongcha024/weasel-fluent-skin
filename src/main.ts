import './style.css';
import { renderCandidate, inspectRender, refreshCandidateLayout } from './render/candidate';
import { flatten } from './core/patch';
import type { BrowserReport, Diagnostic, InputSnapshot, Origin } from './core/types';

interface PreviewAPI {
  state: 'loading' | 'ready' | 'error';
  report: BrowserReport | null;
  select: (options: { scheme?: string; scene?: string }) => Promise<BrowserReport>;
}
declare global { interface Window { __WEASEL_PREVIEW__: PreviewAPI } }

const capture = new URLSearchParams(location.search).has('capture');
document.body.classList.toggle('capture', capture);
const icon = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m4 6 4 12 4-8 4 8 4-12" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <header class="topbar">
    <a class="brand" href="/">${icon}<span>Weasel <strong>Studio</strong></span></a>
    <div class="file-pill"><span class="file-symbol">Y</span><span id="filename">正在读取配置…</span></div>
    <span class="connection" id="connection">连接中</span>
  </header>
  <div class="workspace">
    <aside class="sidebar">
      <div class="section-label">预览场景</div>
      <nav id="scenes" aria-label="预览场景"></nav>
      <div class="sidebar-divider"></div>
      <label class="section-label" for="scheme">配色方案</label>
      <select id="scheme" aria-label="配色方案"></select>
      <div class="mode-switch" aria-label="明暗配色">
        <button id="light" aria-pressed="true">☀ 浅色</button>
        <button id="dark" aria-pressed="false">☾ 深色</button>
      </div>
      <div class="swatch-strip" id="swatches" aria-hidden="true"></div>
      <div class="sidebar-note" id="scheme-author"></div>
      <div class="sidebar-bottom">
        <span class="section-label">配置来源</span>
        <span class="source-name" id="source-name">—</span>
        <div class="source-meta" id="source-meta"></div>
        <button class="text-button" id="inspect-button">查看配置与诊断 <span>↗</span></button>
      </div>
    </aside>
    <main class="main">
      <div class="preview-heading">
        <div><h1 id="preview-title">皮肤预览</h1></div>
        <div class="preview-tools">
          <button class="quiet-button" id="canvas-tone" aria-label="切换画布背景" title="只改变画布背景，不改变皮肤">◐ <span>画布</span></button>
          <label class="zoom-label"><span>缩放</span><select id="zoom" aria-label="预览缩放"><option value="0.5">50%</option><option value="0.75">75%</option><option value="1" selected>100%</option><option value="1.25">125%</option><option value="1.5">150%</option><option value="2">200%</option></select></label>
        </div>
      </div>
      <div class="error-banner" id="error-banner" role="alert" hidden></div>
      <section class="preview-stage" id="stage" aria-label="皮肤预览画布">
        <div class="stage-topline"><span id="scene-name">—</span><span id="layout-name">—</span></div>
        <div class="stage-viewport"><div id="preview"></div></div>
        <div class="stage-bottomline"><span id="stage-description">浏览器仿真</span><span id="scale-note">1:1 · 100%</span></div>
      </section>
      <div class="preview-footer"><span id="render-status" role="status" aria-live="polite">等待配置</span><span class="hash" id="hash"></span></div>
      <details class="inspector" id="inspector">
        <summary><span>配置与诊断 <span id="diagnostic-count" class="count">0</span></span><span class="disclosure">⌄</span></summary>
        <div class="inspector-tabs" role="tablist" aria-label="配置详情">
          <button role="tab" id="tab-diagnostics" aria-selected="true" aria-controls="panel-diagnostics" data-panel="diagnostics">诊断</button>
          <button role="tab" id="tab-effective" aria-selected="false" aria-controls="panel-effective" data-panel="effective">生效参数</button>
          <button role="tab" id="tab-source" aria-selected="false" aria-controls="panel-source" data-panel="source">原始 YAML</button>
        </div>
        <div class="inspector-panel" id="panel-diagnostics" role="tabpanel" aria-labelledby="tab-diagnostics"></div>
        <div class="inspector-panel" id="panel-effective" role="tabpanel" aria-labelledby="tab-effective" hidden></div>
        <div class="inspector-panel" id="panel-source" role="tabpanel" aria-labelledby="tab-source" hidden><pre id="source-code"></pre></div>
      </details>
    </main>
  </div>`;

function $<T extends HTMLElement = HTMLElement>(id: string) { return document.getElementById(id) as T; }
const node = (tag: string, className = '', text = '') => {
  const el = document.createElement(tag); el.className = className; el.textContent = text; return el;
};
let snapshot: InputSnapshot | null = null;
let lastValid: InputSnapshot | null = null;
let selectedScheme = '', selectedScene = '', mode: 'light' | 'dark' = 'light';
let canvasDark = false, canvasManual = false, zoom = 1, renderId = 0, requestId = 0;
let disconnected = false;
let readFailed = false;
let currentDiagnostics: Diagnostic[] = [];
const api: PreviewAPI = { state: 'loading', report: null, select: async () => { throw new Error('配置尚未准备好'); } };
window.__WEASEL_PREVIEW__ = api;
const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

function diagnosticsPanel(items: Diagnostic[]) {
  const panel = $('panel-diagnostics'); panel.replaceChildren();
  const unique = [...new Map(items.map((d) => [`${d.code}:${d.path}:${d.message}`, d])).values()];
  $('diagnostic-count').textContent = String(unique.length);
  $('diagnostic-count').classList.toggle('has-warnings', unique.length > 0);
  if (!unique.length) panel.append(node('p', 'empty-diagnostics', '没有配置诊断。浏览器字体度量与 Windows 原生渲染可能存在差异。'));
  for (const item of unique) {
    const row = node('div', `diagnostic ${item.level}`);
    const badge = node('span', 'diagnostic-badge', item.level === 'error' ? '错误' : '注意');
    const content = node('div');
    content.append(node('div', '', item.message));
    if (item.path || item.line) content.append(node('code', '', [item.path, item.line ? `第 ${item.line} 行` : ''].filter(Boolean).join(' · ')));
    row.append(badge, content); panel.append(row);
  }
}

function effectivePanel(input: InputSnapshot) {
  const panel = $('panel-effective'); panel.replaceChildren();
  if (snapshot && !snapshot.config.ok) panel.append(node('p', 'stale-note', '以下为上一次有效配置，当前文件有错误。'));
  const table = document.createElement('table');
  const head = document.createElement('thead');
  const header = document.createElement('tr');
  for (const label of ['参数', '生效值', '来源']) header.append(node('th', '', label));
  head.append(header); table.append(head);
  const body = document.createElement('tbody');
  const labels: Record<Origin, string> = { user: '用户配置', default: '官方默认', runtime: '运行时默认', derived: '运行时派生' };
  const add = (path: string, value: unknown, origin: Origin) => {
    const row = document.createElement('tr');
    row.append(node('td', 'param-key', path), node('td', 'param-value', String(value)), node('td', `origin ${origin}`, labels[origin]));
    body.append(row);
  };
  for (const [path, value] of Object.entries(flatten({ style: input.config.style }))) add(path, value, input.config.origins[path] ?? 'runtime');
  const scheme = input.config.schemes[selectedScheme];
  if (scheme) for (const [key, value] of Object.entries(scheme.colors)) add(`colors/${key}`, value, scheme.origins[key]);
  table.append(body); panel.append(table);
}

function updateControls(input: InputSnapshot) {
  const config = input.config;
  $('scenes').replaceChildren();
  for (const [index, scene] of input.scenes.entries()) {
    const button = node('button', 'scene-button');
    button.dataset.id = scene.id; button.setAttribute('aria-pressed', String(scene.id === selectedScene));
    button.append(node('span', 'scene-index', String(index + 1).padStart(2, '0')), node('span', '', scene.name));
    button.onclick = () => { selectedScene = scene.id; void render(); };
    $('scenes').append(button);
  }
  const select = $<HTMLSelectElement>('scheme'); select.replaceChildren();
  const active = new Set([config.selected.light, config.selected.dark]);
  const sorted = Object.values(config.schemes).sort((a, b) => Number(active.has(b.id)) - Number(active.has(a.id)));
  for (const scheme of sorted) {
    const option = document.createElement('option'); option.value = scheme.id; option.textContent = scheme.name;
    select.append(option);
  }
  select.value = selectedScheme;
  $<HTMLButtonElement>('dark').disabled = !config.selected.dark;
}

async function render(): Promise<BrowserReport | null> {
  const token = ++renderId;
  api.state = 'loading'; api.report = null;
  const input = snapshot?.config.ok ? snapshot : lastValid;
  if (!input) {
    api.state = 'error';
    $('preview').replaceChildren(node('div', 'empty-preview', '修正配置后，这里会自动更新。'));
    return null;
  }
  const scheme = input.config.schemes[selectedScheme];
  const scene = input.scenes.find((s) => s.id === selectedScene);
  if (!scheme || !scene) { api.state = 'error'; return null; }
  const schemeErrors = scheme.diagnostics.filter((d) => d.level === 'error');
  if (schemeErrors.length) {
    api.state = 'error';
    $('error-banner').hidden = false;
    $('error-banner').textContent = `配色「${scheme.name}」无效。当前画面不是此配色的有效结果：${schemeErrors[0].message}`;
    $('stage').classList.add('stale');
    $('stage-description').textContent = '已过期 · 上一次有效预览';
    diagnosticsPanel([...input.config.diagnostics, ...scheme.diagnostics]);
    $('render-status').textContent = '所选配色无效 · 画面已过期';
    return null;
  }
  if (snapshot?.config.ok && !disconnected && !readFailed) {
    $('error-banner').hidden = true;
    $('stage').classList.remove('stale');
  }
  if (!canvasManual) canvasDark = mode === 'dark';
  $('stage').classList.toggle('dark', canvasDark);
  $('preview').style.zoom = String(zoom);
  $('preview-title').textContent = scheme.name;
  $('scene-name').textContent = scene.name;
  $('layout-name').textContent = input.config.style.vertical_text ? '文字竖排' : input.config.style.horizontal ? '横排候选' : '竖排候选';
  $('scale-note').textContent = `${zoom === 1 ? '1:1 · ' : ''}${Math.round(zoom * 100)}%`;
  $('stage-description').textContent = disconnected || readFailed ? '连接中断 · 画面可能已过期' : snapshot?.config.ok ? '浏览器仿真' : '已过期 · 上一次有效配置';
  for (const button of $('scenes').querySelectorAll('button')) button.setAttribute('aria-pressed', String(button.dataset.id === selectedScene));
  $<HTMLSelectElement>('scheme').value = selectedScheme;
  $('light').setAttribute('aria-pressed', String(mode === 'light'));
  $('dark').setAttribute('aria-pressed', String(mode === 'dark'));
  $('swatches').replaceChildren(...['back_color', 'border_color', 'candidate_text_color', 'label_color', 'hilited_candidate_back_color', 'hilited_candidate_text_color', 'hilited_mark_color'].map((key) => {
    const swatch = node('span'); swatch.style.background = scheme.colors[key]; swatch.title = `${key}: ${scheme.colors[key]}`; return swatch;
  }));
  $('scheme-author').textContent = scheme.author;
  const root = renderCandidate(input.config, scheme, scene);
  $('preview').replaceChildren(root);
  await document.fonts.ready;
  if (token !== renderId) return null;
  refreshCandidateLayout(root);
  await nextFrame(); await nextFrame();
  if (token !== renderId) return null;
  const report = inspectRender(root, input.config, scheme, scene, input.sha256);
  currentDiagnostics = snapshot?.config.ok ? report.diagnostics : [...(snapshot?.config.diagnostics ?? [])];
  diagnosticsPanel(currentDiagnostics);
  effectivePanel(input);
  if (!snapshot?.config.ok || disconnected || readFailed) {
    api.state = 'error';
    $('render-status').textContent = disconnected || readFailed ? '连接中断 · 画面可能已过期' : '配置错误 · 画面已过期';
    return null;
  }
  const errors = report.diagnostics.filter((d) => d.level === 'error');
  const warnings = report.diagnostics.filter((d) => d.level === 'warning');
  $('render-status').textContent = errors.length ? '此配色无法正确渲染' : warnings.length ? `已更新 · ${warnings.length} 项提示` : '已更新 · 配置已同步';
  $('render-status').classList.toggle('with-warning', warnings.length > 0);
  api.report = report; api.state = errors.length ? 'error' : 'ready';
  return report;
}

async function refresh() {
  const request = ++requestId;
  try {
    const response = await fetch('/api/config', { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const next: InputSnapshot = await response.json();
    if (request !== requestId) return;
    readFailed = false;
    const previous = snapshot;
    snapshot = next;
    const basename = next.file.split(/[\\/]/).at(-1)!;
    $('filename').textContent = basename; $('filename').title = next.file;
    $('source-name').textContent = basename; $('source-name').title = next.file;
    $('source-meta').textContent = `默认配置 ${next.defaults.configVersion} · ${next.defaults.commit.slice(0, 7)}`;
    $('hash').textContent = `SHA256 ${next.sha256.slice(0, 12)}`; $('hash').title = next.sha256;
    $('source-code').textContent = next.source;
    $('error-banner').hidden = next.config.ok;
    $('stage').classList.toggle('stale', !next.config.ok);
    if (!next.config.ok) {
      $('error-banner').textContent = `${lastValid ? '画面已过期。' : ''}${next.config.diagnostics.find((d) => d.level === 'error')?.message ?? '配置无效'}`;
      currentDiagnostics = next.config.diagnostics; diagnosticsPanel(currentDiagnostics);
      api.state = 'error'; api.report = null;
    } else {
      lastValid = next;
      if (mode === 'dark' && !next.config.selected.dark) mode = 'light';
      if (!Object.hasOwn(next.config.schemes, selectedScheme) || !previous || selectedScheme === previous.config.selected[mode]) selectedScheme = next.config.selected[mode] ?? next.config.selected.light;
      if (!next.scenes.some((s) => s.id === selectedScene)) selectedScene = next.scenes[0].id;
      updateControls(next);
    }
    await render();
  } catch (error) {
    readFailed = true;
    api.state = 'error'; api.report = null;
    $('connection').textContent = '连接中断'; $('connection').classList.add('offline');
    $('error-banner').hidden = false; $('error-banner').textContent = `无法读取配置：${(error as Error).message}。当前画面不可作为最新结果。`;
    $('stage').classList.add('stale');
  }
}

api.select = async ({ scheme, scene }) => {
  if (!snapshot?.config.ok || disconnected || readFailed) throw new Error('当前配置无效或监听连接中断，不能生成截图。');
  if (scheme) {
    if (!Object.hasOwn(snapshot.config.schemes, scheme)) throw new Error(`找不到配色 ${scheme}`);
    selectedScheme = scheme;
    mode = scheme === snapshot.config.selected.dark ? 'dark' : 'light';
  }
  if (scene) {
    if (!snapshot.scenes.some((s) => s.id === scene)) throw new Error(`找不到场景 ${scene}`);
    selectedScene = scene;
  }
  zoom = 1; $<HTMLSelectElement>('zoom').value = '1';
  const report = await render();
  if (!report || api.state === 'error') throw new Error('渲染失败。');
  return report;
};

$<HTMLSelectElement>('scheme').onchange = (e) => { selectedScheme = (e.target as HTMLSelectElement).value; mode = selectedScheme === snapshot?.config.selected.dark ? 'dark' : 'light'; void render(); };
for (const key of ['light', 'dark'] as const) $(key).onclick = () => {
  const input = snapshot?.config.ok ? snapshot : lastValid;
  const id = input?.config.selected[key];
  if (id) { selectedScheme = id; mode = key; void render(); }
};
$<HTMLSelectElement>('zoom').onchange = (e) => { zoom = Number((e.target as HTMLSelectElement).value); void render(); };
$('canvas-tone').onclick = () => { canvasManual = true; canvasDark = !canvasDark; void render(); };
$('inspect-button').onclick = () => { $<HTMLDetailsElement>('inspector').open = true; $('inspector').scrollIntoView({ behavior: 'smooth', block: 'start' }); };
const tabs = [...document.querySelectorAll<HTMLButtonElement>('[data-panel]')];
for (const tab of tabs) {
  const activate = () => {
    for (const button of tabs) { const active = button === tab; button.setAttribute('aria-selected', String(active)); button.tabIndex = active ? 0 : -1; $(`panel-${button.dataset.panel}`).hidden = !active; }
  };
  tab.onclick = activate;
  tab.onkeydown = (event) => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    const next = tabs[(tabs.indexOf(tab) + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length]; next.click(); next.focus();
  };
  tab.tabIndex = tab.getAttribute('aria-selected') === 'true' ? 0 : -1;
}

if (import.meta.hot) {
  import.meta.hot.on('weasel:updated', () => { void refresh(); });
  import.meta.hot.on('vite:ws:connect', () => { disconnected = false; $('connection').textContent = '实时同步'; $('connection').classList.remove('offline'); void refresh(); });
  import.meta.hot.on('vite:ws:disconnect', () => { disconnected = true; $('connection').textContent = '连接中断'; $('connection').classList.add('offline'); $('stage').classList.add('stale'); api.state = 'error'; api.report = null; $('error-banner').hidden = false; $('error-banner').textContent = '文件监听连接中断，当前画面可能已过期。'; });
}
if (capture) $('connection').textContent = '固定快照';
else $('connection').textContent = '实时同步';
let resizeTimer: ReturnType<typeof setTimeout> | undefined;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { void render(); }, 80);
});
await refresh();
