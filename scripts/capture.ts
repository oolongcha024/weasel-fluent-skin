import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { ROOT, startServer } from '../src/server/server';
import { options } from './options';
import type { BrowserReport } from '../src/core/types';

const viewport = { width: 1600, height: 1000 };

async function capture() {
  const args = options('capture');
  const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;
  const directory = join(args.out, runId);
  await mkdir(directory, { recursive: true });
  const manifest: Record<string, unknown> = {
    schemaVersion: 1, status: 'failed', runId, createdAt: new Date().toISOString(),
    viewport, deviceScaleFactor: args.dpr, zoom: 1, layoutBasis: 'weasel-0.17.4', screenshots: [], diagnostics: [],
  };
  let instance: Awaited<ReturnType<typeof startServer>> | undefined;
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  let failed = false;
  try {
    // A frozen server snapshot ensures every scene uses the same input version.
    instance = await startServer({ ...args, live: false });
    const { snapshot, url } = instance;
    Object.assign(manifest, {
      input: { path: snapshot.file, sha256: snapshot.sha256, readAt: snapshot.readAt },
      defaults: snapshot.defaults, scenesSha256: snapshot.scenesSha256,
      diagnostics: snapshot.config.diagnostics,
    });
    await Promise.all([
      writeFile(join(directory, 'input.yaml'), snapshot.source),
      writeFile(join(directory, 'effective.json'), JSON.stringify({
        ...snapshot.config, defaults: snapshot.defaults, sha256: snapshot.sha256,
      }, null, 2)),
      writeFile(join(directory, 'scenes.json'), JSON.stringify(snapshot.scenes, null, 2)),
    ]);
    if (!snapshot.config.ok) throw new Error('配置无效，已写入诊断；未生成截图。');
    const schemes = args.scheme ? [args.scheme] : [...new Set([snapshot.config.selected.light, snapshot.config.selected.dark].filter((s): s is string => !!s))];
    if (schemes.some((id) => !Object.hasOwn(snapshot.config.schemes, id))) throw new Error('指定的配色方案不存在。');
    if (schemes.some((id) => snapshot.config.schemes[id].diagnostics.some((d) => d.level === 'error'))) throw new Error('指定配色有无效设置，未生成截图。');
    browser = await chromium.launch();
    manifest.browser = browser.version();
    const page = await browser.newPage({ viewport, deviceScaleFactor: args.dpr, colorScheme: 'light', locale: 'zh-CN', reducedMotion: 'reduce' });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${url}/?capture=1`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__WEASEL_PREVIEW__ && window.__WEASEL_PREVIEW__.state !== 'loading');
    const shots: Record<string, unknown>[] = [];
    const allDiagnostics = [...snapshot.config.diagnostics];
    const rendererCss = await readFile(join(ROOT, 'src/render/candidate.css'), 'utf8');
    for (const [schemeIndex, scheme] of schemes.entries()) {
      for (const scene of snapshot.scenes) {
        const report: BrowserReport = await page.evaluate(async ({ scheme, scene }) => window.__WEASEL_PREVIEW__.select({ scheme, scene }), { scheme, scene: scene.id });
        if (report.sha256 !== snapshot.sha256) throw new Error('页面输入摘要与当前快照不一致。');
        if (errors.length) throw new Error(`浏览器渲染错误：${errors.join('; ')}`);
        const stem = `${String(schemeIndex + 1).padStart(2, '0')}-${scene.id}`;
        allDiagnostics.push(...report.diagnostics);
        await page.screenshot({ path: join(directory, `${stem}.png`), fullPage: true, animations: 'disabled' });
        const isDark = scheme === snapshot.config.selected.dark;
        const standaloneHtml = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Weasel preview</title><style>${rendererCss}\nbody{margin:0;min-height:100vh;display:grid;place-items:center;background:${isDark ? '#20252e' : '#f0f2f6'};--editor-ink:${isDark ? '#a9b4c4' : '#555e6d'}}</style><body>${report.html}</body></html>`;
        await Promise.all([
          writeFile(join(directory, `${stem}.json`), JSON.stringify(report, null, 2)),
          writeFile(join(directory, `${stem}.html`), standaloneHtml),
        ]);
        shots.push({ scheme, scene: scene.id, image: `${stem}.png`, report: `${stem}.json`, html: `${stem}.html` });
        manifest.screenshots = shots;
      }
    }
    const reports = await page.evaluate(() => window.__WEASEL_PREVIEW__.report);
    manifest.status = 'complete';
    manifest.diagnostics = [...new Map(allDiagnostics.map((d) => [`${d.code}:${d.path}:${d.message}`, d])).values()];
    manifest.note = '浏览器仿真；字体可用性和每个场景的限制见对应 JSON。未自动修正配置。';
    manifest.lastRenderedInput = reports?.sha256;
  } catch (error) {
    failed = true;
    manifest.error = (error as Error).message;
    console.error((error as Error).message);
    if ((error as Error).message.includes('Executable doesn\'t exist')) console.error('请先执行 pnpm browser:install。');
  } finally {
    await browser?.close();
    await instance?.server.close();
    await writeFile(join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2));
    console.log(`\n检查结果：${directory}\n状态：${manifest.status}`);
  }
  if (failed) process.exitCode = 1;
}

await capture().catch((error: Error) => { console.error(error.message); process.exitCode = 1; });
