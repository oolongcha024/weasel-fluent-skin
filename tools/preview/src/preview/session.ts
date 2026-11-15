import type { Diagnostic } from '../core/diagnostics';
import { uniqueDiagnostics } from '../core/diagnostics';
import type { InputSnapshot } from '../input/snapshot';
import { sameIdentity } from '../input/identity';
import { SupersededRender, type BrowserReport, type PreviewRenderer } from './report';

export interface Selection { scheme: string; scene: string; mode: 'light' | 'dark'; zoom: number; canvasDark: boolean }
export type PreviewEvent = { type: 'refresh' } | { type: 'connection'; connected: boolean }
  | { type: 'select'; scheme?: string; scene?: string; mode?: 'light' | 'dark' }
  | { type: 'zoom'; zoom: number } | { type: 'canvas' } | { type: 'repaint' };
export interface PreviewView {
  state: 'loading' | 'ready' | 'error'; freshness: 'empty' | 'current' | 'stale';
  snapshot: InputSnapshot | null; displayInput: InputSnapshot | null;
  report: BrowserReport | null; displayedReport: BrowserReport | null;
  selection: Readonly<Selection>; connected: boolean; reason: string | null; diagnostics: Diagnostic[];
}

/** Owns freshness, selection and concurrent requests. Renderer and input transport
 * are real seams: browser adapters in production, controlled adapters in tests.
 */
export class PreviewSession {
  private snapshot: InputSnapshot | null = null;
  private lastValid: InputSnapshot | null = null;
  private report: BrowserReport | null = null;
  private displayedReport: BrowserReport | null = null;
  private selection: Selection = { scheme: '', scene: '', mode: 'light', zoom: 1, canvasDark: false };
  private manualCanvas = false;
  private connected = true;
  private readFailed = false;
  private reading = false;
  private state: PreviewView['state'] = 'loading';
  private reason: string | null = null;
  private revision = 0;
  private loadGeneration = 0;
  private disposed = false;
  private listeners = new Set<(view: PreviewView) => void>();

  constructor(private renderer: PreviewRenderer, private readInput: () => Promise<InputSnapshot>) {}

