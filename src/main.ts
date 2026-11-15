import './style.css';
import { createBrowserPreview } from './render/preview';
import { PreviewSession, type PreviewView } from './preview/session';
import type { PreviewAutomation } from './preview/automation';
import { uniqueDiagnostics, type Diagnostic } from './core/diagnostics';
import { flatten } from './core/patch';
import type { Origin, ColorKey } from './core/config-model';
import type { InputSnapshot } from './input/snapshot';

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
const session = new PreviewSession(createBrowserPreview($('preview')), async () => {
  const response = await fetch('/api/config', { cache: 'no-store' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json() as Promise<InputSnapshot>;
});
const automation: PreviewAutomation = {
  get state() { return session.view.state; },
  get report() { return session.view.report; },
  select: (options) => session.capture(options),
};
window.__WEASEL_PREVIEW__ = automation;
let controlsInput: InputSnapshot | null = null;

function diagnosticsPanel(items: Diagnostic[]) {
  const panel = $('panel-diagnostics'); panel.replaceChildren();
  const unique = uniqueDiagnostics(items);
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
  if (session.view.snapshot && !session.view.snapshot.config.ok) panel.append(node('p', 'stale-note', '以下为上一次有效配置，当前文件有错误。'));
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
  const scheme = input.config.schemes[session.view.selection.scheme];
  if (scheme) for (const [key, value] of Object.entries(scheme.colors)) add(`colors/${key}`, value, scheme.origins[key]);
  table.append(body); panel.append(table);
}

function updateControls(input: InputSnapshot) {
  const config = input.config;
  $('scenes').replaceChildren();
  for (const [index, scene] of input.scenes.entries()) {
    const button = node('button', 'scene-button');
    button.dataset.id = scene.id; button.setAttribute('aria-pressed', String(scene.id === session.view.selection.scene));
    button.append(node('span', 'scene-index', String(index + 1).padStart(2, '0')), node('span', '', scene.name));
    button.onclick = () => { void session.dispatch({ type: 'select', scene: scene.id }); };
    $('scenes').append(button);
  }
  const select = $<HTMLSelectElement>('scheme'); select.replaceChildren();
  const active = new Set([config.selected.light, config.selected.dark]);
  const sorted = Object.values(config.schemes).sort((a, b) => Number(active.has(b.id)) - Number(active.has(a.id)));
  for (const scheme of sorted) {
    const option = document.createElement('option'); option.value = scheme.id; option.textContent = scheme.name;
    select.append(option);
  }
  select.value = session.view.selection.scheme;
  $<HTMLButtonElement>('dark').disabled = !config.selected.dark;
}

function paintWorkbench(view: PreviewView) {
  const { snapshot, displayInput: input, selection, report } = view;
  if (snapshot) {
    const basename = snapshot.file.split(/[\\/]/).at(-1)!;
    $('filename').textContent = basename; $('filename').title = snapshot.file;
    $('source-name').textContent = basename; $('source-name').title = snapshot.file;
    $('source-meta').textContent = `默认配置 ${snapshot.defaults.configVersion} · ${snapshot.defaults.commit.slice(0, 7)}`;
    $('hash').textContent = `SHA256 ${snapshot.sha256.slice(0, 12)}`; $('hash').title = snapshot.sha256;
    $('source-code').textContent = snapshot.source;
  }
  $('connection').textContent = !view.connected ? '连接中断' : capture ? '固定快照' : '实时同步';
  $('connection').classList.toggle('offline', !view.connected);
  $('error-banner').hidden = view.state !== 'error';
  $('error-banner').textContent = view.reason ?? '';
  $('stage').classList.toggle('stale', view.freshness === 'stale' || view.state === 'error');
  $('stage').classList.toggle('dark', selection.canvasDark);
  $('preview').style.zoom = String(selection.zoom);
  $<HTMLSelectElement>('zoom').value = String(selection.zoom);
  $('scale-note').textContent = `${selection.zoom === 1 ? '1:1 · ' : ''}${Math.round(selection.zoom * 100)}%`;
  $('stage-description').textContent = view.freshness === 'stale' ? '已过期 · 上一次有效预览' : '浏览器仿真';
  if (input) {
    if (controlsInput !== input) { controlsInput = input; updateControls(input); }
    const scheme = input.config.schemes[selection.scheme], scene = input.scenes.find((s) => s.id === selection.scene);
    $('preview-title').textContent = scheme?.name ?? '皮肤预览';
    $('scene-name').textContent = scene?.name ?? '—';
    $('layout-name').textContent = input.config.style.vertical_text ? '文字竖排' : input.config.style.horizontal ? '横排候选' : '竖排候选';
    for (const button of $('scenes').querySelectorAll('button')) button.setAttribute('aria-pressed', String(button.dataset.id === selection.scene));
    $<HTMLSelectElement>('scheme').value = selection.scheme;
    $('light').setAttribute('aria-pressed', String(selection.mode === 'light'));
    $('dark').setAttribute('aria-pressed', String(selection.mode === 'dark'));
    if (scheme) {
      $('swatches').replaceChildren(...(['back_color', 'border_color', 'candidate_text_color', 'label_color', 'hilited_candidate_back_color', 'hilited_candidate_text_color', 'hilited_mark_color'] as ColorKey[]).map((key) => {
        const swatch = node('span'); swatch.style.background = scheme.colors[key]; swatch.title = `${key}: ${scheme.colors[key]}`; return swatch;
      }));
      $('scheme-author').textContent = scheme.author;
    }
    effectivePanel(input);
  } else if (view.state === 'error') $('preview').replaceChildren(node('div', 'empty-preview', '修正配置后，这里会自动更新。'));
  diagnosticsPanel(view.diagnostics);
  const warnings = report?.diagnostics.filter((d) => d.level === 'warning').length ?? 0;
  $('render-status').textContent = view.state === 'loading' ? '正在更新预览…' : view.state === 'error' ? view.connected ? '配置错误 · 画面已过期' : '连接中断 · 画面可能已过期'
    : warnings ? `已更新 · ${warnings} 项提示` : '已更新 · 配置已同步';
  $('render-status').classList.toggle('with-warning', warnings > 0);
}
session.subscribe(paintWorkbench);

$<HTMLSelectElement>('scheme').onchange = (e) => { void session.dispatch({ type: 'select', scheme: (e.target as HTMLSelectElement).value }); };
for (const mode of ['light', 'dark'] as const) $(mode).onclick = () => { void session.dispatch({ type: 'select', mode }); };
$<HTMLSelectElement>('zoom').onchange = (e) => { void session.dispatch({ type: 'zoom', zoom: Number((e.target as HTMLSelectElement).value) }); };
$('canvas-tone').onclick = () => { void session.dispatch({ type: 'canvas' }); };
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
  import.meta.hot.on('weasel:updated', () => { void session.dispatch({ type: 'refresh' }); });
  import.meta.hot.on('vite:ws:connect', () => { void session.dispatch({ type: 'connection', connected: true }); });
  import.meta.hot.on('vite:ws:disconnect', () => { void session.dispatch({ type: 'connection', connected: false }); });
  import.meta.hot.dispose(() => session.dispose());
}
let resizeTimer: ReturnType<typeof setTimeout> | undefined;
window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { void session.dispatch({ type: 'repaint' }); }, 80); });
await session.dispatch({ type: 'refresh' });
