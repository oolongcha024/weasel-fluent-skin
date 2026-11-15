import { join } from 'node:path';
import { chromium } from 'playwright';
import { startServer } from '../server/server';
import { uniqueDiagnostics } from '../core/diagnostics';
import { sameIdentity } from '../input/identity';
import { createCaptureBundle } from './bundle';
import type { BrowserReport } from '../preview/report';
import type {} from '../preview/automation';

export interface CaptureOptions { config: string; scenes?: string; port?: number; out: string; scheme?: string; dpr: number }

/** One frozen run, including resource ownership, consistency checks and failure artifacts. */
export async function capturePreview(args: CaptureOptions) {
  if (!Number.isFinite(args.dpr) || args.dpr < .5 || args.dpr > 4) throw new Error('截图 DPR 应在 0.5–4 之间。');
  const bundle = await createCaptureBundle(args.out, args.dpr), { manifest } = bundle;
  let instance: Awaited<ReturnType<typeof startServer>> | undefined;
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    instance = await startServer({ ...args, live: false });
    const { snapshot, url } = instance;
    await bundle.input(snapshot);
    if (!snapshot.config.ok) throw new Error('配置无效，已写入诊断；未生成截图。');
    const schemes = args.scheme ? [args.scheme] : [...new Set([snapshot.config.selected.light, snapshot.config.selected.dark].filter((s): s is string => !!s))];
    if (schemes.some((id) => !Object.hasOwn(snapshot.config.schemes, id))) throw new Error('指定的配色方案不存在。');
    if (schemes.some((id) => snapshot.config.schemes[id].diagnostics.some((d) => d.level === 'error'))) throw new Error('指定配色有无效设置，未生成截图。');
    browser = await chromium.launch(); manifest.browser = browser.version();
    const page = await browser.newPage({ viewport: manifest.viewport, deviceScaleFactor: args.dpr, colorScheme: 'light', locale: 'zh-CN', reducedMotion: 'reduce' });
    const errors: string[] = []; page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${url}/?capture=1`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__WEASEL_PREVIEW__?.state !== undefined && window.__WEASEL_PREVIEW__.state !== 'loading');
    const diagnostics = [...snapshot.config.diagnostics];
    for (const [schemeIndex, scheme] of schemes.entries()) for (const scene of snapshot.scenes) {
      const report: BrowserReport = await page.evaluate(({ scheme, scene }) => window.__WEASEL_PREVIEW__.select({ scheme, scene }), { scheme, scene: scene.id });
      if (!sameIdentity(report.identity, snapshot.identity) || report.scheme !== scheme || report.scene !== scene.id) throw new Error('页面渲染结果与本次固定快照不一致。');
      if (errors.length) throw new Error(`浏览器渲染错误：${errors.join('; ')}`);
      if (report.diagnostics.some((d) => d.level === 'error')) throw new Error('页面包含渲染错误，未采用此结果。');
      const stem = `${String(schemeIndex + 1).padStart(2, '0')}-${scene.id}`;
      diagnostics.push(...report.diagnostics);
      await page.screenshot({ path: join(bundle.directory, `${stem}.png`), fullPage: true, animations: 'disabled' });
      await bundle.shot(stem, report, scheme === snapshot.config.selected.dark);
      manifest.lastRenderedInput = report.sha256;
    }
    manifest.status = 'complete'; manifest.diagnostics = uniqueDiagnostics(diagnostics);
    manifest.note = '浏览器仿真；字体可用性和每个场景的限制见对应 JSON。未自动修正配置。';
  } catch (error) { manifest.status = 'failed'; manifest.error = (error as Error).message; }
  finally {
    const cleanup = await Promise.allSettled([browser?.close(), instance?.server.close()]);
    const failed = cleanup.find((r) => r.status === 'rejected');
    if (failed?.status === 'rejected') { manifest.status = 'failed'; manifest.error = [manifest.error, `清理失败：${String(failed.reason)}`].filter(Boolean).join('；'); }
    await bundle.finish();
  }
  return { directory: bundle.directory, manifest };
}
