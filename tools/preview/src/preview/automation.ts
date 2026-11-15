import type { BrowserReport } from './report';
export interface PreviewAutomation {
  readonly state: 'loading' | 'ready' | 'error';
  readonly report: BrowserReport | null;
  select(options: { scheme?: string; scene?: string }): Promise<BrowserReport>;
}
declare global { interface Window { __WEASEL_PREVIEW__: PreviewAutomation } }