  get view(): PreviewView {
    const displayInput = this.snapshot?.config.ok ? this.snapshot : this.lastValid;
    const diagnostics = this.snapshot && !this.snapshot.config.ok ? this.snapshot.config.diagnostics
      : this.report?.diagnostics ?? [...(displayInput?.config.diagnostics ?? []), ...(displayInput?.config.schemes[this.selection.scheme]?.diagnostics ?? [])];
    return { state: this.state, freshness: this.report ? 'current' : this.displayedReport ? 'stale' : 'empty',
      snapshot: this.snapshot, displayInput, report: this.report, displayedReport: this.displayedReport,
      selection: { ...this.selection }, connected: this.connected, reason: this.reason, diagnostics: uniqueDiagnostics(diagnostics) };
  }
  subscribe(listener: (view: PreviewView) => void) { this.listeners.add(listener); listener(this.view); return () => { this.listeners.delete(listener); }; }
  private emit() { const view = this.view; for (const listener of this.listeners) listener(view); }
  private invalidate(reason: string | null, state: PreviewView['state']) {
    this.revision++; this.report = null; this.reason = reason; this.state = state; this.emit();
  }
  private choose(options: { scheme?: string; scene?: string; mode?: 'light' | 'dark' }, strict = false) {
    const input = this.view.displayInput;
    if (!input) { if (strict) throw new Error('配置尚未准备好。'); return; }
    let scheme = options.mode ? input.config.selected[options.mode] : options.scheme;
    if (options.mode === 'dark' && !scheme) return;
    if (scheme !== undefined && scheme !== null) {
      if (!Object.hasOwn(input.config.schemes, scheme)) throw new Error(`找不到配色 ${scheme}`);
      if (strict && input.config.schemes[scheme].diagnostics.some((d) => d.level === 'error')) throw new Error('指定配色有无效设置。');
    }
    if (options.scene && !input.scenes.some((s) => s.id === options.scene)) throw new Error(`找不到场景 ${options.scene}`);
    if (scheme) {
      this.selection.scheme = scheme;
      this.selection.mode = scheme === input.config.selected.dark ? 'dark' : 'light';
    }
    if (options.scene) this.selection.scene = options.scene;
    if (!this.manualCanvas) this.selection.canvasDark = this.selection.mode === 'dark';
  }
  async dispatch(event: PreviewEvent): Promise<BrowserReport | null> {
    if (this.disposed) throw new Error('预览已关闭。');
    if (event.type === 'connection') {
      this.connected = event.connected;
      if (!event.connected) { this.loadGeneration++; this.reading = false; this.invalidate('文件监听连接中断，当前画面可能已过期。', 'error'); return null; }
      return this.refresh();
    }
    if (event.type === 'refresh') return this.refresh();
    if (event.type === 'select') this.choose(event);
    if (event.type === 'zoom') {
      if (!Number.isFinite(event.zoom) || event.zoom <= 0) throw new Error('预览缩放必须为正数。');
      this.selection.zoom = event.zoom;
    }
    if (event.type === 'canvas') { this.manualCanvas = true; this.selection.canvasDark = !this.selection.canvasDark; }
    return this.render();
  }
  private async refresh() {
    const generation = ++this.loadGeneration;
    this.reading = true; this.invalidate(null, 'loading');
    try {
      const next = await this.readInput();
      if (this.disposed || generation !== this.loadGeneration) return null;
      this.reading = false; this.readFailed = false;
      const previous = this.snapshot;
      this.snapshot = next;
      if (next.config.ok) {
        this.lastValid = next;
        if (this.selection.mode === 'dark' && !next.config.selected.dark) this.selection.mode = 'light';
        if (!Object.hasOwn(next.config.schemes, this.selection.scheme) || !previous || this.selection.scheme === previous.config.selected[this.selection.mode]) {
          this.selection.scheme = next.config.selected[this.selection.mode] ?? next.config.selected.light;
        }
        if (!next.scenes.some((s) => s.id === this.selection.scene)) this.selection.scene = next.scenes[0].id;
        if (!this.manualCanvas) this.selection.canvasDark = this.selection.mode === 'dark';
      }
      return this.render();
    } catch (error) {
      if (this.disposed || generation !== this.loadGeneration) return null;
      this.reading = false; this.readFailed = true;
      this.invalidate(`无法读取配置：${(error as Error).message}。当前画面不可作为最新结果。`, 'error'); return null;
    }
  }
  private async render(): Promise<BrowserReport | null> {
    const token = ++this.revision;
    this.report = null; this.state = 'loading'; this.reason = null; this.emit();
    const input = this.view.displayInput;
    if (!input) { this.state = 'error'; this.reason = this.snapshot?.config.diagnostics.find((d) => d.level === 'error')?.message ?? '配置尚未准备好。'; this.emit(); return null; }
    const scheme = input.config.schemes[this.selection.scheme], scene = input.scenes.find((s) => s.id === this.selection.scene);
    const schemeError = scheme?.diagnostics.find((d) => d.level === 'error');
    if (!scheme || !scene || schemeError) {
      this.state = 'error'; this.reason = schemeError ? `配色「${scheme.name}」无效：${schemeError.message}` : '所选配色或场景不可用。'; this.emit(); return null;
    }
    try {
      const report = await this.renderer.render({ style: input.config.style, scheme, scene, identity: input.identity, diagnostics: input.config.diagnostics });
      if (this.disposed || token !== this.revision) return null;
      if (!sameIdentity(report.identity, input.identity) || report.scheme !== scheme.id || report.scene !== scene.id) throw new Error('渲染结果与请求快照或选择不一致。');
      this.displayedReport = report;
      if (!this.snapshot?.config.ok || !this.connected || this.readFailed || this.reading) {
        this.state = 'error'; this.reason = !this.connected || this.readFailed ? '连接中断 · 画面可能已过期' : this.reading ? '正在读取更新后的配置。' : this.snapshot?.config.diagnostics.find((d) => d.level === 'error')?.message ?? '当前配置无效。';
      } else if (report.diagnostics.some((d) => d.level === 'error')) { this.state = 'error'; this.reason = '此配色无法正确渲染。'; }
      else { this.report = report; this.state = 'ready'; }
      this.emit(); return this.report;
    } catch (error) {
      if (this.disposed || token !== this.revision || error instanceof SupersededRender) return null;
      this.state = 'error'; this.reason = (error as Error).message; this.emit(); return null;
    }
  }
  async capture(options: { scheme?: string; scene?: string }): Promise<BrowserReport> {
    if (this.disposed || !this.snapshot?.config.ok || !this.connected || this.readFailed || this.reading) throw new Error('当前配置无效或监听连接中断，不能生成截图。');
    this.choose(options, true); this.selection.zoom = 1;
    const report = await this.render();
    if (!report) throw new Error('渲染失败或已被新的请求取代。');
    return report;
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true; this.loadGeneration++; this.revision++;
    this.report = null; this.displayedReport = null; this.state = 'error'; this.reason = '预览已关闭。';
    this.listeners.clear(); this.renderer.dispose();
  }
}
